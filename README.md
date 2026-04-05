# 📄 DOCUSUM — AI-Powered Document Synthesizer

> **Multi-modal, multi-model document intelligence** — Summarize, generate study notes, create flowcharts, and build exam-prep materials from any text, PDF, image, or video input.

![Neobrutalist UI](https://img.shields.io/badge/UI-Neobrutalism-black?style=for-the-badge&labelColor=ff00ff)
![React](https://img.shields.io/badge/Frontend-React_+_Vite-blue?style=for-the-badge)
![Flask](https://img.shields.io/badge/Backend-Flask-green?style=for-the-badge)
![NVIDIA NIM](https://img.shields.io/badge/AI-NVIDIA_NIM-76B900?style=for-the-badge)

---

## ✨ Features

### 🧠 Four Output Modes
| Mode | Description | Powered By |
|------|-------------|------------|
| **📝 Summarize** | Concise text summarization | Dracarys LLaMA 3.1 70B |
| **📖 Notes** | Structured study notes with headers, bullet points, key definitions | Nemotron Super 49B v1.5 |
| **🔀 Flowchart** | Live Mermaid.js diagram generation & rendering | Nemotron Super 49B v1.5 |
| **🎓 Exam Prep** | MCQs, short answers, fill-in-blanks, mnemonics, revision points | Nemotron Super 49B v1.5 |

### 🖼️ Multimodal Input
- **Text** — Paste directly or type in the textarea
- **Documents** — Upload `.txt`, `.pdf`, `.docx` files
- **Images** — Upload `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`
- **Video** — Upload `.mp4`, `.webm`
- **Scanned PDFs** — Automatically converted to images via PyMuPDF for vision analysis
- **Multi-file Upload** — Attach multiple files at once
- **Drag & Drop** — Drop files directly onto the input area

### 🎚️ Difficulty Levels
Choose from **Simple**, **Intermediate**, or **Advanced** to control the complexity and depth of AI output.

### 📤 Smart Export
| Mode | Export Options |
|------|---------------|
| Summarize / Notes / Exam Prep | **TXT**, **DOCX**, **PDF** |
| Flowchart | **PNG** (high-res 2x), **PDF** (landscape) |

Plus one-click **Copy to Clipboard** for all modes.

### 🎨 Neobrutalist UI
- Bold black borders, hard-offset shadows, high-contrast colors
- Physically interactive buttons (press-down animation)
- Live streaming output with auto-scroll
- Progress indicator: **Thinking → Generating → Done ✓**
- Word count & reading time stats bar

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCUSUM Architecture                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐         ┌──────────────────────────────────┐ │
│  │   Frontend    │         │         Flask Backend            │ │
│  │  React+Vite   │  POST   │                                  │ │
│  │  TypeScript   │────────▶│  /summarize (mode + difficulty)  │ │
│  │  Neobrutalism │         │                                  │ │
│  │  Mermaid.js   │◀────────│  Chunked HTTP Streaming          │ │
│  └──────────────┘  stream  │                                  │ │
│                            │  ┌──────────────────────────┐    │ │
│                            │  │ File Processor            │    │ │
│                            │  │ PDF/DOCX/TXT/Image/Video  │    │ │
│                            │  └────────┬─────────────────┘    │ │
│                            │           │                       │ │
│                            │     ┌─────┴──────┐               │ │
│                            │     │   Router    │               │ │
│                            │     └──┬──┬───┬──┘               │ │
│                            └────────┼──┼───┼──────────────────┘ │
│                                     │  │   │                    │
│  ┌──────────────────────────────────┼──┼───┼──────────────────┐ │
│  │          NVIDIA NIM API Cloud    │  │   │                  │ │
│  │                                  │  │   │                  │ │
│  │  ┌───────────────┐  ┌──────────┐│  │   │┌───────────────┐ │ │
│  │  │ Dracarys 70B  │  │ Kimi K2.5││  │   ││Nemotron 49B   │ │ │
│  │  │ (Summarize)   │  │ (Vision) ││  │   ││(Notes/Flow/   │ │ │
│  │  │               │  │          ││  │   ││ Exam)         │ │ │
│  │  └───────────────┘  └──────────┘│  │   │└───────────────┘ │ │
│  └──────────────────────────────────┘  │   │                  │ │
└─────────────────────────────────────────────────────────────────┘
```

### Tri-Model Routing

| Model | Role | When Used |
|-------|------|-----------|
| **Dracarys LLaMA 3.1 70B** (AbacusAI) | Text summarization | Summarize mode + text-only input |
| **Kimi K2.5** (Moonshot AI) | Vision + multimodal analysis | Any input with images/video |
| **Nemotron Super 49B v1.5** (NVIDIA) | Structured output generation | Notes / Flowchart / Exam Prep modes |

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **NVIDIA NIM API keys** from [build.nvidia.com](https://build.nvidia.com)

### 1. Clone & Install Backend

```bash
git clone https://github.com/Abhishe6611/Text-and-Image-Summerization.git
cd Text-and-Image-Summerization

pip install -r requirements.txt
```

### 2. Configure API Keys

Open `app.py` and replace the placeholder API keys:

```python
# Model 1: Dracarys (Text Summarization)
text_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="YOUR_NVIDIA_API_KEY_HERE"
)

# Model 2: Kimi K2.5 (Vision)
KIMI_API_KEY = "YOUR_NVIDIA_API_KEY_HERE"

# Model 3: Nemotron (Notes/Flowchart/Exam)
nemotron_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key="YOUR_NVIDIA_API_KEY_HERE"
)
```

> **Getting API keys:** Sign up at [build.nvidia.com](https://build.nvidia.com), search for each model name, and generate a free API key.

### 3. Install & Run Frontend

```bash
cd frontend
npm install
npm run dev
```

### 4. Run Backend

```bash
# From the project root
python app.py
```

### 5. Open the App

Navigate to **http://localhost:5173** in your browser.

---

## 📁 Project Structure

```
Text-and-Image-Summerization/
├── app.py                    # Flask backend (routing, streaming, export)
├── requirements.txt          # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/
│   │   │       └── ruixen-moon-chat.tsx   # Main UI component
│   │   ├── App.tsx
│   │   └── index.css         # Neobrutalist design system
│   ├── package.json
│   └── vite.config.ts
├── templates/
│   └── index.html            # Legacy Flask template (deprecated)
├── architecture_flow.md      # Detailed architecture documentation
└── README.md
```

---

## 🔧 Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| **React 18** + **TypeScript** | Component-based UI |
| **Vite** | Fast dev server & build |
| **shadcn/ui** | Base component primitives |
| **Lucide Icons** | Icon system |
| **React Markdown** | Markdown rendering |
| **Mermaid.js** | Live flowchart diagrams |

### Backend
| Technology | Purpose |
|-----------|---------|
| **Flask 3.x** | HTTP server + API routes |
| **Flask-CORS** | Cross-origin support |
| **OpenAI SDK** | Dracarys & Nemotron streaming |
| **Requests** | Kimi K2.5 raw SSE streaming |
| **PyPDF2** | PDF text extraction |
| **PyMuPDF (fitz)** | Scanned PDF → image conversion |
| **python-docx** | DOCX reading & export |
| **fpdf2** | PDF export generation |

### AI Models (via NVIDIA NIM)
| Model | Parameters | Use Case |
|-------|-----------|----------|
| `abacusai/dracarys-llama-3.1-70b-instruct` | 70B | Text summarization |
| `moonshotai/kimi-k2.5` | — | Vision + reasoning |
| `nvidia/llama-3.3-nemotron-super-49b-v1.5` | 49B | Structured output |

---

## 📋 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/summarize` | POST | Main processing endpoint (accepts text, files, mode, difficulty) |
| `/export_docx` | POST | Export summary as DOCX |
| `/export_pdf` | POST | Export summary as PDF |
| `/export_image_pdf` | POST | Export flowchart image as landscape PDF |

---

## 🎯 How It Works

1. **User inputs** text or uploads files via the React frontend
2. **Mode selection** determines which AI model and system prompt to use
3. **Difficulty level** adjusts the complexity of the AI's output
4. **Backend processes** files (extracts text from PDFs/DOCX, base64-encodes images)
5. **Router decides** which model to call based on input type and mode
6. **AI response streams** token-by-token back to the browser via chunked HTTP
7. **Frontend renders** the response in real-time as Markdown (or as a Mermaid diagram for flowcharts)
8. **User exports** the result as TXT/DOCX/PDF or PNG/PDF for flowcharts

---

## 📜 License

This project is for educational and personal use.

---

## 🙏 Acknowledgments

- **NVIDIA NIM** — Free-tier API access to state-of-the-art AI models
- **AbacusAI** — Dracarys LLaMA 3.1 70B fine-tune
- **Moonshot AI** — Kimi K2.5 multimodal model
- **shadcn/ui** — Beautiful component primitives
