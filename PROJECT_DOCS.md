# 📚 توثيق كامل لمشروع MT Medical Chatbot

> **آخر تحديث**: مايو 2026  
> **اللغة**: العربية (مع المصطلحات التقنية بالإنجليزي)  
> **التركيز**: شرح شامل للمشروع مع تعمّق خاص بـ **TTS** و **STT**

---

## 📋 جدول المحتويات

1. [نظرة عامة على المشروع](#1-نظرة-عامة-على-المشروع)
2. [البنية المعمارية (Architecture)](#2-البنية-المعمارية-architecture)
3. [هيكل المجلدات والملفات](#3-هيكل-المجلدات-والملفات)
4. [موديلات الذكاء الاصطناعي للشات](#4-موديلات-الذكاء-الاصطناعي-للشات)
5. [🎙️ تقنيات TTS — تحويل النص لصوت (شرح متعمّق)](#5-️-تقنيات-tts--تحويل-النص-لصوت-شرح-متعمّق)
6. [🎤 تقنيات STT — تحويل الصوت لنص (شرح متعمّق)](#6--تقنيات-stt--تحويل-الصوت-لنص-شرح-متعمّق)
7. [مقارنة التكاليف](#7-مقارنة-التكاليف)
8. [دعم المتصفحات](#8-دعم-المتصفحات)
9. [API Endpoints](#9-api-endpoints)
10. [التشغيل والتثبيت](#10-التشغيل-والتثبيت)
11. [الأمان والمتغيرات البيئية](#11-الأمان-والمتغيرات-البيئية)
12. [حل المشاكل الشائعة (Troubleshooting)](#12-حل-المشاكل-الشائعة-troubleshooting)

---

## 1) نظرة عامة على المشروع

المشروع عبارة عن **مجموعة من تطبيقين مستقلين** بنفس الـ workspace:

### 🩺 التطبيق الأول: MT Medical Assistant
شات بوت طبي ثنائي اللغة (إنجليزي + عربي أردني) بستخدم 4 مزودين للذكاء الاصطناعي مع `fallback` تلقائي. عنده ميزات صوت كاملة (تحويل الرد لصوت + إدخال صوتي بالميكروفون).

### 🗣️ التطبيق الثاني: SpeakUp
تطبيق تعليم لفظ على غرار **Duolingo Speak** و **ELSA**. بعلّم اللهجة الأردنية الحقيقية + الإنجليزية الأمريكية. بستخدم Microsoft Azure للحصول على جودة احترافية.

| الميزة | MT Medical | SpeakUp |
|---|---|---|
| الهدف | استشارات طبية عامة | تعليم لفظ ثنائي اللغة |
| الـ AI Provider | OpenAI / Gemini / Claude / Demo | لا يوجد (ما بحتاج) |
| TTS | Web Speech API (مجاني) | Azure Neural TTS (مدفوع/مجاني محدود) |
| STT | Web Speech API (مجاني) | Azure Speech SDK + Pronunciation Assessment |
| البورت | 5000 | 5050 |
| اللهجة العربية | فصحى (قيد المتصفح) | لهجة أردنية حقيقية ✨ |

---

## 2) البنية المعمارية (Architecture)

### معمارية MT Medical Assistant

```
┌─────────────────────────────────────────────────┐
│  المتصفح (Frontend)                              │
│  ─────────────────                               │
│  • templates/welcome.html  → شاشة الترحيب         │
│  • templates/index.html    → واجهة الشات          │
│  • static/script.js        → منطق الشات + الصوت    │
│  • static/style.css        → تصميم متجاوب         │
│                                                  │
│  Web Speech API:                                 │
│   ├─ speechSynthesis    → يحوّل نص لصوت           │
│   └─ SpeechRecognition  → يحوّل صوت لنص           │
└─────────────────────────────────────────────────┘
                    │
                    │ POST /api/chat
                    ▼
┌─────────────────────────────────────────────────┐
│  Flask Backend (app.py)                          │
│  ─────────────────────                           │
│  • detect_provider()  → يختار الـ AI المناسب      │
│  • detect_user_language() → عربي ولا إنجليزي؟      │
│  • SYSTEM_PROMPT      → تعليمات الشات             │
│  • demo_reply()       → ردود جاهزة لـ fallback    │
└─────────────────────────────────────────────────┘
                    │
                    ▼ (حسب المفتاح المتوفر)
┌─────────────────────────────────────────────────┐
│  AI Providers                                    │
│   ├─ OpenAI       (gpt-4o-mini)                  │
│   ├─ Google       (gemini-1.5-flash)             │
│   ├─ Anthropic    (claude-sonnet-4-5)            │
│   └─ Demo Mode    (regex pattern matching)       │
└─────────────────────────────────────────────────┘
```

### معمارية SpeakUp

```
┌─────────────────────────────────────────────────┐
│  المتصفح                                          │
│  ──────                                          │
│  • templates/index.html  → صفحة الدروس            │
│  • static/app.js         → منطق التشغيل           │
│  • Microsoft Speech SDK (CDN)                    │
└─────────────────────────────────────────────────┘
       │                              │
       │ POST /api/tts                │ GET /api/speech-token
       ▼                              ▼
┌──────────────────────┐    ┌─────────────────────┐
│  Flask Proxy (TTS)   │    │  Token Generator    │
│  app.py              │    │  app.py             │
└──────────────────────┘    └─────────────────────┘
       │                              │
       ▼                              ▼ (token صالح 10 دقايق)
┌─────────────────────────────────────────────────┐
│  Microsoft Azure Speech Services                 │
│  ───────────────────────────                     │
│  • TTS REST API (MP3 streaming)                  │
│  • Pronunciation Assessment (browser SDK)        │
└─────────────────────────────────────────────────┘
```

> **مبدأ معماري مهم**: في SpeakUp، الـ STT بشتغل **مباشرة من المتصفح** (مش من السيرفر). السبب إنه أزور بقدم SDK ذكي بياخد الـ mic capture + encoding + streaming بضربة وحدة. الـ Flask دوره يعطي token مؤقت بس عشان مفتاح Azure ما يطلع للـ frontend.

---

## 3) هيكل المجلدات والملفات

```
medical-chatbot/
│
├── app.py                          ← Flask backend الرئيسي (شات MT)
├── requirements.txt                ← Python deps: flask, openai, gemini, anthropic
├── .env                            ← مفاتيح API (مش بـ Git)
├── .gitignore                      ← يستثني .env و venv/ و __pycache__/
├── PROJECT_DOCS.md                 ← هذا الملف
│
├── templates/
│   ├── welcome.html                ← شاشة splash مع animations
│   └── index.html                  ← واجهة الشات الرئيسية
│
├── static/
│   ├── welcome.css                 ← تصميم شاشة الترحيب
│   ├── welcome.js                  ← منطق الترحيب (تبديل اللغة)
│   ├── style.css                   ← تصميم الشات (905 سطر)
│   └── script.js                   ← منطق الشات + TTS + STT (1091 سطر) ⭐
│
└── speakup/                        ← مشروع منفصل (تعليم لفظ)
    ├── app.py                      ← Flask backend مع Azure proxy
    ├── requirements.txt            ← deps أبسط: flask, requests, dotenv
    ├── lessons.json                ← قاعدة الدروس (إنجليزي + أردني)
    ├── .env.example                ← قالب لمفاتيح Azure
    ├── README.md                   ← شرح SpeakUp بالتفصيل
    │
    ├── templates/
    │   └── index.html              ← واجهة الدروس
    │
    └── static/
        ├── style.css               ← تصميم SpeakUp
        └── app.js                  ← منطق التطبيق + Azure SDK calls
```

### مسؤوليات كل ملف

| الملف | المسؤولية الأساسية | السطور |
|---|---|---|
| `app.py` | Flask routes, AI provider detection, demo fallback, system prompt | 556 |
| `static/script.js` | كل منطق الـ frontend: شات, TTS, STT, i18n, theme | 1091 |
| `static/style.css` | كل التصميم (light/dark + LTR/RTL) | 905 |
| `speakup/app.py` | Flask proxy لـ Azure + token issuer | 322 |
| `speakup/static/app.js` | تشغيل الدروس + استدعاء Azure SDK | ~400 |

---

## 4) موديلات الذكاء الاصطناعي للشات

`app.py` بستخدم نمط **Strategy Pattern**: بكتشف أول مفتاح متوفر بـ `.env` وبستخدمه. لو ما في ولا مفتاح، بنزل لـ **Demo Mode**.

### كود الاكتشاف

```92:100:app.py
def detect_provider() -> str:
    """Return the first provider whose key is set; fall back to 'demo'."""
    if _is_real_key((os.getenv("OPENAI_API_KEY") or "").strip()):
        return "openai"
    if _is_real_key((os.getenv("GEMINI_API_KEY") or "").strip()):
        return "gemini"
    if _is_real_key((os.getenv("ANTHROPIC_API_KEY") or "").strip()):
        return "anthropic"
    return "demo"
```

### ترتيب الأولوية (الأول اللي بنلاقيه بنستخدمه)

| # | المزود | الموديل | متى يُختار؟ |
|---|---|---|---|
| 1 | **OpenAI** | `gpt-4o-mini` | إذا `OPENAI_API_KEY` متوفر |
| 2 | **Google Gemini** | `gemini-1.5-flash` | إذا `GEMINI_API_KEY` متوفر |
| 3 | **Anthropic** | `claude-sonnet-4-5` | إذا `ANTHROPIC_API_KEY` متوفر |
| 4 | **Demo Mode** | Regex Patterns | لما ما يكون في ولا مفتاح |

### Demo Mode — كيف بشتغل؟

لما ما يكون في API key، التطبيق **ما بكسر** بل بستخدم نظام `regex` لمطابقة كلمات مفتاحية وإرجاع رد جاهز:

```466:478:app.py
def demo_reply(user_message: str) -> str:
    """Pattern-match a user message and return a canned reply in the SAME
    language the user wrote (English or Jordanian Arabic)."""
    user_lang = detect_user_language(user_message)
    responses = DEMO_RESPONSES_AR if user_lang == "ar" else DEMO_RESPONSES_EN
    footer    = DEMO_FOOTER[user_lang]

    text_lower = user_message.lower()
    for pattern, key in DEMO_PATTERNS:
        # Try original case first (Arabic doesn't lowercase), then lowercase.
        if re.search(pattern, user_message) or re.search(pattern, text_lower):
            return responses[key] + footer
    return responses["DEFAULT"] + footer
```

التصنيفات المغطاة بـ Demo Mode:
- `EMERGENCY` (طوارئ)
- `GREETING` (تحية)
- `HEADACHE` (صداع)
- `THROAT` (حلق)
- `STOMACH` (معدة)
- `SLEEP` (نوم)
- `FEVER` (حرارة)
- `COLD` (رشح)
- `DIZZY` (دوخة)
- `ANXIETY` (قلق)
- `DEFAULT` (افتراضي)

كل تصنيف عنده **نسختين**: إنجليزي و أردني. الكود بكتشف لغة المستخدم ويرد بنفس اللغة.

### نظام Fallback عند فشل الـ API

```536:541:app.py
    except Exception as e:
        # Real API failed — fall back to demo so the chat NEVER crashes
        print(f"[MT] {PROVIDER} call failed: {e!r} — falling back to demo mode.")
        reply = FALLBACK_PREFIX[user_lang] + demo_reply(user_message)
        conversation_history.append({"role": "assistant", "content": reply})
        return jsonify({"reply": reply, "provider": "demo-fallback"})
```

> **بمعنى آخر**: حتى لو الـ AI service وقع، المستخدم بضل يحصل على رد بدل ما يشوف صفحة خطأ.

---

## 5) 🎙️ تقنيات TTS — تحويل النص لصوت (شرح متعمّق)

### TTS بـ MT Medical Assistant

#### التقنية المستخدمة: `Web Speech API → SpeechSynthesis`

هذي **API مدمجة بالمتصفح** (بدون أي مكتبة خارجية). الكود بستدعيها مباشرة:

```432:458:static/script.js
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
```

#### كيف بختار الصوت المناسب؟

```470:483:static/script.js
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
```

**أولوية اختيار الصوت:**

| اللغة المطلوبة | المحاولة 1 | المحاولة 2 | المحاولة 3 | الأخير |
|---|---|---|---|---|
| عربي | `ar-SA` (سعودي) | `ar-JO` (أردني) | أي `ar-*` | `null` (تحذير) |
| إنجليزي | `en-US` | أي `en-*` | — | `null` |

#### كشف اللغة من النص نفسه

```407:414:static/script.js
function detectLanguage(text) {
    if (!text) return "en";
    const arabicMatches      = text.match(/[\u0600-\u06FF]/g);
    const arabicCount        = arabicMatches ? arabicMatches.length : 0;
    const totalNonSpaceChars = text.replace(/\s/g, "").length;
    if (totalNonSpaceChars === 0) return "en";
    return (arabicCount / totalNonSpaceChars >= 0.3) ? "ar" : "en";
}
```

> 🔑 **مفتاح الذكاء**: بستخدم نسبة 30% — لو 30% من الحروف عربية → بعتبر النص عربي. هذا بفيد للنصوص المختلطة متل: `"Take 1 paracetamol وشرب مَي"`.

#### تنظيف النص قبل النطق

علشان الصوت ما يقرأ علامات الـ markdown (نجمات/شرطات سفلية...):

```417:426:static/script.js
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
```

#### دالة النطق الرئيسية

```493:563:static/script.js
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
    // ... باقي الكود
```

### القيود المهمة لـ Web Speech API

| القيد | الشرح |
|---|---|
| **اللهجة العربية** | متصفحك بنطق فصحى، مش لهجة أردنية |
| **جودة الصوت** | بيعتمد على نظام التشغيل (Windows TTS أبسط من Mac) |
| **التوفر** | الصوت العربي مش مثبّت تلقائياً على ويندوز — لازم تنزله يدوياً |
| **عدم التماثل** | كل متصفح/نظام بعطي أصوات مختلفة |

---

### TTS بـ SpeakUp (الأفضل!)

#### التقنية: Microsoft Azure Neural TTS (REST API)

بدل ما نعتمد على المتصفح، SpeakUp بنادي **Azure Cognitive Services** عبر REST API:

```236:271:speakup/app.py
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
```

#### الأصوات المستخدمة (Neural Voices)

```84:87:speakup/app.py
AZURE_SPEECH_KEY = os.getenv("AZURE_SPEECH_KEY", "").strip()
AZURE_REGION     = os.getenv("AZURE_REGION", "eastus").strip()
TTS_VOICE_AR     = os.getenv("TTS_VOICE_AR", "ar-JO-SanaNeural").strip()
TTS_VOICE_EN     = os.getenv("TTS_VOICE_EN", "en-US-JennyNeural").strip()
```

| اللغة | الصوت | الوصف |
|---|---|---|
| 🇯🇴 عربي أردني | `ar-JO-SanaNeural` | صوت أنثى — لهجة أردنية حقيقية |
| 🇯🇴 عربي أردني | `ar-JO-TaimNeural` | صوت ذكر — لهجة أردنية حقيقية |
| 🇺🇸 إنجليزي أمريكي | `en-US-JennyNeural` | صوت أنثى طبيعي |
| 🇺🇸 إنجليزي أمريكي | `en-US-GuyNeural` | صوت ذكر |

#### بنية SSML (Speech Synthesis Markup Language)

```109:133:speakup/app.py
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
```

> **SSML** هي XML بتسمحلك تتحكم بالـ **prosody** (السرعة, النبرة, الإيقاف). هون بستخدمها لتغيير سرعة النطق من 0.5× لـ 1.5×.

#### مقارنة مباشرة: MT vs SpeakUp في TTS

| المعيار | MT (Web Speech API) | SpeakUp (Azure) |
|---|---|---|
| التكلفة | 🟢 مجاني للأبد | 🟡 مجاني محدود ثم مدفوع |
| اللهجة الأردنية | ❌ فصحى فقط | ✅ لهجة حقيقية |
| جودة الصوت | متوسطة | عالية (Neural) |
| التحكم بالسرعة | محدود | كامل (SSML) |
| ثبات النتائج | يعتمد على المتصفح/النظام | متطابق دائماً |
| الإنترنت مطلوب | للعربي فقط | دائماً |
| API Key مطلوب | ❌ | ✅ |

---

## 6) 🎤 تقنيات STT — تحويل الصوت لنص (شرح متعمّق)

### STT بـ MT Medical Assistant

#### التقنية: `Web Speech API → SpeechRecognition`

```868:868:static/script.js
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
```

> **ملاحظة مهمة**: تحت الكواليس، Chrome بستخدم سيرفرات Google السحابية للتعرف على الكلام. يعني صوتك بنرفع لـ Google ويرجع نص. هذا **مجاني للمستخدم النهائي**، بس Google بستخدم البيانات لتدريب موديلاتها.

#### إعداد الـ Recognition Instance

```931:937:static/script.js
if (SpeechRecognition) {
    // Build a SINGLE recognition instance and reuse it for every click.
    // (Creating a new one each click leaks listeners and causes weird bugs.)
    recognition = new SpeechRecognition();
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.maxAlternatives = 1;
```

**الإعدادات المختارة:**

| الإعداد | القيمة | الشرح |
|---|---|---|
| `continuous` | `false` | بوقف بعد جملة واحدة (مش streaming مستمر) |
| `interimResults` | `false` | ما بنبعت نتائج جزئية أثناء الكلام |
| `maxAlternatives` | `1` | بنرجع أفضل تخمين فقط |

#### نظام Fallback ذكي للهجة الأردنية

الكود بحاول أول شي `ar-JO`، ولو ما اشتغل بنزل لـ `ar-SA`:

```892:929:static/script.js
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
```

#### دورة حياة جلسة التعرف على الصوت

```
┌────────────────┐
│ user clicks 🎤  │
└────────┬───────┘
         ▼
┌─────────────────────┐
│ recognition.start() │ ────► onstart  → red pulse animation
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│ user speaks         │
└─────────┬───────────┘
          │
   ┌──────┴──────┐
   ▼             ▼
┌──────────┐  ┌──────────┐
│ onresult │  │ onerror  │
│ ✅ نجاح  │  │ ❌ فشل   │
└────┬─────┘  └────┬─────┘
     ▼              ▼
┌────────┐      ┌────────────┐
│sendMsg │      │showToast   │
└────────┘      └────────────┘
```

#### معالجة الأخطاء الذكية

الكود بتعامل مع أخطاء Chrome الكاذبة:

```976:999:static/script.js
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
```

**الأخطاء المحتملة:**

| كود الخطأ | السبب | الحل |
|---|---|---|
| `no-speech` | المستخدم ما حكى إشي | يحاول كمان مرة |
| `audio-capture` | ما في ميكروفون | يفحص الجهاز |
| `not-allowed` | المستخدم رفض إذن الميكروفون | إعدادات المتصفح |
| `service-not-allowed` | المتصفح رفض الخدمة | فتح الصفحة من `127.0.0.1` أو HTTPS |
| `network` | فشل الاتصال بسيرفر Google | فحص الإنترنت |
| `language-not-supported` | اللغة مش مدعومة | fallback تلقائي لـ `ar-SA` |

---

### STT بـ SpeakUp (متقدم!)

#### التقنية: Microsoft Speech SDK + Pronunciation Assessment

SpeakUp ما بستخدم Web Speech API. بستخدم **Microsoft Speech SDK for JavaScript** اللي بشتغل مباشرة بالمتصفح وبتصل بـ Azure مباشرة (مش عبر Flask).

#### الفرق المهم: STT العادي vs Pronunciation Assessment

| الميزة | STT عادي | Pronunciation Assessment |
|---|---|---|
| الوظيفة | يحول صوت لنص | يحول + **يقيّم النطق** |
| الإخراج | نص فقط | نص + درجات 0-100 |
| الاستخدام | إدخال صوتي | تعليم لغات |
| التكلفة | $1/ساعة | $1/ساعة (نفس السعر!) |

#### كيف بشتغل التقييم؟

```328:389:speakup/static/app.js
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
```

#### الدرجات المرجعة من Azure

| الدرجة | الشرح | المثال |
|---|---|---|
| `accuracyScore` | قد إيش كل صوت قريب من النطق الأصلي | 87/100 |
| `fluencyScore` | الإيقاع، الوقفات، الطلاقة | 92/100 |
| `completenessScore` | قلت كل الكلمات؟ | 100/100 |
| `pronunciationScore` | المتوسط المرجح للثلاثة | 90/100 |
| `Words[i].AccuracyScore` | درجة كل كلمة على حدة | لكل كلمة |
| `Words[i].ErrorType` | نوع الخطأ (None/Mispronunciation/Omission/Insertion) | per word |

#### كيف تشتغل التكنولوجيا تحت الكواليس؟

Azure بقسم كل كلمة لـ **Phonemes** (الأصوات الأساسية للغة):
- الإنجليزية فيها ~44 phoneme
- العربية فيها ~28 phoneme

ولكل phoneme بقارن:
- **Pitch** (نغمة الصوت)
- **Energy** (قوة الصوت)
- **Duration** (مدة النطق)

مع موديل ناطق أصلي ويعطي درجة. بعدين بجمع درجات الـ phonemes للكلمة، وبعدين الكلمات للجملة.

#### نظام Token الآمن

```170:208:speakup/app.py
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
```

> 🔐 **مبدأ أمني مهم**: الـ `AZURE_SPEECH_KEY` ما بطلع للمتصفح أبداً. السيرفر بطلب من Azure token مؤقت (10 دقايق)، وهذا الـ token هو اللي بنبعت للمتصفح.

---

## 7) مقارنة التكاليف

### التقنيات الصوتية

| التقنية | السعر | الحد المجاني |
|---|---|---|
| **Web Speech API (TTS)** | 🟢 مجاني | بدون حد |
| **Web Speech API (STT)** | 🟢 مجاني | بدون حد رسمي |
| **Azure Neural TTS** | $16 / مليون حرف | 500k حرف/شهر مجاناً (F0) |
| **Azure Pronunciation Assessment** | $1 / ساعة | 5 ساعات/شهر مجاناً (F0) |

### موديلات الـ AI (لكل مليون توكن)

| المزود | الموديل | إدخال | إخراج | طبقة مجانية |
|---|---|---|---|---|
| **Demo** | لا يوجد | $0 | $0 | غير محدود |
| **Google** | `gemini-1.5-flash` | $0.075 | $0.30 | 1500 طلب/يوم |
| **OpenAI** | `gpt-4o-mini` | $0.15 | $0.60 | لا يوجد |
| **Anthropic** | `claude-sonnet-4-5` | $3 | $15 | لا يوجد |

### سيناريوهات حقيقية

| السيناريو | التكلفة الشهرية |
|---|---|
| تطبيق تجريبي محلي (بس أنت) | 🟢 **$0** (Demo + Web Speech) |
| 100 مستخدم/شهر، 50 رسالة/مستخدم بـ Gemini | 🟢 **~$0** (ضمن Free Tier) |
| 1000 مستخدم نشط بـ GPT-4o-mini | 🟡 **~$10-15** |
| 1000 مستخدم نشط بـ Azure TTS كامل | 🟡 **~$40-60** |
| 10,000 مستخدم نشط بـ Claude + Azure | 🔴 **~$500+** |

---

## 8) دعم المتصفحات

### MT Medical Assistant

| المتصفح | الشات | TTS | STT |
|---|---|---|---|
| Chrome | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ⚠️ محدود |
| Firefox | ✅ | ✅ | ❌ |
| Opera/Brave | ✅ | ✅ | ⚠️ |

### SpeakUp

| المتصفح | الشات | TTS | STT |
|---|---|---|---|
| Chrome | ✅ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ | ⚠️ |
| Firefox | ⚠️ | ⚠️ | ❌ |

### قواعد عامة

1. **الميكروفون لازم يكون على مصدر آمن**: `localhost`, `127.0.0.1`, أو `https://`
2. **لا يشتغل على IPs محلية**: `192.168.x.x` بترفض المتصفحات الميكروفون
3. **Chrome / Edge هم الأفضل** لكل الميزات الصوتية

---

## 9) API Endpoints

### MT Medical (`app.py` — port 5000)

| المسار | الميثود | الوصف | الـ Body |
|---|---|---|---|
| `/` | GET | شاشة الترحيب | — |
| `/chat` | GET | واجهة الشات | — |
| `/api/chat` | POST | إرسال رسالة وأخذ رد | `{"message": "..."}` |
| `/reset` | POST | مسح المحادثة | — |

#### مثال على `/api/chat`

```bash
curl -X POST http://127.0.0.1:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "عندي صداع"}'
```

الرد:
```json
{
  "reply": "الله يعطيك العافية، الصداع شي مزعج فعلاً...",
  "provider": "openai"
}
```

### SpeakUp (`speakup/app.py` — port 5050)

| المسار | الميثود | الوصف | الـ Body |
|---|---|---|---|
| `/` | GET | صفحة الدروس | — |
| `/api/lessons` | GET | قائمة الدروس | — |
| `/api/tts` | POST | تحويل نص لـ MP3 | `{"text", "language", "speed"}` |
| `/api/speech-token` | GET | token مؤقت لـ Azure | — |
| `/api/progress` | GET / POST | تتبع التقدم | `{"lesson_id", "score"}` |

---

## 10) التشغيل والتثبيت

### MT Medical Assistant

```powershell
# 1. الدخول للمشروع
cd C:\Users\user\medical-chatbot

# 2. إنشاء بيئة افتراضية
python -m venv venv

# 3. تفعيلها (PowerShell)
.\venv\Scripts\Activate.ps1

# 4. تثبيت الـ dependencies
pip install -r requirements.txt

# 5. إنشاء ملف .env (اختياري — للـ AI)
@"
# اختر واحد من هذول
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
ANTHROPIC_API_KEY=sk-ant-...
"@ | Out-File -Encoding utf8 .env

# 6. التشغيل
python app.py
```

افتح: <http://127.0.0.1:5000>

### SpeakUp

```powershell
# 1. الدخول
cd C:\Users\user\medical-chatbot\speakup

# 2. بيئة افتراضية
python -m venv venv
.\venv\Scripts\Activate.ps1

# 3. التثبيت
pip install -r requirements.txt

# 4. نسخ القالب وملء المفاتيح
copy .env.example .env
notepad .env
# املأ AZURE_SPEECH_KEY و AZURE_REGION

# 5. التشغيل
python app.py
```

افتح: <http://127.0.0.1:5050>

---

## 11) الأمان والمتغيرات البيئية

### مبادئ مطبقة بالمشروع

```1:11:.gitignore
# Never commit your secret API key
.env

# Python cache files
__pycache__/
*.pyc
*.pyo

# Virtual environment folder (if you create one)
venv/
env/
```

### قواعد ذهبية

✅ **افعل:**
- خزّن المفاتيح بـ `.env` فقط
- استعمل `python-dotenv` لقراءة المتغيرات
- خلي `.env` بـ `.gitignore`
- استخدم token مؤقت بدل المفتاح الأصلي بالـ frontend (متل ما عامل SpeakUp)

❌ **لا تفعل:**
- ما تكتب المفتاح بالكود مباشرة
- ما ترفع `.env` على Git
- ما تطبع المفاتيح بالـ console
- ما تبعث المفتاح للـ frontend أبداً

### مثال على ملف `.env`

```env
# للـ MT Medical (واحد فقط بكفي)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
# GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxx
# ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxx

# للـ SpeakUp
AZURE_SPEECH_KEY=8a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p
AZURE_REGION=eastus
TTS_VOICE_AR=ar-JO-SanaNeural
TTS_VOICE_EN=en-US-JennyNeural
```

---

## 12) حل المشاكل الشائعة (Troubleshooting)

### مشاكل TTS

| المشكلة | السبب | الحل |
|---|---|---|
| الصوت ما يشتغل بالعربي | ما عندك صوت عربي مثبت | Settings → Time & Language → Speech → Add voices |
| الصوت يقرأ بإنجليزي بس | المتصفح ما لقى صوت عربي | نفس الحل أعلاه |
| الصوت بطيء جداً أو سريع | إعدادات السرعة | في MT الـ rate ثابت 1.0×، في SpeakUp فيه 0.7/1.0/1.2 |
| Azure TTS بيرجع 403 | تجاوزت حد Free F0 | استنى بداية الشهر الجديد أو ارفع للـ S0 |
| Azure TTS بيرجع 401 | المفتاح خطأ | انسخ KEY 1 من Azure Portal من جديد |

### مشاكل STT

| المشكلة | السبب | الحل |
|---|---|---|
| زر الميكروفون مخفي | المتصفح ما بدعم SpeechRecognition | استخدم Chrome أو Edge |
| ما يطلع طلب إذن للميكروفون | فتحت الموقع من IP بدل localhost | افتح من `http://127.0.0.1` |
| `not-allowed` error | رفضت الإذن سابقاً | إعدادات المتصفح → Site Settings → Microphone |
| التعرف بطيء أو ما بشتغل | مشكلة شبكة (Google STT) | فحص الإنترنت |
| العربي مش متعرف عليه | اللهجة الأردنية مش مدعومة | الكود بنزل تلقائياً لـ `ar-SA` |
| Azure SDK ما بحمل | مشكلة CDN | فحص الإنترنت أو ad-blocker |

### مشاكل عامة

| المشكلة | الحل |
|---|---|
| `ModuleNotFoundError` | شغّل `pip install -r requirements.txt` |
| `Address already in use` | غيّر البورت أو أوقف العملية الشغالة |
| الصفحة بيضا | افحص Console (F12) للأخطاء |
| الـ API يرجع 500 | افحص Terminal لرؤية الـ traceback |

---

## 📊 ملخص نهائي للقرارات المعمارية

| القرار | السبب |
|---|---|
| استخدام 4 AI providers مع fallback | المرونة + ما يكسر التطبيق لو وقع مزود |
| Web Speech API بـ MT بدل Azure | مجاني للأبد، مناسب للاستشارات الطبية البسيطة |
| Azure بـ SpeakUp بدل Web Speech | لازم لهجة أردنية حقيقية + تقييم نطق دقيق |
| Pronunciation Assessment من المتصفح | تقليل الـ bandwidth + تجنب تحويل الصيغ |
| Token مؤقت بدل المفتاح | الأمان: المفتاح ما يطلع للـ frontend |
| Demo Mode بـ regex | يخلي التطبيق شغال بدون أي مفتاح |

---

## 🎓 موارد إضافية للتعلم

### Web Speech API
- [MDN: SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
- [MDN: SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)

### Microsoft Azure Speech
- [Azure Speech Documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/)
- [Pronunciation Assessment Guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment)
- [Speech SDK for JavaScript](https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/)
- [List of Neural Voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)

### AI Providers
- [OpenAI API Docs](https://platform.openai.com/docs/)
- [Google Gemini API](https://ai.google.dev/docs)
- [Anthropic Claude API](https://docs.anthropic.com/)

---

> **ملاحظة أخيرة**: هذا التوثيق بيعكس حالة المشروع كما هو حالياً. أي تعديل بالكود ممكن يغيّر السلوك الموثّق هنا. للاطلاع على آخر التفاصيل، ارجع للكود مباشرة.
