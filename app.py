"""
MT Medical Assistant — Flask Backend
========================================
Routes:
  GET  /           → splash / welcome screen
  GET  /chat       → main chat UI (HTML)
  POST /api/chat   → receives a user message, returns the AI reply as JSON
  POST /reset      → clears the conversation history

Bilingual replies (driven entirely by the system prompt):
  - User writes English  → bot replies in clear, simple English
  - User writes Arabic   → bot replies in authentic JORDANIAN dialect
  - Mixed language       → bot replies in the dominant language

Demo mode also detects the user's input language and replies in the
matching language (English or Jordanian Arabic) — so behavior is
consistent whether or not a real AI key is configured.

Four AI backends, auto-detected from .env (first match wins):
  1. OpenAI GPT       → set OPENAI_API_KEY
  2. Google Gemini    → set GEMINI_API_KEY
  3. Anthropic Claude → set ANTHROPIC_API_KEY
  4. Demo mode        → no key set
"""

import os
import re
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ─── System prompt ───────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are MT, a friendly and professional medical assistant chatbot.

Your role:
- Listen to symptoms and health concerns.
- Give clear, simple, helpful general health information.
- Suggest possible common causes for symptoms in plain language.
- Recommend healthy lifestyle tips when relevant.
- For serious symptoms (chest pain, breathing trouble, severe bleeding,
  stroke signs, suicidal thoughts), urgently advise emergency care.
- Be warm, empathetic, and easy to understand.
- Keep replies short: 2 to 4 short paragraphs maximum.
- Never prescribe specific medications or exact dosages.
- Always remind the user you are NOT a replacement for a real doctor.

Reply in the SAME language the user wrote in:
- If the user writes in English, reply ONLY in clear, simple English.
  End with: Please consult a healthcare professional for proper diagnosis.
- If the user writes in Arabic, reply ONLY in authentic JORDANIAN dialect
  (عامية أردنية), NOT Modern Standard Arabic. Use words like: هلأ، شو، كيفك،
  بدّك، لازم، يا زلمة. End Arabic replies with a reminder such as: بس تذكّر،
  أنا مش بديل عن الدكتور، لازم تشوف دكتور للفحص الصحيح.
"""


# ─── Provider detection ──────────────────────────────────────────────────────
def _is_real_key(value: str) -> bool:
    """A key is 'real' if it's non-empty and not the placeholder text."""
    v = (value or "").lower()
    return bool(v) and "your-key-here" not in v and "your-real-" not in v


def detect_provider() -> str:
    """Return the first provider whose key is set; fall back to 'demo'."""
    if _is_real_key((os.getenv("OPENAI_API_KEY") or "").strip()):
        return "openai"
    if _is_real_key((os.getenv("GEMINI_API_KEY") or "").strip()):
        return "gemini"
    if _is_real_key((os.getenv("ANTHROPIC_API_KEY") or "").strip()):
        return "anthropic"
    return "demo"


PROVIDER = detect_provider()


# ─── Lazy-initialized AI clients ─────────────────────────────────────────────
_openai_client = None
_anthropic_client = None
_gemini_model = None


def openai_reply(history):
    """Call OpenAI GPT and return its text reply."""
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        _openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + history
    response = _openai_client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=1024,
    )
    return response.choices[0].message.content or ""


def anthropic_reply(history):
    """Call Anthropic Claude and return its text reply."""
    global _anthropic_client
    if _anthropic_client is None:
        from anthropic import Anthropic
        _anthropic_client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    response = _anthropic_client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=history,
    )
    return "".join(b.text for b in response.content if b.type == "text")


def gemini_reply(history):
    """Call Google Gemini and return its text reply."""
    global _gemini_model
    if _gemini_model is None:
        import google.generativeai as genai
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        _gemini_model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )

    gem_history = [
        {"role": "user" if m["role"] == "user" else "model",
         "parts": [m["content"]]}
        for m in history[:-1]
    ]
    chat_session = _gemini_model.start_chat(history=gem_history)
    return chat_session.send_message(history[-1]["content"]).text


# ─── Language detection (for demo mode) ──────────────────────────────────────
ARABIC_CHAR_RE = re.compile(r"[\u0600-\u06FF]")


def detect_user_language(text: str) -> str:
    """Return 'ar' if `text` contains any Arabic character, else 'en'."""
    return "ar" if ARABIC_CHAR_RE.search(text or "") else "en"


# ─── Demo replies (English + Jordanian Arabic) ───────────────────────────────
DEMO_FOOTER = {
    "en": ("\n\n_(MT is in **demo mode** — for full AI replies, add a real "
           "API key to your `.env` file.)_"),
    "ar": ("\n\n_(MT شغّال هلق بـ**الوضع التجريبي** — لتفعيل ردود الذكاء "
           "الاصطناعي، حط مفتاح حقيقي بملف `.env`.)_"),
}

DEMO_RESPONSES_EN = {
    "EMERGENCY": (
        "**This sounds serious — please call your local emergency number right "
        "away (911, 112, 999, or whatever applies where you live).**\n\n"
        "Don't wait or try to manage this alone. If someone is with you, tell "
        "them what's happening so they can help. If you're alone, stay on the "
        "line with the dispatcher and they will guide you until help arrives.\n\n"
        "Please consult a healthcare professional immediately — this is beyond "
        "what general advice can cover."
    ),
    "GREETING": (
        "Hi there — it's good to hear from you. I'm MT, your medical assistant. "
        "Tell me what you're feeling: any aches, pains, symptoms, or general "
        "health questions on your mind?\n\n"
        "I'll do my best to give you clear, general information. For anything "
        "specific or serious, please remember to consult a healthcare "
        "professional for proper diagnosis."
    ),
    "HEADACHE": (
        "I'm sorry you're dealing with a headache. Common causes include "
        "dehydration, lack of sleep, eye strain from screens, stress, or "
        "skipping meals. Sometimes posture or muscle tension in the neck plays "
        "a role too.\n\n"
        "Some gentle things that often help: drink a full glass of water, rest "
        "in a quiet dim room for 15-20 minutes, try a cool cloth on your "
        "forehead, and step away from screens for a bit.\n\n"
        "If the headache is sudden and very severe, comes with vision changes, "
        "fever, stiff neck, or confusion, please seek medical care right away. "
        "Otherwise, please consult a healthcare professional if it persists."
    ),
    "THROAT": (
        "A sore throat is uncomfortable. It's often caused by viral infections "
        "(like a cold), dry air, allergies, or sometimes a bacterial infection.\n\n"
        "Things that may soothe it: warm fluids like tea with honey and lemon, "
        "gargling with warm salt water, throat lozenges, plenty of rest, and "
        "using a humidifier if the air is dry.\n\n"
        "If it lasts more than a few days, you have a high fever, white "
        "patches on your tonsils, or trouble swallowing, please see a doctor. "
        "Always consult a healthcare professional for proper diagnosis."
    ),
    "STOMACH": (
        "Stomach discomfort can come from many things — what you ate, stress, "
        "a virus, or sometimes food intolerance. Mild nausea or cramping often "
        "passes on its own with rest.\n\n"
        "Try sipping clear fluids slowly (water, broth, herbal tea), eating "
        "bland foods like rice or toast when ready, and avoiding spicy, fatty, "
        "or very heavy foods until you feel better.\n\n"
        "If you have severe pain, blood in vomit or stool, signs of "
        "dehydration, or symptoms lasting more than 48 hours, please see a "
        "doctor promptly. Please consult a healthcare professional for "
        "proper diagnosis."
    ),
    "SLEEP": (
        "Trouble sleeping is exhausting — sorry you're going through that. "
        "Common causes include stress, screen time before bed, caffeine, "
        "irregular sleep schedules, or anxiety.\n\n"
        "A few things that often help: keep a consistent bedtime, dim screens "
        "an hour before bed, keep the room cool and dark, avoid caffeine after "
        "early afternoon, and try a calming routine like reading or gentle "
        "breathing exercises.\n\n"
        "If poor sleep continues for weeks, please consult a healthcare "
        "professional — there are real, treatable causes worth checking out."
    ),
    "FEVER": (
        "Fevers are usually your body fighting off an infection. Mild fevers "
        "(under 38.5°C / 101.3°F) often resolve with rest and fluids.\n\n"
        "Stay hydrated, rest as much as you can, and dress lightly. A lukewarm "
        "shower can help if you feel uncomfortable. Avoid bundling up in heavy "
        "blankets — that can trap heat.\n\n"
        "Seek medical care if the fever is very high (over 39.5°C / 103°F), "
        "lasts more than 3 days, or comes with severe symptoms. Please consult "
        "a healthcare professional for proper diagnosis."
    ),
    "COLD": (
        "Cold and flu symptoms can really wear you down. Most colds are viral, "
        "so they need time and rest to clear — usually 7-10 days.\n\n"
        "Helpful steps: drink lots of warm fluids, rest as much as possible, "
        "use saline nasal sprays for congestion, and try honey (if you're "
        "over 1 year old) for a cough. Steam from a hot shower can also ease "
        "stuffiness.\n\n"
        "If you have trouble breathing, chest pain, a high persistent fever, "
        "or symptoms get worse after a week, please see a doctor. Always "
        "consult a healthcare professional for proper diagnosis."
    ),
    "DIZZY": (
        "Dizziness can have many causes — dehydration, low blood sugar, "
        "standing up too fast, inner ear issues, or stress.\n\n"
        "Sit or lie down right away to avoid falling. Drink some water, eat a "
        "light snack if you haven't eaten, and rest for a few minutes. Avoid "
        "driving or operating machinery until it passes.\n\n"
        "If dizziness comes with chest pain, severe headache, slurred speech, "
        "weakness on one side, or doesn't pass within an hour, seek medical "
        "care immediately. Please consult a healthcare professional for "
        "proper diagnosis."
    ),
    "ANXIETY": (
        "I'm sorry you're feeling anxious — that's hard. Anxiety is very "
        "common and there are real ways to ease it.\n\n"
        "Some helpful techniques: slow deep breathing (try inhaling for 4 "
        "seconds, holding for 4, exhaling for 6), going for a short walk "
        "outside, limiting caffeine, talking to someone you trust, or writing "
        "down what's on your mind.\n\n"
        "If anxiety is overwhelming, persistent, or interfering with your "
        "daily life, please reach out to a mental health professional or your "
        "doctor. Please consult a healthcare professional for proper support."
    ),
    "DEFAULT": (
        "Thanks for sharing that with me. In demo mode I can give general info "
        "on common topics like headaches, sore throats, stomach issues, sleep "
        "problems, fever, colds, dizziness, anxiety, or emergencies.\n\n"
        "For your specific question, the best path is to talk to a doctor or "
        "pharmacist — they can ask the right follow-up questions and give "
        "advice that fits your individual situation.\n\n"
        "Please consult a healthcare professional for proper diagnosis. Take "
        "care of yourself!"
    ),
}

# Jordanian-Arabic versions of the same categories. Tone is warm and informal,
# the way a friendly neighborhood doctor or family member would talk.
DEMO_RESPONSES_AR = {
    "EMERGENCY": (
        "**هاي حالة جدّية، يا زلمة دق رقم الطوارئ هلأ على طول "
        "(911 أو 112 أو 999 حسب البلد).**\n\n"
        "ما تستنى ولا تحاول تتعامل مع الموضوع لحالك. إذا في حدا معك، احكيله "
        "شو صاير عشان يساعدك. وإذا لحالك، ضل على الخط مع موظف الطوارئ ورح "
        "يرشدك لحد ما توصل المساعدة.\n\n"
        "بس تذكّر، أنا مش بديل عن الدكتور — هاي حالة لازم دكتور حقيقي يشوفك."
    ),
    "GREETING": (
        "أهلاً وسهلاً فيك، نورت! أنا MT، مساعدك الطبي. احكيلي شو اللي "
        "مضايقك اليوم — في وجع، أعراض، أو سؤال صحي بدور بدماغك؟\n\n"
        "رح أعطيك معلومات عامة بسيطة قد ما أقدر. بس تذكّر، أنا مش بديل عن "
        "الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "HEADACHE": (
        "الله يعطيك العافية، الصداع شي مزعج فعلاً. عادةً بصير من شي بسيط متل: "
        "قلة شرب المي (الجفاف)، قلة النوم، إجهاد العين من الشاشات، التوتر، "
        "أو إنك ما اكلت كويس. أحياناً وضعية الجلوس أو شد عضلات الرقبة بكون "
        "إله دور كمان.\n\n"
        "في كم شي بسيط ممكن يخفف عليك: اشرب كاسة مَي كاملة، ارتاح بغرفة "
        "هادية وضوها خفيف لـ15-20 دقيقة، حط كمادة باردة على جبهتك، وابتعد "
        "عن الشاشات شوي.\n\n"
        "بس إذا الصداع جاي فجأة وقوي كتير، أو معه تغير بالنظر أو حرارة أو "
        "نشاف بالرقبة أو تشتت، روح على الإسعاف على طول. بس تذكّر، أنا مش "
        "بديل عن الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "THROAT": (
        "وجع الحلق مزعج كتير، الله يشفيك. عادةً بصير من فيروس متل الرشح، "
        "أو هوا ناشف، أو حساسية، أو أحياناً عدوى بكتيرية.\n\n"
        "في كم شي بساعد: مشروبات سخنة متل الشاي مع عسل وليمون، غرغرة بمَي "
        "دافي وملح، حبوب تستحلب للحلق، رحة كافية، واستعمل جهاز ترطيب الجو "
        "إذا الجو ناشف عندك.\n\n"
        "إذا استمر أكتر من كم يوم، أو طلعت عندك حرارة عالية أو بقع بيضا "
        "على اللوز أو ما عاد بتقدر تبلع، روح على دكتور — يمكن بدك فحص أو "
        "مضاد حيوي. بس تذكّر، أنا مش بديل عن الدكتور، لازم تشوف دكتور "
        "للفحص الصحيح."
    ),
    "STOMACH": (
        "وجع البطن إله أسباب كتيرة — يمكن من شي اكلته، أو توتر، أو فيروس، "
        "أو حساسية أكل. الغثيان البسيط أو المغص عادةً بروح مع الراحة.\n\n"
        "جرّب تشرب سوائل صافية شوي شوي (مَي، شوربة، شاي أعشاب)، وكول أكل "
        "خفيف متل الرز أو الخبز المحمص لما تكون مستعد، وابتعد عن الأكل "
        "الحار والدسم والثقيل لحد ما تتحسن.\n\n"
        "إذا في وجع شديد، أو دم بالقيء أو البراز، أو علامات جفاف، أو "
        "الأعراض ضلت أكتر من 48 ساعة، روح على دكتور على طول. بس تذكّر، "
        "أنا مش بديل عن الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "SLEEP": (
        "قلة النوم متعبة كتير، والله الموضوع صعب. الأسباب الشائعة بتكون "
        "التوتر، استعمال الموبايل قبل النوم، الكافيين، عدم انتظام أوقات "
        "النوم، أو القلق.\n\n"
        "في كم شي بساعدك: التزم بوقت ثابت للنوم، قلل سطوع الشاشات قبل "
        "النوم بساعة، خلي الغرفة باردة ومعتمة، تجنب القهوة من بعد الظهر، "
        "وجرب روتين مريح متل القراية أو تمارين تنفس بسيطة.\n\n"
        "إذا قلة النوم استمرت لأسابيع، أو حاسس حالك تعبان بالنهار رغم إنك "
        "نمت، تشوف دكتور — في أسباب حقيقية ممكن تتعالج. بس تذكّر، أنا مش "
        "بديل عن الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "FEVER": (
        "الحرارة عادة بتكون علامة إنه جسمك عم يحارب عدوى. الحرارة الخفيفة "
        "(أقل من 38.5°م) عادةً بتروح مع الراحة وشرب السوائل.\n\n"
        "خلي حالك مرطّب، ارتاح قد ما تقدر، والبس ملابس خفيفة. الاستحمام بمَي "
        "فاترة ممكن يساعدك إذا حاسس بعدم راحة. تجنب اللحاف الثقيل لأنه "
        "بحبس الحرارة.\n\n"
        "روح على دكتور إذا الحرارة صارت عالية كتير (فوق 39.5°م)، أو ضلت "
        "أكتر من 3 أيام، أو في معها أعراض شديدة. بس تذكّر، أنا مش بديل عن "
        "الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "COLD": (
        "أعراض الرشح والإنفلونزا بتقدر تنهكك فعلاً. أغلب نزلات البرد "
        "فيروسية، وبدها وقت ورحة لتروح — عادة 7-10 أيام.\n\n"
        "كم خطوة بساعدك: اشرب كتير سوائل سخنة، ارتاح قد ما تقدر، استعمل "
        "بخاخ مَي مالحة للزكام، وجرب العسل (للأكبر من سنة) للسعال. بخار "
        "الدش الساخن بساعد كمان للزكام.\n\n"
        "إذا في عندك ضيق بالتنفس أو وجع بالصدر أو حرارة عالية مستمرة أو "
        "الأعراض زادت بعد أسبوع، روح على دكتور. بس تذكّر، أنا مش بديل عن "
        "الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "DIZZY": (
        "الدوخة إلها أسباب كتيرة — جفاف، انخفاض السكر، إنك قمت بسرعة، "
        "مشاكل بالأذن الداخلية، أو توتر.\n\n"
        "اقعد أو نام على طول حتى ما توقع. اشرب شوية مَي، كول شي خفيف إذا "
        "ما اكلت، وارتاح كم دقيقة. ما تسوق ولا تشتغل بآلات لحد ما تروح "
        "الدوخة.\n\n"
        "إذا الدوخة جاية مع وجع بالصدر، صداع شديد، تلعثم بالكلام، ضعف "
        "بجهة وحدة من جسمك، أو ما راحت خلال ساعة، روح على الإسعاف فوراً. "
        "بس تذكّر، أنا مش بديل عن الدكتور، لازم تشوف دكتور للفحص الصحيح."
    ),
    "ANXIETY": (
        "الله يعينك، حاسس بقلق — هاد شي صعب فعلاً. القلق شي شائع كتير، "
        "وفي طرق حقيقية بتخففه.\n\n"
        "في تقنيات بتساعد: تنفس عميق بطيء (شهيق 4 ثواني، ثبت 4 ثواني، "
        "زفير 6 ثواني)، أو امشي شوي بالهوا الطلق، قلل القهوة، احكي مع "
        "حدا تثق فيه، أو اكتب اللي بدماغك.\n\n"
        "إذا القلق صار كبير أو مستمر أو أثر على حياتك اليومية، تواصل مع "
        "مختص نفسي أو دكتورك. مش لحالك بهالموضوع. بس تذكّر، أنا مش بديل "
        "عن الدكتور، لازم تشوف دكتور مختص."
    ),
    "DEFAULT": (
        "شكراً إنك حكيتلي. بالوضع التجريبي بقدر أعطيك معلومات عامة عن "
        "مواضيع شائعة متل الصداع، وجع الحلق، وجع البطن، مشاكل النوم، "
        "الحرارة، الرشح، الدوخة، القلق، أو حالات الطوارئ.\n\n"
        "بالنسبة لسؤالك المحدد، أحسن طريق إنك تحكي مع دكتور أو صيدلي — "
        "هم بقدروا يسألوك أسئلة مناسبة ويعطوك نصيحة بتناسب وضعك الشخصي.\n\n"
        "بس تذكّر، أنا مش بديل عن الدكتور، لازم تشوف دكتور للفحص الصحيح. "
        "اعتني بحالك!"
    ),
}

# Combined English + Arabic patterns. Order matters — emergencies first.
# Whichever language the user wrote in, the matched key is the same; the
# response is then pulled from the matching language's dictionary.
DEMO_PATTERNS = [
    # ── EMERGENCIES ────────────────────────────────────────────────
    (r"\b(chest pain|can'?t breathe|cannot breathe|suicide|kill myself|"
     r"stroke|severe bleed|unconscious|overdose)\b", "EMERGENCY"),
    (r"(ألم في الصدر|وجع بالصدر|وجع في الصدر|ما بقدر أتنفس|ما بتنفس|"
     r"انتحار|سكتة|نزيف شديد|فقدان الوعي|جرعة زائدة|ضيق تنفس)", "EMERGENCY"),

    # ── GREETINGS ──────────────────────────────────────────────────
    (r"\b(hi|hello|hey|hiya|howdy|good (morning|afternoon|evening))\b", "GREETING"),
    (r"(مرحبا|مرحبًا|أهلا|أهلاً|هلا|هلو|السلام عليكم|صباح الخير|"
     r"مساء الخير|هاي|كيفك|كيف حالك|نورت|اهلين)", "GREETING"),

    # ── HEADACHE ───────────────────────────────────────────────────
    (r"\b(headache|migraine|head (hurts|pain|ache))\b", "HEADACHE"),
    (r"(صداع|راسي يوجع|وجع راس|وجع بالراس|ألم في الرأس|شقيقة|ميغرين)", "HEADACHE"),

    # ── THROAT ─────────────────────────────────────────────────────
    (r"\b(sore throat|throat (hurts|pain|sore))\b", "THROAT"),
    (r"(التهاب الحلق|وجع الحلق|ألم في الحلق|حلقي|حلق|بلعوم|"
     r"حلقي يوجع|حلقي يوجعني)", "THROAT"),

    # ── STOMACH ────────────────────────────────────────────────────
    (r"\b(stomach|belly|tummy|nausea|nauseous|vomit|diarrh?ea|cramp)\b", "STOMACH"),
    (r"(معدة|بطن|بطني|غثيان|قيء|إسهال|مغص|تقلصات|وجع بطن|"
     r"بطني توجعني|بطني بوجعني|بطني بتوجعني)", "STOMACH"),

    # ── SLEEP ──────────────────────────────────────────────────────
    (r"\b(sleep|insomnia|can'?t sleep|tired|fatigue|exhausted|drowsy)\b", "SLEEP"),
    (r"(نوم|أرق|ما بقدر أنام|ما عم بنام|تعب|إرهاق|مرهق|تعبان|"
     r"سهرت|بدي أنام)", "SLEEP"),

    # ── FEVER ──────────────────────────────────────────────────────
    (r"\b(fever|temperature|chills)\b", "FEVER"),
    (r"(حمى|حرارة|قشعريرة|سخونة|سخن|بحس بحرارة)", "FEVER"),

    # ── COLD / FLU ─────────────────────────────────────────────────
    (r"\b(cold|flu|cough|runny nose|sneeze|congest|stuff(y|ed) nose)\b", "COLD"),
    (r"(برد|رشح|إنفلونزا|سعال|كحة|زكام|احتقان|سيلان|انفي)", "COLD"),

    # ── DIZZINESS ──────────────────────────────────────────────────
    (r"\b(dizzy|dizziness|lightheaded|vertigo|spinning)\b", "DIZZY"),
    (r"(دوخة|دوار|دايخ|دايخة|راسي بدور|حاسس بدوخة)", "DIZZY"),

    # ── ANXIETY ────────────────────────────────────────────────────
    (r"\b(anxious|anxiety|stress(ed)?|worried|panic|nervous|overwhelmed)\b", "ANXIETY"),
    (r"(قلق|توتر|خوف|ذعر|متوتر|قلقان|مكتئب|اكتئاب|مهموم|محبط|"
     r"مضايق|مش مرتاح)", "ANXIETY"),
]


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


# ─── Conversation history ────────────────────────────────────────────────────
conversation_history = []

# Bilingual fallback prefix — used when a real API call fails and we drop to demo.
FALLBACK_PREFIX = {
    "en": ("I had trouble reaching the AI service just now, so here's a "
           "general answer instead.\n\n"),
    "ar": ("ما قدرت أوصل لخدمة الذكاء الاصطناعي هلق، رح أعطيك جواب عام "
           "عوضاً عنها.\n\n"),
}


# ─── Routes ──────────────────────────────────────────────────────────────────
@app.route("/")
def welcome():
    """Premium health-app splash — first screen before the chat."""
    return render_template("welcome.html")


@app.route("/chat")
def chat_page():
    """Serve the main chat page (HTML only — JSON API is POST /api/chat)."""
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def api_chat():
    """Receive a user message, route to the right backend, return a JSON reply.

    The reply language matches the user's input language (English or Jordanian
    Arabic), driven entirely by the system prompt for AI providers and by
    explicit detection for demo mode.
    """
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()

    if not user_message:
        return jsonify({"error": "Message cannot be empty."}), 400

    user_lang = detect_user_language(user_message)
    conversation_history.append({"role": "user", "content": user_message})

    try:
        if PROVIDER == "openai":
            reply = openai_reply(conversation_history)
        elif PROVIDER == "gemini":
            reply = gemini_reply(conversation_history)
        elif PROVIDER == "anthropic":
            reply = anthropic_reply(conversation_history)
        else:
            reply = demo_reply(user_message)

        conversation_history.append({"role": "assistant", "content": reply})
        return jsonify({"reply": reply, "provider": PROVIDER})

    except Exception as e:
        # Real API failed — fall back to demo so the chat NEVER crashes
        print(f"[MT] {PROVIDER} call failed: {e!r} — falling back to demo mode.")
        reply = FALLBACK_PREFIX[user_lang] + demo_reply(user_message)
        conversation_history.append({"role": "assistant", "content": reply})
        return jsonify({"reply": reply, "provider": "demo-fallback"})


@app.route("/reset", methods=["POST"])
def reset():
    """Clear the entire conversation history."""
    conversation_history.clear()
    return jsonify({"status": "reset"})


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"[MT] AI provider in use: {PROVIDER}")
    print("[MT] Welcome: http://127.0.0.1:5000/  |  Chat: http://127.0.0.1:5000/chat")
    app.run(host="127.0.0.1", port=5000, debug=True)
