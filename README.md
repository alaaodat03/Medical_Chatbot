# MT° Medical Assistant

A bilingual (**English** / **Jordanian Arabic**) medical **chatbot** built with **Flask**. It offers a modern web UI with **text and voice** input/output, pluggable **LLM backends**, and a safe **demo mode** when no API key is configured.

**Tagline:** *Your health, made simple.*

---

## Important disclaimer

This project is for **education and general information only**. It is **not** a substitute for professional medical advice, diagnosis, or treatment. For emergencies or serious symptoms, users must seek **immediate** in-person or emergency care. **Never** use this app as the sole source of health decisions.

---

## Features

| Area | Details |
|------|---------|
| **Languages** | UI and replies follow **English** or **Arabic (Jordanian colloquial)** guided by the system prompt |
| **Voice** | Microphone input and spoken replies via the browser **Web Speech API** (best in Chromium-based browsers) |
| **AI backends** | **OpenAI**, **Google Gemini**, or **Anthropic Claude** — first configured key wins; otherwise **pattern-based demo** replies |
| **UX** | Welcome screen, chat UI, light/dark theme, quick suggestion chips, conversation reset |
| **Resilience** | If a live LLM call fails, the server falls back to **demo** responses so the chat does not crash |

---

## Tech stack

- **Backend:** Python 3, Flask, Flask-CORS, python-dotenv  
- **Frontend:** HTML templates, CSS, vanilla JavaScript  
- **AI:** `openai`, `google-generativeai`, `anthropic` (optional, via `.env`)  
- **Speech:** Browser-native **Speech Recognition** & **Speech Synthesis** (no extra server-side speech dependency for the main app)

---

## Repository layout

```
medical-chatbot/
├── app.py                 # Flask app, routes, LLM + demo logic
├── requirements.txt       # Python dependencies
├── templates/
│   ├── welcome.html       # Landing / splash
│   └── index.html         # Chat interface
├── static/
│   ├── script.js          # Chat, i18n, voice, API client
│   ├── style.css          # Chat styling
│   ├── welcome.js / welcome.css
├── speakup/               # Separate pronunciation-learning app (see speakup/README.md)
├── PROJECT_DOCS.md        # In-depth documentation (Arabic + technical detail)
└── README.md              # This file
```

---

## Quick start

### 1. Clone and create a virtual environment

```bash
git clone https://github.com/alaoodat03/Medical_Chatbot.git
cd Medical_Chatbot
python -m venv .venv
```

**Windows (PowerShell):**

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**macOS / Linux:**

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Environment variables

Create a **`.env`** file in the project root (do **not** commit real keys). The app picks the **first** provider with a valid-looking key, in this order:

1. `OPENAI_API_KEY` → OpenAI (`gpt-4o-mini`)  
2. `GEMINI_API_KEY` → Google Gemini (`gemini-1.5-flash`)  
3. `ANTHROPIC_API_KEY` → Anthropic (`claude-sonnet-4-5`)  
4. If none are set → **demo mode** (canned bilingual responses)

Example **`.env`** (use only the provider you need):

```env
# Optional — uncomment one or more
# OPENAI_API_KEY=sk-...
# GEMINI_API_KEY=...
# ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run the server

```bash
python app.py
```

- **Welcome:** [http://127.0.0.1:5000/](http://127.0.0.1:5000/)  
- **Chat:** [http://127.0.0.1:5000/chat](http://127.0.0.1:5000/chat)

---

## HTTP API (main app)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Welcome page |
| `GET` | `/chat` | Chat UI (HTML) |
| `POST` | `/api/chat` | JSON body: `{ "message": "..." }` → `{ "reply", "provider" }` |
| `POST` | `/reset` | Clears server-side conversation history |

---

## Voice input / output

- **Supported best in** Chrome, Edge, or other **Chromium** browsers with microphone permission.  
- **Speech-to-text** language follows the **in-app language toggle** (English ↔ Arabic).  
- **Text-to-speech** picks a voice using client-side language detection on the message text.  
- Arabic TTS in the browser typically uses **standard** Arabic voices, while the **written** assistant text is tuned for **Jordanian** phrasing in the system prompt.

---

## SpeakUp subproject

The **`speakup/`** directory is a **separate** pronunciation-practice application (different port and dependencies). See **`speakup/README.md`** for setup.

---

## Documentation

For architecture diagrams, TTS/STT notes, troubleshooting, and Arabic documentation, see **`PROJECT_DOCS.md`**.

---

## Security notes

- Keep **API keys** only in **`.env`** or your host’s secret store.  
- Ensure **`.env`** is listed in **`.gitignore`** (already expected for this repo).  
- Do not log or expose patient-identifiable or sensitive health data in production without proper compliance review.

---

## Author

Maintained by **[alaoodat03](https://github.com/alaoodat03)** — *Medical_Chatbot* repository.

---

## License

Specify a license for this repository (for example MIT or Apache-2.0) by adding a `LICENSE` file and updating this section.
