/* =========================================================================
   MT° Medical Assistant — Frontend Logic (script.js)
   =========================================================================

   This file is intentionally written for a beginner.
   Every section is generously commented so you (the user) can read top-to-
   bottom and understand exactly what each block does.

   Two critical bugs are fixed in this rewrite:

     BUG 1 — Voice input (microphone) was unreliable.
             Now it:
               * uses ONE global SpeechRecognition instance (no leaks)
               * picks the recognition language from the UI's language
                 toggle (English UI → en-US, Arabic UI → ar-SA)
               * shows a clear LISTENING state (red pulse on the mic button)
               * gives a specific human-friendly message for every error
                 (no more generic "didn't work")
               * shows mic errors as a small TOAST notification, never as a
                 chat bubble, so the conversation stays clean
               * silently ignores Chrome's well-known false-positive errors
                 that fire AFTER a successful transcript

     BUG 2 — Bot voice was always English even for Arabic text.
             Now it:
               * detects the language of EACH bot reply via a 30%-Arabic-
                 character ratio (handles mixed text robustly)
               * caches available voices and re-caches when the browser
                 finally loads them ("voiceschanged" event)
               * picks the best Arabic voice (ar-SA → ar-JO → any ar-*)
                 or English voice (en-US → any en-*)
               * if no Arabic voice is installed, logs a console warning
                 and shows a one-time toast tip — but still attempts
                 playback

   IMPORTANT CAVEAT (Arabic voice quality):
     Browser-built-in Arabic voices speak MODERN STANDARD ARABIC (الفصحى),
     not Jordanian dialect. So:
       * The TEXT is authentic Jordanian (شو صار معك، بدّك تشرب مَي)   ✓
       * The VOICE pronounces it slightly more formally               ⚠
     This is a hard limit of the free Web Speech API. For a true Jordanian
     accent you'd need a paid service like ElevenLabs / Azure Speech /
     Google Cloud TTS. The user will still hear ARABIC instead of an
     English voice mangling Arabic words — a huge UX win.

   No other working features are changed:
     theme toggle, language toggle, suggestion chips, reset button,
     typing indicator, conversation history, English voice (already worked).
   ========================================================================= */


// ─── DOM references ──────────────────────────────────────────────────────
//  Grabbed once, reused everywhere. Faster + safer than re-querying.
const html        = document.documentElement;
const chat        = document.getElementById("chat");
const form        = document.getElementById("composer");
const input       = document.getElementById("input");
const sendBtn     = document.getElementById("sendBtn");
const resetBtn    = document.getElementById("resetBtn");
const suggestions = document.getElementById("suggestions");
const langToggle  = document.getElementById("langToggle");
const langLabel   = document.getElementById("langLabel");
const themeToggle = document.getElementById("themeToggle");
const micBtn      = document.getElementById("micBtn");
const voiceToggle = document.getElementById("voiceToggle");
const chatProgress  = document.getElementById("chatProgress");


// ─── i18n: every visible string in both languages ────────────────────────
//  Want to add a new translatable string?
//  1. Add the key to BOTH `en` and `ar` blocks below.
//  2. In HTML, use <element data-i18n="myKey">...</element>.
//  3. The applyLang() function below will copy the right text in.
const I18N = {
    en: {
        chat:           "Chat",
        tagline:        "Your health, made simple.",
        reset:          "Reset",
        disclaimer:     "This chatbot is for general information only and is <strong>not</strong> a substitute for professional medical advice.",
        greetingHello:  "Welcome!",
        greetingRest:   " I'm MT, your medical assistant. How can I help you feel better today?",
        chip1:          "I have a headache",
        chip2:          "My stomach hurts",
        chip3:          "I feel dizzy",
        chip4:          "Can't sleep",
        thinking:       "MT is thinking…",
        connectionErr:  "Connection error — please try again.",
        somethingWrong: "Sorry, something went wrong",
        emptyReply:     "(No response received)",
        todayLabel:     "TODAY",
        // Used by <input data-i18n-placeholder="placeholderDefault">.
        // Identical to placeholders[0] — kept as a separate key so the HTML
        // can stay declarative without knowing about array indexes.
        placeholderDefault: "Type here...",
        placeholders: [
            "Type here...",
            "Describe your symptoms...",
            "Ask about a medication...",
            "How are you feeling today?",
        ],
        langLabel:      "AR",
        ariaLang:       "Switch to Arabic",
        ariaTheme:      "Toggle theme",
        ariaMic:        "Voice input — tap to speak",
        listeningHint:  "Listening...",

        // Mic-error TOAST messages (NEVER shown as chat bubbles)
        toastNoSpeech:        "I didn't hear anything. Please try again.",
        toastNoMic:           "No microphone found on your device.",
        toastDenied:          "Microphone access blocked. Use the lock icon in the address bar → Site settings → Microphone → Allow. On Windows, also check Settings → Privacy → Microphone.",
        toastServiceDenied:   "Voice input isn't available in this browser session. Try restarting Chrome or Edge.",
        toastNetwork:         "Speech recognition couldn't reach Google's voice server — this is NOT your general internet. Try again in a few seconds.",
        toastMicOther:        "Microphone error. Please try typing.",

        // One-time tip when no Arabic voice is installed
        toastVoiceTip:  "Tip: Install an Arabic voice in your system settings for better audio.",

        ariaVoiceOn:    "Voice replies on — tap to mute",
        ariaVoiceOff:   "Voice replies muted — tap to unmute",
        ariaSpeak:      "Play voice reply",
        ariaStop:       "Stop voice reply",
        ariaSpeed:      "Voice speed",
    },
    ar: {
        chat:           "الشات",
        tagline:        "صحتك، أبسط بشكل.",
        reset:          "إعادة",
        disclaimer:     "هاد الشات للمعلومات العامة بس و<strong>مش</strong> بديل عن استشارة دكتور مختص.",
        greetingHello:  "أهلاً وسهلاً!",
        greetingRest:   " أنا MT، مساعدك الطبي. شو اللي مضايقك اليوم؟",
        chip1:          "عندي صداع",
        chip2:          "بطني بوجعني",
        chip3:          "حاسس بدوخة",
        chip4:          "ما بقدر أنام",
        thinking:       "MT عم يفكر…",
        connectionErr:  "خطأ بالاتصال — جرب كمان مرة.",
        somethingWrong: "عذراً، صار شي غلط",
        emptyReply:     "(ما إجاني رد)",
        todayLabel:     "اليوم",
        placeholderDefault: "اكتب هون...",
        placeholders: [
            "اكتب هون...",
            "احكيلي إيش بتحس فيه...",
            "اسألني عن دواء معين...",
            "كيف حالك اليوم؟",
        ],
        langLabel:      "EN",
        ariaLang:       "التبديل للإنجليزي",
        ariaTheme:      "تبديل المظهر",
        ariaMic:        "إدخال صوتي — اضغط واحكي",
        listeningHint:  "عم أسمعك...",

        toastNoSpeech:        "ما سمعت إشي. جرب كمان مرة.",
        toastNoMic:           "ما في ميكروفون متوفر بجهازك.",
        toastDenied:          "الميكروفون ممنوع. اضغط أيقونة القفل بشريط العنوان ← إعدادات الموقع ← الميكروفون ← سماح. وعلى Windows راجع الإعدادات ← الخصوصية ← الميكروفون.",
        toastServiceDenied:   "الإدخال الصوتي مش متاح بهاد المتصفح. جرّب تعيد تشغيل Chrome أو Edge.",
        toastNetwork:         "خدمة التعرف على الكلام ما وصلت لـ Google — مش مشكلة إنترنت عادي. جرّب كمان مرة بعد شوية.",
        toastMicOther:        "خطأ بالميكروفون. جرّب تكتب.",

        toastVoiceTip:  "نصيحة: ثبّت صوت عربي بإعدادات نظامك للحصول على صوت أحسن.",

        ariaVoiceOn:    "الرد الصوتي شغّال — اضغط للكتم",
        ariaVoiceOff:   "الرد الصوتي مكتوم — اضغط للتشغيل",
        ariaSpeak:      "تشغيل الرد الصوتي",
        ariaStop:       "إيقاف الرد الصوتي",
        ariaSpeed:      "سرعة الصوت",
    },
};


// ─── Persisted state (read from localStorage on first load) ──────────────
//  - lang  : "en" or "ar"
//  - theme : "dark" or "light"
//  Saved values survive page reloads.
const _savedLang = localStorage.getItem("mt_lang");
let lang = _savedLang
    ? _savedLang
    // First visit: auto-pick based on browser language
    : ((navigator.language || "en").toLowerCase().startsWith("ar") ? "ar" : "en");

// Default to light — matches the bright “health & wellness” UI. User can
// still switch to dark anytime; preference is saved in localStorage.
let theme = localStorage.getItem("mt_theme") || "light";

// JSON endpoint (GET /chat is the HTML page, so POST must not collide).
const API_CHAT = "/api/chat";

// FIX: prevents duplicate fetches when the user clicks Send AND presses Enter
// AND clicks a chip in the same instant (or voice-input auto-send + click).
let isSending = false;

// Quick helper to read the current dictionary
const t = () => I18N[lang];


// ─── Apply language to the entire UI ─────────────────────────────────────
// Called every time the user clicks the language toggle. Updates ALL
// translatable strings on the page in-place — no page reload, no chat
// history loss. The conversation bubbles are NEVER touched (they keep the
// language they were originally sent in).
//
// What each block does:
//   1. Persist the new lang in localStorage so it survives reload.
//   2. Flip the <html dir> + <html lang> for proper RTL/LTR + font swap.
//   3. Walk every [data-i18n]            → setter: textContent
//      Walk every [data-i18n-html]       → setter: innerHTML  (allows <strong>)
//      Walk every [data-i18n-placeholder]→ setter: placeholder attr
//      Walk every [data-i18n-title]      → setter: title attr (tooltip)
//   4. Force-refresh the greeting bubble explicitly. Belt-and-suspenders:
//      even if the loop above somehow misses it (bad caching, partial DOM
//      replacement, browser quirk), this guarantees the welcome message
//      always matches the current language.
function applyLang(newLang) {
    lang = (newLang === "ar") ? "ar" : "en";
    localStorage.setItem("mt_lang", lang);

    // 2 — flip document direction & lang for the whole page
    html.setAttribute("lang", lang);
    html.setAttribute("dir",  lang === "ar" ? "rtl" : "ltr");
    html.setAttribute("data-lang", lang);

    const dict = t();

    // 3a — plain text translations (safe: textContent escapes HTML)
    document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (dict[key] !== undefined) el.textContent = dict[key];
    });
    // 3b — translations that contain HTML markup (e.g. <strong> in disclaimer)
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
        const key = el.getAttribute("data-i18n-html");
        if (dict[key] !== undefined) el.innerHTML = dict[key];
    });
    // 3c — input placeholder attribute
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (dict[key] !== undefined) el.setAttribute("placeholder", dict[key]);
    });
    // 3d — tooltip / title attribute (mouse-hover tooltips)
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        const key = el.getAttribute("data-i18n-title");
        if (dict[key] !== undefined) el.setAttribute("title", dict[key]);
    });

    // Header & icon-button aria-labels (kept for screen-reader users)
    langLabel.textContent = dict.langLabel;
    langToggle.setAttribute("aria-label", dict.ariaLang);
    themeToggle.setAttribute("aria-label", dict.ariaTheme);
    if (micBtn) {
        micBtn.setAttribute("aria-label", dict.ariaMic);
        micBtn.setAttribute("title",       dict.ariaMic);
    }
    if (voiceToggle) {
        const ariaVoice = voiceMuted ? dict.ariaVoiceOff : dict.ariaVoiceOn;
        voiceToggle.setAttribute("aria-label", ariaVoice);
        voiceToggle.setAttribute("title",       ariaVoice);
    }

    // 4 — Force-refresh the FIRST welcome bubble. This was the original bug:
    //     after a Reset, the greeting was rebuilt without data-i18n hooks,
    //     so subsequent toggles couldn't reach it. Now we always look it up
    //     by ID and rewrite it every time.
    refreshGreeting(dict);

    // Re-sync per-message speaker buttons so their aria-labels match the lang
    document.querySelectorAll(".msg-speaker").forEach((btn) => {
        // Don't override the "stop" label while a reply is being read aloud
        if (!btn.classList.contains("speaking")) {
            btn.setAttribute("aria-label", dict.ariaSpeak);
        }
    });

    updateTimestamp();
    placeholderIndex = 0;
    input.placeholder = dict.placeholderDefault;

    console.log(`[MT] applyLang(${lang}) — UI re-translated.`);
}

// ─── Force-refresh the welcome bubble (called from applyLang + Reset) ────
// The greeting is a STATIC piece of UI (not a real conversation message),
// so it should always reflect the current UI language. We rebuild its
// inner HTML from scratch to guarantee the data-i18n hooks stay attached
// and the speaker button (if any) reads the correct text.
function refreshGreeting(dict) {
    const greeting = document.getElementById("greetingMessage");
    if (!greeting) return;
    const bubble = greeting.querySelector(".bubble");
    if (!bubble) return;

    // Rebuild bubble content with data-i18n attributes still in place
    bubble.innerHTML =
        `<span class="accent" data-i18n="greetingHello">${dict.greetingHello}</span>` +
        `<span data-i18n="greetingRest">${dict.greetingRest}</span>`;

    // Refresh the speaker button so it reads the new-language greeting
    const oldSpeaker = greeting.querySelector(".msg-speaker");
    if (oldSpeaker) oldSpeaker.remove();
    if (synth) {
        const greetingText = `${dict.greetingHello} ${dict.greetingRest}`.trim();
        greeting.appendChild(createSpeakerButton(greetingText));
    }
}

function applyTheme(newTheme) {
    theme = (newTheme === "light") ? "light" : "dark";
    localStorage.setItem("mt_theme", theme);
    html.setAttribute("data-theme", theme);
}

function updateTimestamp() {
    const el = document.getElementById("timestamp");
    if (!el) return;
    const now = new Date();
    const hh  = String(now.getHours()).padStart(2, "0");
    const mm  = String(now.getMinutes()).padStart(2, "0");
    el.textContent = `${t().todayLabel} ${hh}:${mm}`;
}


// ─── Toast notifications ────────────────────────────────────────────────
//  Why a toast? Because mic errors and voice-tips should NEVER appear as
//  chat bubbles (they'd pollute the conversation history and look like
//  "the bot said this", which is confusing). A toast is a small floating
//  notice that auto-dismisses.
//
//  Created lazily on first call so we don't add HTML if it's never used.
function showToast(message, durationMs = 3500) {
    let toast = document.getElementById("mt-toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "mt-toast";
        toast.className = "mt-toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("show"), durationMs);
}


// ─── Auto-rotating placeholder text ──────────────────────────────────────
//  Just a small UX nicety: cycles example prompts every 4 seconds while
//  the input is empty and unfocused.
let placeholderIndex = 0;
setInterval(() => {
    if (document.activeElement === input || input.value.length > 0) return;
    const list = t().placeholders;
    placeholderIndex = (placeholderIndex + 1) % list.length;
    input.style.opacity = "0.4";
    setTimeout(() => {
        input.placeholder = list[placeholderIndex];
        input.style.opacity = "1";
    }, 250);
}, 4000);


// ─── Markdown → safe HTML ────────────────────────────────────────────────
//  Converts the bot's markdown reply (with **bold**, *italic*, lists)
//  into HTML the browser can render. Escapes raw HTML first so any
//  user content is safe.
function renderMarkdown(text) {
    text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = text.split("\n");
    const out = [];
    let inUl = false, inOl = false;
    for (let line of lines) {
        const ulMatch = line.match(/^[-*]\s+(.*)/);
        const olMatch = line.match(/^\d+\.\s+(.*)/);
        if (ulMatch) {
            if (!inUl) { out.push("<ul>"); inUl = true; }
            out.push(`<li>${inlineMarkdown(ulMatch[1])}</li>`);
        } else if (olMatch) {
            if (!inOl) { out.push("<ol>"); inOl = true; }
            out.push(`<li>${inlineMarkdown(olMatch[1])}</li>`);
        } else {
            if (inUl) { out.push("</ul>"); inUl = false; }
            if (inOl) { out.push("</ol>"); inOl = false; }
            out.push(line.trim() === "" ? "" : `<p>${inlineMarkdown(line)}</p>`);
        }
    }
    if (inUl) out.push("</ul>");
    if (inOl) out.push("</ol>");
    return out.join("\n");
}
function inlineMarkdown(line) {
    return line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g,     "<em>$1</em>");
}


// =========================================================================
//   BUG 2 FIX — Smart language detection so Arabic text is read in Arabic
// =========================================================================

/**
 * detectLanguage(text)
 *   Counts characters in the Arabic Unicode block (U+0600 – U+06FF).
 *   If 30% or more of the non-whitespace characters are Arabic → Arabic.
 *   Otherwise → English.
 *
 *   The 30% threshold makes mixed text (e.g. "Take 1 paracetamol وشرب مَي")
 *   pick the dominant language reliably.
 */
function detectLanguage(text) {
    if (!text) return "en";
    const arabicMatches      = text.match(/[\u0600-\u06FF]/g);
    const arabicCount        = arabicMatches ? arabicMatches.length : 0;
    const totalNonSpaceChars = text.replace(/\s/g, "").length;
    if (totalNonSpaceChars === 0) return "en";
    return (arabicCount / totalNonSpaceChars >= 0.3) ? "ar" : "en";
}

/** Strip markdown so the synthesised voice doesn't read "asterisk asterisk". */
function cleanForSpeech(text) {
    return text
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g,     "$1")
        .replace(/_([^_]+)_/g,       "$1")
        .replace(/`([^`]+)`/g,       "$1")
        .replace(/#{1,6}\s*/g,       "")
        .replace(/\s+/g, " ")
        .trim();
}


// =========================================================================
//   Text-to-Speech (Web Speech API — SpeechSynthesis)
// =========================================================================
const synth           = window.speechSynthesis || null;
let cachedVoices      = [];
let voicesLoaded      = false;
let currentUtterance  = null;
let currentSpeakerBtn = null;
let arabicTipShown    = false;   // shows the "install an Arabic voice" tip only once

let voiceMuted = localStorage.getItem("mt_voice_muted") === "true";

// Voice playback rate is fixed at 1.0× now that the speed pill is gone.
// (Arabic playback is still slightly slowed to 0.95 inside speakText for
// clarity, exactly as before.)
const VOICE_RATE = 1.0;

/** Re-cache available voices. Browsers populate them ASYNCHRONOUSLY. */
function loadVoices() {
    if (!synth) return;
    cachedVoices = synth.getVoices() || [];
    voicesLoaded = cachedVoices.length > 0;
    console.log(`[MT] Voices loaded: ${cachedVoices.length}`);
}

if (synth) {
    loadVoices();
    // Chrome fires this event the moment voices are finally ready
    synth.addEventListener("voiceschanged", loadVoices);
}

/**
 * pickVoice(language)
 *   Picks the best installed voice for the requested language.
 *   Priority order:
 *     Arabic : ar-SA → ar-JO → any ar-* → null
 *     English: en-US → any en-* → null
 *
 *   Returns null when no matching voice is installed; speakText() handles
 *   that fallback (still attempts playback, shows one-time tip).
 */
function pickVoice(language) {
    if (cachedVoices.length === 0) loadVoices();   // last-chance refresh
    if (cachedVoices.length === 0) return null;

    if (language === "ar") {
        return cachedVoices.find(v => v.lang === "ar-SA") ||
               cachedVoices.find(v => v.lang === "ar-JO") ||
               cachedVoices.find(v => v.lang.toLowerCase().startsWith("ar")) ||
               null;
    }
    return cachedVoices.find(v => v.lang === "en-US") ||
           cachedVoices.find(v => v.lang.toLowerCase().startsWith("en")) ||
           null;
}

/**
 * speakText(text, speakerBtn?)
 *   Reads `text` aloud using the right language voice.
 *   - Detects EN vs AR from the text itself (not from the UI lang).
 *   - If voices haven't loaded yet, retries once after 200 ms.
 *   - Shows a one-time toast tip if no Arabic voice is installed.
 *   - Synthesis errors are LOGGED only, never shown to the user.
 */
function speakText(text, speakerBtn = null) {
    if (!synth || !text) return;

    // Stop anything currently playing — never overlap voices
    stopSpeaking();

    // If the browser hasn't returned voices yet, defer once (Chrome quirk)
    if (!voicesLoaded) {
        loadVoices();
        if (!voicesLoaded) {
            console.log("[MT] Voices not ready yet — retrying speakText in 200ms");
            setTimeout(() => speakText(text, speakerBtn), 200);
            return;
        }
    }

    const replyLang = detectLanguage(text);
    const voice     = pickVoice(replyLang);
    const utter     = new SpeechSynthesisUtterance(cleanForSpeech(text));

    // Set lang + rate based on detected language
    if (replyLang === "ar") {
        utter.lang = "ar-SA";              // hard-coded fallback locale
        utter.rate = VOICE_RATE * 0.95;    // slightly slower for Arabic clarity
    } else {
        utter.lang = "en-US";
        utter.rate = VOICE_RATE;
    }
    utter.pitch  = 1.0;
    utter.volume = 1.0;

    if (voice) {
        utter.voice = voice;
        console.log(`[MT] Speaking with voice: ${voice.name} (${voice.lang})`);
    } else {
        // No matching voice installed — still try to play something
        console.warn(`[MT] No ${replyLang} voice available on this system. Bot will use default voice.`);
        if (replyLang === "ar" && !arabicTipShown) {
            arabicTipShown = true;
            showToast(t().toastVoiceTip, 6000);
        }
    }

    // Visual state for the per-message speaker button + the global voice toggle
    utter.onstart = () => {
        currentUtterance  = utter;
        currentSpeakerBtn = speakerBtn;
        if (speakerBtn) {
            speakerBtn.classList.add("speaking");
            speakerBtn.setAttribute("aria-label", t().ariaStop);
        }
        voiceToggle?.classList.add("is-speaking");
    };
    utter.onend = () => {
        if (speakerBtn) {
            speakerBtn.classList.remove("speaking");
            speakerBtn.setAttribute("aria-label", t().ariaSpeak);
        }
        if (currentSpeakerBtn === speakerBtn) currentSpeakerBtn = null;
        if (currentUtterance === utter)       currentUtterance = null;
        voiceToggle?.classList.remove("is-speaking");
    };
    utter.onerror = (e) => {
        // Synthesis errors are cosmetic — log only, never show to user.
        console.warn("[MT] SpeechSynthesis error (silent):", e.error || e);
        if (speakerBtn) speakerBtn.classList.remove("speaking");
        voiceToggle?.classList.remove("is-speaking");
    };

    synth.speak(utter);
}

function stopSpeaking() {
    if (!synth) return;
    try { synth.cancel(); } catch (_) { /* ignore */ }
    if (currentSpeakerBtn) {
        currentSpeakerBtn.classList.remove("speaking");
        currentSpeakerBtn.setAttribute("aria-label", t().ariaSpeak);
    }
    currentSpeakerBtn = null;
    currentUtterance  = null;
    voiceToggle?.classList.remove("is-speaking");
}


// ─── Per-message speaker button ──────────────────────────────────────────
function createSpeakerButton(text) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "msg-speaker";
    btn.dataset.text = text;
    btn.setAttribute("aria-label", t().ariaSpeak);
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
        <span class="speaker-wave" aria-hidden="true">
            <span></span><span></span><span></span><span></span>
        </span>`;
    btn.addEventListener("click", () => {
        if (btn.classList.contains("speaking")) stopSpeaking();
        else                                    speakText(text, btn);
    });
    return btn;
}


// ─── Global voice mute toggle ────────────────────────────────────────────
function applyVoiceMuted() {
    if (!voiceToggle) return;
    voiceToggle.classList.toggle("muted", voiceMuted);
    const dict = t();
    const ariaVoice = voiceMuted ? dict.ariaVoiceOff : dict.ariaVoiceOn;
    voiceToggle.setAttribute("aria-label", ariaVoice);
    voiceToggle.setAttribute("title",       ariaVoice);
}

// Hide the voice toggle entirely if the browser has no SpeechSynthesis
if (synth && voiceToggle) {
    voiceToggle.addEventListener("click", () => {
        voiceMuted = !voiceMuted;
        localStorage.setItem("mt_voice_muted", String(voiceMuted));
        applyVoiceMuted();
        if (voiceMuted) stopSpeaking();
    });
} else if (voiceToggle) {
    voiceToggle.style.display = "none";
}


// ─── Append a chat message bubble ────────────────────────────────────────
// Both user AND bot bubbles get a speaker button (a "play this aloud"
// control). speakText() auto-detects the per-message language, so a user
// who typed Arabic hears Arabic playback, English hears English, etc.
//
// Auto-speak rules:
//   - Bot replies      → auto-speak when global voice toggle is ON (default).
//   - User own message → NEVER auto-speak (would feel weird right after
//                         typing). The user can still tap the speaker icon
//                         to hear their message read back — useful for
//                         language practice and accessibility.
function appendMessage(role, text) {
    const wrap = document.createElement("div");
    wrap.className = `message ${role}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (role === "bot") {
        /* Arabic replies: RTL + subtle accent stripe (see .bubble--ar in CSS). */
        if (detectLanguage(text) === "ar") {
            bubble.classList.add("bubble--ar");
            bubble.setAttribute("dir", "rtl");
        }
        const content = document.createElement("span");
        content.innerHTML = renderMarkdown(text);
        bubble.appendChild(content);
    } else {
        bubble.textContent = text;
        // Mark the user bubble's text direction by language so Arabic user
        // messages render right-to-left even when the global UI is English.
        if (detectLanguage(text) === "ar") bubble.setAttribute("dir", "rtl");
    }
    wrap.appendChild(bubble);

    // Speaker button for BOTH user and bot bubbles. The .message wrapper is
    // a flex column with align-items:flex-start (bot) or flex-end (user),
    // so the speaker button automatically sits on the bubble's own side.
    if (synth) {
        const speakerBtn = createSpeakerButton(text);
        wrap.appendChild(speakerBtn);
        // Auto-speak ONLY for bot replies, and only when not muted.
        if (role === "bot" && !voiceMuted) speakText(text, speakerBtn);
    }

    chat.appendChild(wrap);
    /* Brief edge flash when a new bubble lands (see .chat-new-pulse in CSS). */
    chat.classList.add("chat-new-pulse");
    setTimeout(() => chat.classList.remove("chat-new-pulse"), 480);
    scrollToBottom();
    return wrap;
}


// ─── Typing indicator ────────────────────────────────────────────────────
let typingEl = null;
function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "message bot";
    const label = document.createElement("div");
    label.className = "typing-label";
    label.textContent = t().thinking;
    const card = document.createElement("div");
    card.className = "typing-card";
    card.setAttribute("role", "status");
    card.setAttribute("aria-label", t().thinking);
    const dots = document.createElement("div");
    dots.className = "typing-indicator";
    dots.innerHTML = "<span></span><span></span><span></span>";
    card.appendChild(label);
    card.appendChild(dots);
    wrap.appendChild(card);
    chat.appendChild(wrap);
    typingEl = wrap;
    scrollToBottom();
}
function hideTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

function scrollToBottom() {
    requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
}

function setLoading(isLoading) {
    sendBtn.disabled  = isLoading;
    input.disabled    = isLoading;
    resetBtn.disabled = isLoading;
    if (chatProgress) chatProgress.classList.toggle("is-active", isLoading);
    if (!isLoading) input.focus();
}


// =========================================================================
//   Send pipeline — single source of truth
//   isSending guard prevents double-fire when the user clicks Send AND
//   presses Enter AND clicks a chip in quick succession.
//   try/catch/finally cleanly separates real network failures from
//   successful responses (no false "network error" bubbles).
// =========================================================================
async function sendMessage(text) {
    if (!text || isSending) {
        console.log(`[MT] sendMessage skipped (text=${!!text}, isSending=${isSending})`);
        return;
    }
    isSending = true;
    console.log("[MT] sendMessage → start:", text);

    appendMessage("user", text);
    setLoading(true);
    showTyping();

    let response;
    try {
        response = await fetch(API_CHAT, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ message: text, lang }),
        });
        console.log("[MT] /api/chat HTTP status:", response.status);
    } catch (err) {
        // ONLY a real network failure ends up here (server unreachable, no
        // internet, CORS). This is the only place that may show a
        // "Connection error" bubble.
        console.error("[MT] fetch failed:", err);
        hideTyping();
        appendMessage("bot", t().connectionErr);
        setLoading(false);
        isSending = false;
        return;
    }

    // Successful HTTP roundtrip — parse + display.
    try {
        const data = await response.json();
        console.log("[MT] /api/chat parsed reply:", { ok: response.ok, provider: data?.provider });
        hideTyping();

        if (!response.ok) {
            // Server returned a 4xx/5xx with an error message
            appendMessage("bot",
                `${t().somethingWrong}: ${data.error || response.statusText}.`);
        } else {
            appendMessage("bot", data.reply || t().emptyReply);
        }
    } catch (err) {
        // JSON parse failure on a 200 response — extremely rare
        console.error("[MT] response JSON parse failed:", err);
        hideTyping();
        appendMessage("bot", t().somethingWrong);
    } finally {
        setLoading(false);
        isSending = false;
        console.log("[MT] sendMessage → done");
    }
}


// ─── Form submit (covers BOTH Send button click and Enter key) ───────────
form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    hideSuggestions();
    sendMessage(text);
});


// ─── Suggestion chips ────────────────────────────────────────────────────
suggestions?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const text = chip.textContent.trim();
    if (!text) return;
    hideSuggestions();
    sendMessage(text);
});
function hideSuggestions() {
    if (suggestions && !suggestions.classList.contains("hidden")) {
        suggestions.classList.add("hidden");
    }
}
function showSuggestions() {
    if (suggestions) suggestions.classList.remove("hidden");
}


// ─── Send button ripple (purely visual; doesn't trigger send) ────────────
sendBtn.addEventListener("click", (e) => {
    if (sendBtn.disabled) return;
    const rect = sendBtn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.width  = ripple.style.height = `${size}px`;
    ripple.style.left   = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top    = `${e.clientY - rect.top  - size / 2}px`;
    sendBtn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
});


// ─── Reset conversation ──────────────────────────────────────────────────
// Clears the chat and re-renders the greeting bubble. CRITICAL: we keep
// the data-i18n attributes on the rebuilt greeting so future language
// toggles can still find and translate it. (Without these attributes the
// greeting would freeze to whatever language was active at reset time.)
resetBtn.addEventListener("click", async () => {
    stopSpeaking();
    try { await fetch("/reset", { method: "POST" }); } catch (_) {}

    const dict = t();
    chat.innerHTML =
        `<div class="day-divider"><span id="timestamp"></span></div>` +
        `<div class="message bot" id="greetingMessage">` +
            `<span class="online-dot" aria-hidden="true"></span>` +
            `<div class="bubble greeting-bubble"></div>` +
        `</div>`;

    // Single source of truth for greeting bubble content — same function
    // used by applyLang(), so behaviour stays identical.
    refreshGreeting(dict);
    updateTimestamp();

    showSuggestions();
    input.focus();
});


// =========================================================================
//   BUG 1 FIX — Voice input (SpeechRecognition / webkitSpeechRecognition)
//
//   This block:
//     * detects whether the browser supports speech recognition;
//       hides the mic button if it doesn't
//     * uses ONE global recognition instance (no leaks)
//     * picks the recognition language from the UI language toggle
//       (Arabic UI → ar-SA, English UI → en-US)
//     * wires up start / result / error / end events properly
//     * shows a clear LISTENING state (red pulse, see CSS .mic-btn.listening)
//     * gives a SPECIFIC toast for every error type (no generic "didn't work")
//     * silently ignores Chrome's false-positive errors that fire AFTER a
//       successful transcript (recognitionGotResult flag)
// =========================================================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition          = null;
let isListening          = false;
let recognitionTimer     = null;
let savedPlaceholder     = "";
let recognitionGotResult = false;   // ← key flag: "did THIS session succeed?"

// =========================================================================
//   Mic recognition language — derived from the global UI language
// =========================================================================
//
// The Web Speech API does NOT auto-detect language. recognition.lang must
// be set explicitly BEFORE every .start() call. We use the SAME language as
// the UI: Arabic UI → ar-JO (with ar-SA fallback), English UI → en-US.
//
// Supported Arabic codes (best → worst for Jordanian users):
//   ar-JO → Jordanian Arabic (best, but limited browser support)
//   ar-SA → Saudi Arabic (most widely supported, decent fallback)
//
// → If ar-JO fails with "language-not-supported", we automatically retry
//   once with ar-SA (see the onerror handler below + triedFallbackLang).

let triedFallbackLang = false;   // becomes true after first ar-JO → ar-SA fallback

const langCodes = {
    en: "en-US",
    ar: "ar-JO",   // primary; ar-SA used as fallback when not supported
};

/** Bilingual mic-error messages keyed off the global UI lang. */
const MIC_ERR = {
    ar: {
        "no-speech":     "ما سمعت إشي، حاول كمان مرة",
        "audio-capture": "ما في مايكروفون، تأكد من الجهاز",
        "not-allowed":   "لازم تسمح بالوصول للمايكروفون من إعدادات المتصفح",
        "service-not-allowed": "خدمة الميكروفون مرفوضة من المتصفح. افتح الموقع من 127.0.0.1 أو https.",
        "network":       "في مشكلة بالشبكة",
        "default":       "صار خطأ، جرب تكتب بدل",
    },
    en: {
        "no-speech":     "I didn't hear anything. Try again.",
        "audio-capture": "No microphone detected.",
        "not-allowed":   "Please allow microphone access in browser settings.",
        "service-not-allowed": "Browser blocked the speech service. Open via 127.0.0.1 or HTTPS.",
        "network":       "Network issue with the microphone service.",
        "default":       "An error occurred. Try typing.",
    },
};

/**
 * Pick the recognition language code from the GLOBAL UI language `lang`.
 * Re-reads the current value on every call, so flipping the language
 * toggle immediately changes what the mic listens for on the next click.
 */
function getRecognitionLang() {
    if (lang === "ar") {
        return triedFallbackLang ? "ar-SA" : langCodes.ar;
    }
    return langCodes.en;
}

if (SpeechRecognition) {
    // Build a SINGLE recognition instance and reuse it for every click.
    // (Creating a new one each click leaks listeners and causes weird bugs.)
    recognition = new SpeechRecognition();
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;

    // ── onstart: browser is now listening ──────────────────────────────
    recognition.onstart = () => {
        isListening          = true;
        recognitionGotResult = false;
        micBtn.classList.add("listening");
        form.classList.add("listening");
        savedPlaceholder  = input.placeholder;
        input.placeholder = t().listeningHint;

        // Safety net: stop after 10 seconds if onresult/onend never fire
        clearTimeout(recognitionTimer);
        recognitionTimer = setTimeout(() => {
            try { recognition.stop(); } catch (_) {}
        }, 10000);

        console.log("[MT] recognition started — lang =", recognition.lang);
    };

    // ── onresult: speech captured successfully ─────────────────────────
    recognition.onresult = (event) => {
        clearTimeout(recognitionTimer);
        const transcript = (event.results[0][0].transcript || "").trim();
        if (!transcript) return;

        recognitionGotResult = true;   // any later "error" is a false-positive
        console.log("[MT] recognition result:", transcript);

        // Show the captured phrase in the input briefly, then auto-send
        input.value = transcript;
        hideSuggestions();
        setTimeout(() => {
            sendMessage(transcript);
            input.value = "";
        }, 250);
    };

    // ── onerror: real or false-positive issue ──────────────────────────
    recognition.onerror = (event) => {
        clearTimeout(recognitionTimer);
        const err = event.error;
        console.warn("[MT] recognition error:", err, "(gotResult:", recognitionGotResult, ")");

        // Auto-fallback: ar-JO not supported on this browser → retry once with ar-SA
        if (err === "language-not-supported" && lang === "ar" && !triedFallbackLang) {
            triedFallbackLang = true;
            console.log("[MT] ar-JO not supported here — retrying with ar-SA");
            setTimeout(() => startListening(), 100);
            return;
        }

        // Silently ignore: user cancelled, OR an error fired AFTER a
        // successful result (Chrome's well-known false "network"/"no-speech"
        // events that follow good transcripts).
        if (err === "aborted") return;
        if (recognitionGotResult) return;

        // Real errors → bilingual toast in the current UI language.
        const errs = MIC_ERR[lang] || MIC_ERR.en;
        const msg  = (errs[err] !== undefined) ? errs[err] : errs.default;
        if (msg) showToast(msg, 5000);
    };

    // ── onend: recognition session finished ────────────────────────────
    recognition.onend = () => {
        clearTimeout(recognitionTimer);
        isListening = false;
        micBtn.classList.remove("listening");
        form.classList.remove("listening");
        if (savedPlaceholder) {
            input.placeholder = savedPlaceholder;
            savedPlaceholder  = "";
        }
        console.log("[MT] recognition ended");
    };

} else {
    // Browser doesn't support speech recognition (Firefox, older Safari, etc.)
    micBtn.classList.add("hidden");
    micBtn.title = "Voice input is not supported in this browser. Please use Chrome or Edge.";
    console.warn("[MT] SpeechRecognition is NOT supported in this browser.");
}

/** Start listening — guarded against double-start. */
function startListening() {
    if (!recognition) return;

    // Always re-set the language because the user might have toggled UI lang
    recognition.lang = getRecognitionLang();

    if (isListening) {
        // Click again while listening → toggle off
        try { recognition.stop(); } catch (_) {}
        return;
    }

    // CRITICAL BUG FIX: reset this flag HERE, not only inside onstart.
    // If a previous session succeeded (recognitionGotResult === true) and the
    // next session fails before onstart fires (e.g. permission revoked or denied),
    // the onerror handler would see recognitionGotResult === true and silently
    // swallow the error — user clicks mic, nothing happens, no toast shown.
    // Resetting it here gives every new session a clean slate.
    recognitionGotResult = false;

    // recognition.start() throws InvalidStateError if a previous session is
    // still alive somewhere — wrap in try/catch and retry after a tick.
    try {
        recognition.start();
    } catch (e) {
        console.warn("[MT] recognition.start() threw — retrying:", e);
        try { recognition.stop(); } catch (_) {}
        setTimeout(() => {
            try { recognition.start(); } catch (_) {}
        }, 250);
    }
}

function stopListening() {
    if (!recognition || !isListening) return;
    try { recognition.stop(); } catch (_) {}
}

micBtn.addEventListener("click", () => {
    isListening ? stopListening() : startListening();
});


// ─── Header toggle wiring (lang + theme) ─────────────────────────────────
langToggle.addEventListener("click", () => {
    if (isListening) stopListening();
    stopSpeaking();
    // Give ar-JO a fresh chance on the next mic click after a language flip
    triedFallbackLang = false;
    applyLang(lang === "en" ? "ar" : "en");
});
themeToggle.addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark");
});


// ─── Initial setup (runs on page load) ───────────────────────────────────
applyTheme(theme);
applyLang(lang);
updateTimestamp();
applyVoiceMuted();

// On full window load, just focus the input + ensure the chat is scrolled
// to the bottom. The greeting (and its speaker button) was already rendered
// + translated by applyLang() during initial setup above.
window.addEventListener("load", () => {
    input.focus();
    scrollToBottom();
});
