/* =========================================================================
   SpeakUp — Frontend logic (vanilla ES2020)
   =========================================================================
   Three big things happen in this file:

     1. CATALOGUE:  fetches lessons.json from /api/lessons and renders the
                    home grid + phrase cards.

     2. NATIVE TTS: when the user taps "Listen", we POST /api/tts and play
                    the streamed MP3 in an <audio> element. We cache MP3
                    blobs by (text + language + speed) so re-tapping is
                    instant and saves your Azure free-tier quota.

     3. PRONUNCIATION ASSESSMENT:
                    when the user taps "Speak", we ask /api/speech-token
                    for a short-lived Azure auth token. With it we build
                    a Microsoft Speech SDK recognizer that:
                      • opens the mic via getUserMedia under the hood
                      • streams audio to Azure
                      • compares it to the expected reference text
                      • returns per-word + overall scores (0-100)
                    We then colour the words green / amber / red and
                    save the score to /api/progress.

   WHY NOT UPLOAD AUDIO TO FLASK?
     We considered MediaRecorder → upload WebM → Flask → Azure. It works
     but the format conversion is fiddly (Opus → WAV/PCM). The browser
     SDK lets Azure handle mic capture + assessment in one shot, so the
     code in this file is tiny in comparison.

   BROWSER SUPPORT
     Chrome / Edge / Safari (recent) on http://127.0.0.1:5050 (localhost
     is treated as a "secure origin" by the Web Speech permission model,
     so the mic prompt will appear).
   ========================================================================= */


// ─── Tiny DOM helpers ─────────────────────────────────────────────────────
const $    = (sel)        => document.querySelector(sel);
const $$   = (sel, root)  => Array.from((root || document).querySelectorAll(sel));
const html = document.documentElement;

const elHome           = $("#viewHome");
const elLesson         = $("#viewLesson");
const elGrid           = $("#categoryGrid");
const elBackBtn        = $("#backBtn");
const elLangTabs       = $$(".lang-tab");

const elPhraseTarget   = $("#phraseTarget");
const elPhraseTrans    = $("#phraseTranslation");
const elPhraseTrlit    = $("#phraseTransliteration");
const elPhraseCard     = $("#phraseCard");
const elLessonTitle    = $("#lessonTitle");
const elLessonCounter  = $("#lessonCounter");
const elProgressFill   = $("#lessonProgressFill");

const elListenBtn      = $("#listenBtn");
const elMicBtn         = $("#micBtn");
const elPrevBtn        = $("#prevBtn");
const elNextBtn        = $("#nextBtn");
const elSpeedOpts      = $$(".speed-opt");

const elScorePanel     = $("#scorePanel");
const elScoreCircle    = $("#scoreCircle");
const elScoreNumber    = $("#scoreNumber");
const elScoreAccuracy  = $("#scoreAccuracy");
const elScoreFluency   = $("#scoreFluency");
const elScoreCompl     = $("#scoreCompleteness");
const elWordsRow       = $("#wordsRow");

const elStatStreak     = $("#statStreak");
const elStatAvg        = $("#statAvg");
const elStatDone       = $("#statDone");

const elToast          = $("#toast");
const elConfetti       = $("#confettiCanvas");


// ─── App state ────────────────────────────────────────────────────────────
const state = {
    lessons: [],            // categories[] from lessons.json
    currentCategory: null,
    currentIndex: 0,
    speed: 1.0,
    isListening: false,
    progress: { streak: 0, scores: [], completed: [] },
};

const ttsCache = new Map();   // key = `${language}|${speed}|${text}` → Blob URL
let activeAudio = null;       // current <audio> element, so we can cancel it


// ─── Toast ────────────────────────────────────────────────────────────────
function toast(message, durationMs = 3500) {
    elToast.textContent = message;
    elToast.classList.add("show");
    clearTimeout(elToast._t);
    elToast._t = setTimeout(() => elToast.classList.remove("show"), durationMs);
}


// ─── Boot ─────────────────────────────────────────────────────────────────
(async function boot() {
    try {
        const [lessonsRes, progRes] = await Promise.all([
            fetch("/api/lessons"),
            fetch("/api/progress"),
        ]);
        if (!lessonsRes.ok) throw new Error("could not load lessons");
        const lessonData = await lessonsRes.json();
        state.lessons = lessonData.categories || [];
        if (progRes.ok) state.progress = await progRes.json();

        renderStats();
        renderCategoryGrid("all");
    } catch (err) {
        console.error("[SpeakUp] boot failed:", err);
        toast("Could not load lessons. Is the server running?");
    }
})();


// ─── Stats (header) ──────────────────────────────────────────────────────
function renderStats() {
    const p = state.progress || {};
    elStatStreak.textContent = p.streak || 0;
    elStatDone.textContent   = (p.completed || []).length;
    const scores = (p.scores || []).map(s => Number(s.score) || 0);
    elStatAvg.textContent = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : "—";
}


// ─── Category grid ───────────────────────────────────────────────────────
function renderCategoryGrid(filter) {
    elGrid.innerHTML = "";
    const list = (filter === "all")
        ? state.lessons
        : state.lessons.filter(c => c.language === filter);

    list.forEach(cat => {
        const completed = (state.progress.completed || []).filter(id => id === cat.id).length;
        const completion = completed > 0 ? 100 : 0;

        const card = document.createElement("button");
        card.className = "category-card";
        card.innerHTML = `
            <span class="cat-icon">${cat.icon || "📘"}</span>
            <span class="cat-title">${cat.title}</span>
            <span class="cat-native">${cat.title_native || ""}</span>
            <div class="cat-meta">
                <span class="lang-badge">${cat.language}</span>
                <span>${cat.phrases.length} phrases</span>
            </div>
            <div class="cat-progress"><div class="cat-progress-fill" style="width:${completion}%"></div></div>`;
        card.addEventListener("click", () => openLesson(cat.id));
        elGrid.appendChild(card);
    });
}

elLangTabs.forEach(tab => {
    tab.addEventListener("click", () => {
        elLangTabs.forEach(t => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        renderCategoryGrid(tab.dataset.filter);
    });
});


// ─── Lesson view ─────────────────────────────────────────────────────────
function openLesson(categoryId) {
    const cat = state.lessons.find(c => c.id === categoryId);
    if (!cat) return;
    state.currentCategory = cat;
    state.currentIndex    = 0;

    elLessonTitle.textContent = cat.title;
    elPhraseCard.classList.toggle("rtl", cat.language.startsWith("ar"));
    elHome.classList.add("hidden");
    elLesson.classList.remove("hidden");

    renderPhrase();
}

function renderPhrase() {
    const cat   = state.currentCategory;
    const total = cat.phrases.length;
    const idx   = state.currentIndex;
    const p     = cat.phrases[idx];

    elPhraseTarget.textContent = p.target;
    elPhraseTrans.textContent  = p.translation || "";
    elPhraseTrlit.textContent  = p.transliteration || "";

    elLessonCounter.textContent = `${idx + 1} / ${total}`;
    elProgressFill.style.width  = `${((idx + 1) / total) * 100}%`;

    elScorePanel.classList.add("hidden");
    elWordsRow.innerHTML = "";

    elPrevBtn.disabled = (idx === 0);
    elNextBtn.disabled = (idx === total - 1);
}

elBackBtn.addEventListener("click", () => {
    cancelTTS();
    elLesson.classList.add("hidden");
    elHome.classList.remove("hidden");
});
elPrevBtn.addEventListener("click", () => {
    if (state.currentIndex > 0) { state.currentIndex--; renderPhrase(); }
});
elNextBtn.addEventListener("click", () => {
    const total = state.currentCategory.phrases.length;
    if (state.currentIndex < total - 1) { state.currentIndex++; renderPhrase(); }
});


// ─── Speed picker ────────────────────────────────────────────────────────
elSpeedOpts.forEach(btn => {
    btn.addEventListener("click", () => {
        elSpeedOpts.forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.speed = parseFloat(btn.dataset.speed) || 1.0;
    });
});


// =========================================================================
//   NATIVE TTS — fetch MP3 from /api/tts and play it
// =========================================================================
async function playTTS(text, language, speed) {
    if (!text) return;
    cancelTTS();

    const key = `${language}|${speed}|${text}`;
    let url   = ttsCache.get(key);

    if (!url) {
        try {
            elListenBtn.classList.add("is-playing");
            const r = await fetch("/api/tts", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ text, language, speed }),
            });
            if (!r.ok) {
                const detail = await r.json().catch(() => ({}));
                throw new Error(detail.error || `HTTP ${r.status}`);
            }
            const blob = await r.blob();
            url = URL.createObjectURL(blob);
            ttsCache.set(key, url);
        } catch (err) {
            console.error("[SpeakUp] TTS failed:", err);
            elListenBtn.classList.remove("is-playing");
            toast(`Couldn't play audio: ${err.message}`);
            return;
        }
    }

    activeAudio = new Audio(url);
    activeAudio.onended = activeAudio.onerror = () => {
        elListenBtn.classList.remove("is-playing");
        activeAudio = null;
    };
    elListenBtn.classList.add("is-playing");
    try { await activeAudio.play(); }
    catch (err) {
        console.warn("[SpeakUp] audio.play() rejected:", err);
        elListenBtn.classList.remove("is-playing");
    }
}

function cancelTTS() {
    if (activeAudio) {
        try { activeAudio.pause(); } catch (_) {}
        activeAudio = null;
    }
    elListenBtn.classList.remove("is-playing");
}

elListenBtn.addEventListener("click", () => {
    const cat = state.currentCategory;
    if (!cat) return;
    const phrase = cat.phrases[state.currentIndex];
    playTTS(phrase.target, cat.language, state.speed);
});


// =========================================================================
//   PRONUNCIATION ASSESSMENT  (Microsoft Speech SDK in the browser)
// =========================================================================

let cachedToken = { token: null, region: null, expiresAt: 0 };

/**
 * Get a usable Azure auth token. Tokens last 10 minutes, so we cache for 9.
 */
async function getSpeechToken() {
    const now = Date.now();
    if (cachedToken.token && cachedToken.expiresAt > now + 30_000) {
        return cachedToken;
    }
    const r = await fetch("/api/speech-token");
    if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw new Error(detail.error || `token request failed (${r.status})`);
    }
    const data = await r.json();
    cachedToken = {
        token: data.token,
        region: data.region,
        expiresAt: now + (data.expires_in || 540) * 1000,
    };
    return cachedToken;
}


/**
 * Score the user's pronunciation against a reference phrase.
 *
 * @param {string} referenceText - exactly what we want them to say
 * @param {string} language      - 'en-US' or 'ar-JO'
 * @returns {Promise<object>}    - parsed assessment result
 */
async function assessPronunciation(referenceText, language) {
    if (!window.SpeechSDK) {
        throw new Error("Speech SDK didn't load. Check your internet connection.");
    }
    const { token, region } = await getSpeechToken();

    const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
    speechConfig.speechRecognitionLanguage = language;

    const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
    const recognizer  = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

    // PronunciationAssessmentConfig is what turns a plain recognizer into a
    // grading recognizer. HundredMark scoring (0-100), word granularity.
    const assessmentConfig = new SpeechSDK.PronunciationAssessmentConfig(
        referenceText,
        SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
        SpeechSDK.PronunciationAssessmentGranularity.Word,
        /* enableMiscue */ true,
    );
    assessmentConfig.applyTo(recognizer);

    return new Promise((resolve, reject) => {
        recognizer.recognizeOnceAsync(
            (result) => {
                try {
                    if (result.reason === SpeechSDK.ResultReason.NoMatch) {
                        recognizer.close();
                        return reject(new Error("I couldn't hear you. Please try again."));
                    }
                    if (result.reason === SpeechSDK.ResultReason.Canceled) {
                        const cancel = SpeechSDK.CancellationDetails.fromResult(result);
                        recognizer.close();
                        return reject(new Error(cancel.errorDetails || "Recognition cancelled."));
                    }
                    const parsed = SpeechSDK.PronunciationAssessmentResult.fromResult(result);
                    recognizer.close();
                    resolve({
                        recognized: result.text || "",
                        accuracy:      parsed.accuracyScore,
                        fluency:       parsed.fluencyScore,
                        completeness:  parsed.completenessScore,
                        pronunciation: parsed.pronunciationScore,
                        // detailResult is the full Azure JSON; .Words = per-word scores
                        words: (parsed.detailResult?.Words || []).map(w => ({
                            word:  w.Word,
                            score: w.PronunciationAssessment?.AccuracyScore ?? 0,
                            error: w.PronunciationAssessment?.ErrorType || "None",
                        })),
                    });
                } catch (err) {
                    try { recognizer.close(); } catch (_) {}
                    reject(err);
                }
            },
            (err) => {
                try { recognizer.close(); } catch (_) {}
                reject(new Error(err?.message || "Recognition error"));
            },
        );
    });
}


// ─── Mic button handler ──────────────────────────────────────────────────
elMicBtn.addEventListener("click", async () => {
    const cat = state.currentCategory;
    if (!cat || state.isListening) return;
    const phrase = cat.phrases[state.currentIndex];

    state.isListening = true;
    elMicBtn.classList.add("is-listening");
    elMicBtn.querySelector("span").textContent = "Listening…";
    elScorePanel.classList.add("hidden");

    try {
        const result = await assessPronunciation(phrase.target, cat.language);
        renderScore(result, phrase.target, cat.language);

        // Save progress
        try {
            const r = await fetch("/api/progress", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({
                    lesson_id: cat.id,
                    score:     result.pronunciation || 0,
                    timestamp: new Date().toISOString(),
                }),
            });
            if (r.ok) state.progress = await r.json();
            renderStats();
        } catch (err) {
            console.warn("[SpeakUp] could not save progress:", err);
        }

        if ((result.pronunciation || 0) >= 90) celebrate();
    } catch (err) {
        console.error("[SpeakUp] assessment error:", err);
        toast(err.message || "Couldn't score that. Please try again.");
    } finally {
        state.isListening = false;
        elMicBtn.classList.remove("is-listening");
        elMicBtn.querySelector("span").textContent = "Speak";
    }
});


// ─── Render score panel ──────────────────────────────────────────────────
function renderScore(result, referenceText, language) {
    const overall = Math.round(result.pronunciation || 0);
    elScoreNumber.textContent = overall;
    elScoreAccuracy.textContent = Math.round(result.accuracy     || 0);
    elScoreFluency.textContent  = Math.round(result.fluency      || 0);
    elScoreCompl.textContent    = Math.round(result.completeness || 0);

    elScoreCircle.classList.remove("is-bad", "is-warn", "is-good");
    if      (overall >= 76) elScoreCircle.classList.add("is-good");
    else if (overall >= 51) elScoreCircle.classList.add("is-warn");
    else                    elScoreCircle.classList.add("is-bad");
    elScoreCircle.style.setProperty("--pct", `${(overall / 100) * 360}deg`);

    elWordsRow.innerHTML = "";
    (result.words.length ? result.words : [{ word: referenceText, score: overall }])
        .forEach(w => {
            const chip = document.createElement("button");
            chip.className = "word-chip";
            chip.textContent = w.word;
            const s = Number(w.score) || 0;
            if      (s >= 80) chip.classList.add("word-good");
            else if (s >= 60) chip.classList.add("word-mid");
            else              chip.classList.add("word-bad");
            chip.title = `${Math.round(s)} / 100${w.error && w.error !== "None" ? " · " + w.error : ""}`;
            chip.addEventListener("click", () => playTTS(w.word, language, state.speed));
            elWordsRow.appendChild(chip);
        });

    elScorePanel.classList.remove("hidden");
}


// ─── Confetti for high scores ────────────────────────────────────────────
function celebrate() {
    const ctx = elConfetti.getContext("2d");
    const w = elConfetti.width  = window.innerWidth;
    const h = elConfetti.height = window.innerHeight;
    const colors = ["#5b8def", "#7c5cff", "#16a34a", "#f59e0b", "#ef4444"];
    const pieces = Array.from({ length: 120 }, () => ({
        x: Math.random() * w,
        y: -20 - Math.random() * 80,
        r: 4 + Math.random() * 5,
        c: colors[Math.floor(Math.random() * colors.length)],
        vx: -2 + Math.random() * 4,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: -0.1 + Math.random() * 0.2,
    }));
    let frame = 0;
    function tick() {
        ctx.clearRect(0, 0, w, h);
        pieces.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.rot += p.vr;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
            ctx.fillStyle = p.c;
            ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
            ctx.restore();
        });
        frame++;
        if (frame < 180) requestAnimationFrame(tick);
        else ctx.clearRect(0, 0, w, h);
    }
    tick();
}
