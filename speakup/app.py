"""
=========================================================================
SpeakUp — Bilingual Pronunciation Coach (English + Jordanian Arabic)
=========================================================================

A Duolingo-Speak-style web app that:
  1. SPEAKS phrases in native-quality voices via Azure TTS
       - en-US : American English (Jenny / Guy / Aria neural voices)
       - ar-JO : Jordanian Arabic dialect (Sana + Taim neural voices) ✨
  2. LISTENS to the user reading those phrases out loud and SCORES them
     using Azure's Pronunciation Assessment (accuracy / fluency /
     completeness + word-level pronunciation scores).

WHY AZURE?
  Out of the major cloud TTS+STT providers, Azure is the ONLY one that
  ships ar-JO neural voices (real Jordanian dialect — Modern Standard
  Arabic ≠ Jordanian) AND offers pronunciation assessment for ar-JO.
  Their free tier (F0) covers 5 audio hours per month — plenty for
  practice.

WHY THE BROWSER (NOT THE SERVER) RUNS PRONUNCIATION ASSESSMENT?
  We could send the user's audio to Flask and let Python call Azure. That
  works, but you'd have to convert the browser's WebM/Opus recording into
  WAV/PCM, deal with chunked uploads, etc. The MUCH simpler path is:
       Server  →  issues a 10-minute auth token
       Browser →  uses Microsoft's Speech SDK directly with that token
  That way the API key never leaves the server, the browser handles mic
  capture / encoding / streaming in one shot, and the user gets the
  result in ~1 second.

ROUTES
  GET  /                       → renders templates/index.html
  GET  /api/lessons            → returns lessons.json
  POST /api/tts                → proxies Azure TTS, streams MP3 back
  GET  /api/speech-token       → returns a short-lived Azure auth token
  GET  /api/progress           → returns saved user progress
  POST /api/progress           → updates saved user progress

PRONUNCIATION ASSESSMENT — HOW IT WORKS UNDER THE HOOD
  Azure breaks every spoken word into PHONEMES (the smallest sound units
  of a language — about 44 in English, ~28 in MSA/Jordanian Arabic).
  For each phoneme it compares the energy / pitch / timing of what the
  user produced against a native model and scores:
      accuracyScore     — how close each sound is to native
      fluencyScore      — pauses, hesitations, rhythm
      completenessScore — did you say all the words
      pronunciationScore = weighted blend of the three
  It also returns per-word scores ⇒ we colour each word green/red.

SPEECH RECOGNITION vs PRONUNCIATION ASSESSMENT — WHAT'S THE DIFFERENCE?
  Speech Recognition just transcribes what you said into text.
  Pronunciation Assessment ALSO transcribes, but on top of that it
  compares what you said to a REFERENCE TEXT and grades the gap. It's
  a superset designed for language-learning apps.
=========================================================================
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from flask import (
    Flask,
    Response,
    abort,
    jsonify,
    render_template,
    request,
    stream_with_context,
)
from flask_cors import CORS


# ─── Setup ────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_REGION     = os.getenv("AZURE_REGION", "eastus").strip()
TTS_VOICE_AR     = os.getenv("TTS_VOICE_AR", "ar-JO-SanaNeural").strip()
TTS_VOICE_EN     = os.getenv("TTS_VOICE_EN", "en-US-JennyNeural").strip()

LESSONS_PATH  = BASE_DIR / "lessons.json"
PROGRESS_PATH = BASE_DIR / "progress.json"

app = Flask(__name__)
CORS(app)


# ─── Helpers ──────────────────────────────────────────────────────────────
def _have_azure() -> bool:
    """True only when both AZURE_SPEECH_KEY and AZURE_REGION are present."""
    return bool(AZURE_SPEECH_KEY and AZURE_REGION)


def _voice_for_language(language: str) -> str:
    """Map a BCP-47 locale to the configured neural voice name."""
    if language.lower().startswith("ar"):
        return TTS_VOICE_AR
    return TTS_VOICE_EN


def _ssml(text: str, language: str, speed: float) -> str:
    """
    Build SSML (Speech Synthesis Markup Language) for Azure TTS.

    SSML is XML that lets you control prosody. We use <prosody rate>
    so the front-end can offer slow / normal / fast playback by passing
    a speed multiplier (0.7 / 1.0 / 1.2).
    """
    voice    = _voice_for_language(language)
    rate_pct = int(round((max(0.5, min(1.5, speed)) - 1.0) * 100))
    rate     = f"{rate_pct:+d}%"  # "+0%", "-30%", "+20%", …

    safe = (
        text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
    )
    return (
        f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' "
        f"xml:lang='{language}'>"
        f"  <voice name='{voice}'>"
        f"    <prosody rate='{rate}'>{safe}</prosody>"
        f"  </voice>"
        f"</speak>"
    )


def _load_progress() -> dict[str, Any]:
    if not PROGRESS_PATH.exists():
        return {"streak": 0, "last_practice_iso": None, "scores": [], "completed": []}
    try:
        return json.loads(PROGRESS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"streak": 0, "last_practice_iso": None, "scores": [], "completed": []}


def _save_progress(progress: dict[str, Any]) -> None:
    PROGRESS_PATH.write_text(
        json.dumps(progress, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ─── Routes ───────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/lessons", methods=["GET"])
def api_lessons():
    """Return the full lesson catalogue (lessons.json)."""
    if not LESSONS_PATH.exists():
        abort(500, "lessons.json missing on the server")
    try:
        data = json.loads(LESSONS_PATH.read_text(encoding="utf-8"))
        return jsonify(data)
    except Exception as exc:
        return jsonify({"error": f"failed to read lessons.json: {exc}"}), 500


@app.route("/api/speech-token", methods=["GET"])
def api_speech_token():
    """
    Issue a short-lived Azure auth token (10 minutes).

    The browser uses this token with the JavaScript Speech SDK to perform
    Pronunciation Assessment WITHOUT ever seeing your AZURE_SPEECH_KEY.
    """
    if not _have_azure():
        return jsonify({
            "error": "Azure Speech is not configured. "
                     "Add AZURE_SPEECH_KEY and AZURE_REGION to .env"
        }), 503

    url = f"https://{AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    try:
        r = requests.post(
            url,
            headers={
                "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
                "Content-Length": "0",
            },
            timeout=10,
        )
    except requests.RequestException as exc:
        return jsonify({"error": f"could not reach Azure: {exc}"}), 502

    if r.status_code != 200:
        return jsonify({
            "error": "azure rejected token request",
            "status": r.status_code,
            "detail": r.text[:300],
        }), 502

    return jsonify({
        "token": r.text,
        "region": AZURE_REGION,
        "expires_in": 540,  # ~9 min — refresh before the 10-min hard limit
    })


@app.route("/api/tts", methods=["POST"])
def api_tts():
    """
    Body : { text, language ('en-US' | 'ar-JO'), speed (0.5..1.5) }
    Returns: streamed audio/mpeg (MP3) bytes.

    Why MP3 instead of raw WAV? MP3 is ~10× smaller and every browser
    plays it natively from a Blob URL.
    """
    if not _have_azure():
        return jsonify({
            "error": "Azure Speech is not configured. "
                     "Add AZURE_SPEECH_KEY and AZURE_REGION to .env"
        }), 503

    payload = request.get_json(silent=True) or {}
    text     = (payload.get("text") or "").strip()
    language = (payload.get("language") or "en-US").strip()
    speed    = float(payload.get("speed") or 1.0)

    if not text:
        return jsonify({"error": "text is required"}), 400
    if len(text) > 800:
        return jsonify({"error": "text too long (>800 chars)"}), 400

    ssml = _ssml(text, language, speed)
    url  = f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "speakup-app",
    }

    try:
        r = requests.post(url, headers=headers, data=ssml.encode("utf-8"),
                          timeout=20, stream=True)
    except requests.RequestException as exc:
        return jsonify({"error": f"could not reach Azure: {exc}"}), 502

    if r.status_code != 200:
        # Surface Azure's error so the user can debug (e.g. quota exceeded)
        return jsonify({
            "error": "azure tts failed",
            "status": r.status_code,
            "detail": r.text[:400],
        }), 502

    def generate():
        try:
            for chunk in r.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        finally:
            r.close()

    return Response(
        stream_with_context(generate()),
        mimetype="audio/mpeg",
        headers={"Cache-Control": "no-store"},
    )


@app.route("/api/progress", methods=["GET", "POST"])
def api_progress():
    """
    GET  → returns the saved progress JSON
    POST → body { lesson_id, score (0..100), timestamp? } – appends a score
            and updates streak.
    """
    progress = _load_progress()

    if request.method == "GET":
        return jsonify(progress)

    body       = request.get_json(silent=True) or {}
    lesson_id  = (body.get("lesson_id") or "").strip()
    score      = float(body.get("score") or 0)
    timestamp  = (body.get("timestamp") or time.strftime("%Y-%m-%dT%H:%M:%S")).strip()

    if not lesson_id:
        return jsonify({"error": "lesson_id is required"}), 400

    progress["scores"].append({
        "lesson_id": lesson_id,
        "score": score,
        "timestamp": timestamp,
    })

    if lesson_id not in progress["completed"]:
        progress["completed"].append(lesson_id)

    today = timestamp.split("T")[0]
    last  = (progress.get("last_practice_iso") or "").split("T")[0]
    if last != today:
        progress["streak"] = int(progress.get("streak") or 0) + (1 if last else 1)
    progress["last_practice_iso"] = timestamp

    _save_progress(progress)
    return jsonify(progress)


# ─── Entry point ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    if _have_azure():
        print(f"[SpeakUp] Azure Speech ready in region: {AZURE_REGION}")
    else:
        print("[SpeakUp] WARNING: AZURE_SPEECH_KEY / AZURE_REGION not set.")
        print("[SpeakUp]          TTS and pronunciation scoring will not work.")
        print("[SpeakUp]          See README.md to get a free Azure key.")
    print("[SpeakUp] Open http://127.0.0.1:5050 in Chrome or Edge")
    app.run(host="127.0.0.1", port=5050, debug=True)
