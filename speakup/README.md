# SpeakUp — Bilingual Pronunciation Coach

A Duolingo-Speak / ELSA-style web app that teaches **authentic American
English** and **authentic Jordanian Arabic dialect (اللهجة الأردنية)** side
by side. The app speaks each phrase in a native voice, listens to you read
it back, and grades your pronunciation 0–100 with per-word feedback.

> ⚠ **Important — why Jordanian Arabic and not Modern Standard Arabic?**
> Jordanians do not speak Modern Standard Arabic (MSA / الفصحى) in daily
> life. They use the Jordanian dialect (`بدّي أروح عالسوق` instead of
> `أريد الذهاب إلى السوق`). Microsoft Azure ships **real Jordanian dialect
> neural voices** (`ar-JO-SanaNeural`, `ar-JO-TaimNeural`) AND offers
> pronunciation assessment for `ar-JO`. That combination is unique among
> the major TTS providers and is why Azure is the recommended backend.

---

## 1 — Tech stack

| Layer       | Tech                                                  |
|-------------|-------------------------------------------------------|
| Backend     | Python 3.10+ · Flask · python-dotenv · requests       |
| Frontend    | Vanilla HTML/CSS/JS · Microsoft Speech SDK (browser)  |
| Voice TTS   | Azure Speech REST API (ar-JO + en-US neural voices)   |
| Voice score | Azure Pronunciation Assessment (via browser SDK)      |
| Hosting     | Local Flask dev server on `http://127.0.0.1:5050`     |

---

## 2 — Get a free Azure Speech key (5 minutes, no credit card)

1. Go to **<https://portal.azure.com>** and sign in (or create a free
   account — Microsoft gives ~$200 in credits).
2. Click **"Create a resource"** → search for **"Speech"** → pick
   **"Speech service"** by Microsoft → click **Create**.
3. Fill the form:
   - **Subscription** : your default (Free Trial / Pay-As-You-Go)
   - **Resource group**: create new, name it `speakup-rg`
   - **Region**       : `East US` (recommended — has all neural voices)
   - **Name**         : `speakup-speech-yourname` (must be globally unique)
   - **Pricing tier** : **Free F0**  ✨ (5 audio hours/month, no card)
4. Click **Review + create** → **Create** → wait ~30 seconds.
5. Open the new resource → in the left sidebar click **"Keys and Endpoint"**.
6. Copy **KEY 1** and the **LOCATION/REGION** (e.g. `eastus`).

> Free F0 limits: 0.5M characters TTS + 5 hours STT per month — way more
> than you need for daily practice. Microsoft will not charge you anything
> on F0; if you exceed the quota the API simply returns 403 until next month.

---

## 3 — Install & run (Windows / VS Code)

```powershell
# 1. cd into the project
cd C:\Users\user\medical-chatbot\speakup

# 2. create a virtual environment
python -m venv venv

# 3. activate it
.\venv\Scripts\activate

# 4. install dependencies
pip install -r requirements.txt

# 5. create your .env from the template
copy .env.example .env
notepad .env       # paste AZURE_SPEECH_KEY and confirm AZURE_REGION
```

`.env` should look like:

```
AZURE_SPEECH_KEY=8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p
AZURE_REGION=eastus
TTS_VOICE_AR=ar-JO-SanaNeural
TTS_VOICE_EN=en-US-JennyNeural
```

Then run:

```powershell
python app.py
```

You should see:

```
[SpeakUp] Azure Speech ready in region: eastus
[SpeakUp] Open http://127.0.0.1:5050 in Chrome or Edge
 * Running on http://127.0.0.1:5050
```

Open **<http://127.0.0.1:5050>** in **Chrome or Edge**.

> ⚠ Microphone access only works on `localhost`/`127.0.0.1` or HTTPS.
> If you open the app from another device's IP (e.g. `192.168.x.x`) the
> mic prompt will be silently blocked by the browser.

---

## 4 — How the pieces fit together

```
┌─────────────────────────────────┐
│ Browser (templates/index.html)  │
│                                 │
│   user clicks "Listen"          │
│         │                       │
│         ▼                       │
│   POST /api/tts ─────────────────────────┐
│                                 │        │
│   user clicks "Speak"           │        │
│         │                       │        │
│         │  GET /api/speech-token│        │
│         │◀────── short token ───┼────────┤
│         │                       │        │
│         ▼                       │        │
│   SpeechSDK.recognizeOnceAsync  │        │
│   (mic → Azure → score)         │        │
│         │                       │        │
│         ▼                       │        │
│   POST /api/progress ───────────────────┐│
└─────────────────────────────────┘       ││
                                          ▼▼
                            ┌──────────────────────────┐
                            │  Flask backend (app.py)  │
                            │                          │
                            │  /api/tts → Azure TTS    │
                            │  /api/speech-token       │
                            │  /api/progress           │
                            │  /api/lessons            │
                            └──────────────────────────┘
                                          │
                                          ▼
                            ┌──────────────────────────┐
                            │ Microsoft Azure Speech    │
                            │   • TTS (ar-JO, en-US)   │
                            │   • Pronunciation        │
                            │     Assessment           │
                            └──────────────────────────┘
```

### Why pronunciation assessment runs in the browser, not the server

We could send the user's recording to Flask and let Python call Azure.
That works, but you'd have to convert the browser's WebM/Opus stream to
PCM/WAV first, deal with chunked uploads, and pay for double bandwidth.

The Microsoft Speech SDK for JavaScript handles **mic capture, encoding,
and Azure streaming in one call** — see `assessPronunciation()` in
`static/app.js`. The Flask backend's only job in that flow is to issue a
short-lived auth token (`/api/speech-token`) so the API key never reaches
the browser.

### How pronunciation assessment works under the hood

Azure splits each spoken word into **phonemes** — the smallest distinct
sounds of a language (English has ~44, Jordanian Arabic ~28). For each
phoneme it compares the user's pitch / energy / duration to a native
reference model and returns:

| Score          | What it measures                                       |
|----------------|--------------------------------------------------------|
| `accuracy`     | how native each individual sound is                    |
| `fluency`      | rhythm, pausing, hesitation                            |
| `completeness` | did you say all of the expected words                  |
| `pronunciation`| weighted blend of the above (the headline 0–100 score) |

It also returns **per-word scores** (the `Words[].PronunciationAssessment`
JSON), which we colour green ≥80, amber 60-79, red <60.

### Speech Recognition vs Pronunciation Assessment

* **Speech Recognition** transcribes audio to text. (Did the user say
  *something* and what was it.)
* **Pronunciation Assessment** transcribes AND compares the result to a
  reference sentence we provide. It's a superset built specifically for
  language-learning apps.

---

## 5 — Project structure

```
speakup/
├── app.py                  Flask routes + Azure proxy
├── lessons.json            All lesson content (EN + AR)
├── requirements.txt        Pinned Python dependencies
├── .env.example            Copy to .env and fill in keys
├── .gitignore
├── README.md               (this file)
├── templates/
│   └── index.html          Single-page lesson UI
└── static/
    ├── style.css           Modern, mobile-first styles
    └── app.js              Recording, TTS playback, scoring
```

---

## 6 — Common errors and fixes

| Error                                                          | Fix                                                                                                                |
|----------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| `Azure Speech is not configured`                               | Your `.env` is missing `AZURE_SPEECH_KEY` or `AZURE_REGION`. Restart `python app.py` after editing `.env`.        |
| `azure rejected token request` (status 401)                    | Wrong key. Copy the key again from Azure Portal → Keys and Endpoint.                                              |
| `azure tts failed` (status 403)                                | Free F0 quota exhausted (5 hrs/month) — wait until next month or upgrade to Standard S0 (~$1 / 1M chars).         |
| `Speech SDK didn't load`                                       | Browser couldn't fetch the SDK from CDN. Check internet connection and ad-blockers.                               |
| Mic prompt never appears                                       | You opened the app from `192.168.x.x` instead of `127.0.0.1`. The Web Speech permission model only allows mic on  `localhost` / HTTPS. |
| `I couldn't hear you. Please try again.`                       | Real "no-speech" — speak louder / closer to the mic, or check Windows Sound Settings → Input.                     |
| Arabic voice sounds formal, not Jordanian                      | Confirm `TTS_VOICE_AR=ar-JO-SanaNeural` in `.env`. Voices like `ar-EG-*` will sound Egyptian, `ar-SA-*` Saudi.    |

---

## 7 — Testing checklist

Run `python app.py`, open <http://127.0.0.1:5050> in Chrome, then:

```
[ ] Home page shows category cards for both 🇯🇴 and 🇺🇸
[ ] Tab "🇯🇴 Jordanian" filters to Arabic categories only
[ ] Tab "🇺🇸 English"  filters to English categories only
[ ] Click any card → lesson view opens with phrase 1 of N
[ ] Phrase target text shows in the right script (Arabic right-to-left)
[ ] Click "Listen" → MP3 plays in a native voice (Sana / Jenny)
[ ] Speed pill 0.7× / 1× / 1.2× changes playback speed
[ ] Click "Speak" → mic prompt the FIRST time, then a red pulsing button
[ ] After speaking → score circle, accuracy/fluency/completeness, words coloured green / amber / red
[ ] Click a coloured word → its native pronunciation plays
[ ] Score ≥ 90 → confetti animation
[ ] Stats in the header update (streak, avg, lessons done)
[ ] Refresh page → stats are still there (saved in progress.json)
[ ] Back button returns to home grid
[ ] No console errors in DevTools
```

---

## 8 — Beyond the free tier

* **More natural Jordanian voices** — paid services like ElevenLabs let
  you clone a real Jordanian speaker's voice. Replace `/api/tts` with a
  call to ElevenLabs' `text-to-speech` endpoint.
* **Offline mode** — bundle pre-recorded MP3s for the static lessons so
  basic listening works without an Azure key.
* **Authentication & cloud progress** — replace `progress.json` with a
  database (SQLite for v1, Postgres for production).
* **Spaced-repetition** — surface phrases the user struggled with more
  often, like Anki or Duolingo's review queue.
