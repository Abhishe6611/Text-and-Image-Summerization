from flask import Flask, render_template, request, jsonify, send_file, Response
from flask_cors import CORS
from openai import OpenAI
import requests as http_requests
import os
import io
import base64
import json
import logging
import PyPDF2
import docx
import fitz
from fpdf import FPDF
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # tighten in production
logging.basicConfig(level=logging.INFO)
TEXT_API_KEY = os.getenv("TEXT_API_KEY")
NEMOTRON_API_KEY = os.getenv("NEMOTRON_API_KEY")
KIMI_API_KEY = os.getenv("KIMI_API_KEY")
TEXT_MODEL = "abacusai/dracarys-llama-3.1-70b-instruct"
NEMOTRON_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"
VISION_MODEL = "moonshotai/kimi-k2.5"
KIMI_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
text_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=TEXT_API_KEY
)

nemotron_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=NEMOTRON_API_KEY
)
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20MB
TEXT_EXTS = {"txt"}
DOC_EXTS = {"pdf", "docx"}
IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp"}
VIDEO_EXTS = {"mp4", "webm"}
ALL_MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS
MIME_MAP = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
}
MODE_PROMPTS = {
    "notes": "Create structured study notes with headers and bullets.",
    "flowchart": "Create Mermaid flowchart only.",
    "exam": "Create exam questions and answers."
}
DIFFICULTY_PREFIX = {
    "simple": "Explain simply for beginners.",
    "intermediate": "Use balanced academic language.",
    "advanced": "Use technical expert-level detail."
}
def read_text_file(file):
    return file.read().decode("utf-8", errors="ignore")
def extract_pdf(file):
    pdf_reader = PyPDF2.PdfReader(file)
    text = "".join(page.extract_text() or "" for page in pdf_reader.pages)
    if text.strip():
        return text, []
    file.seek(0)
    doc = fitz.open(stream=file.read(), filetype="pdf")
media = []
    for i in range(min(len(doc), 20)):
        pix = doc[i].get_pixmap(dpi=150)
        b64 = base64.b64encode(pix.tobytes("png")).decode()
        media.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"}
        })
    return "", media
def encode_media(file, ext):
    raw = file.read()
    if len(raw) > MAX_FILE_SIZE:
        raise ValueError("File too large")
    mime = MIME_MAP.get(ext, "application/octet-stream")
    b64 = base64.b64encode(raw).decode()
    return {
        "type": "image_url",
        "image_url": {"url": f"data:{mime};base64,{b64}"}
    }
@app.route("/")
def home():
    return render_template("index.html")
@app.route("/summarize", methods=["POST"])
def summarize():
    try:
        text_content = ""
        media_parts = []
 files = request.files.getlist("files") + request.files.getlist("file")
        for file in files:
            if not file.filename:
                continue
            ext = file.filename.rsplit(".", 1)[-1].lower()
            if ext in TEXT_EXTS:
                text_content += read_text_file(file) + "\n"
            elif ext == "pdf":
                t, m = extract_pdf(file)
                text_content += t
                media_parts.extend(m)
            elif ext == "docx":
                doc = docx.Document(file)
                text_content += "\n".join(p.text for p in doc.paragraphs)
            elif ext in ALL_MEDIA_EXTS:
                media_parts.append(encode_media(file, ext))
            else:
                return jsonify({"error": f"Unsupported file type: {ext}"}), 400
        if not text_content.strip() and not media_parts:
            return jsonify({"error": "No valid input provided"}), 400
        mode = request.form.get("mode", "summarize").lower()
        difficulty = request.form.get("difficulty", "intermediate").lower()
        if media_parts:
            return Response(stream_kimi(text_content, media_parts), mimetype="text/plain")
        if mode in ("notes", "flowchart", "exam"):
            return Response(stream_nemotron(text_content, mode, difficulty), mimetype="text/plain")
        return Response(stream_dracarys(text_content, difficulty), mimetype="text/plain")
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500
def stream_dracarys(text, difficulty):
    prompt = f"{DIFFICULTY_PREFIX[difficulty]}\nSummarize:\n{text}"
    try:
        stream = text_client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            temperature=0.5,
            max_tokens=1024,
        )
    for chunk in stream:
            yield chunk.choices[0].delta.content or ""
    except Exception as e:
        yield f"[Error] {e}"

def stream_nemotron(text, mode, difficulty):
    system = f"{DIFFICULTY_PREFIX[difficulty]}\n{MODE_PROMPTS[mode]}"
    try:
        stream = nemotron_client.chat.completions.create(
            model=NEMOTRON_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": text}
            ],
            stream=True,
            max_tokens=8000
        )
        for chunk in stream:
            yield chunk.choices[0].delta.content or ""
    except Exception as e:
        yield f"[Error] {e}"
def stream_kimi(text, media_parts):
    payload = {
        "model": VISION_MODEL,
        "messages": [{
            "role": "user",
            "content": [{"type": "text", "text": text or "Analyze this media"}] + media_parts
        }],
        "stream": True
    }
    headers = {
        "Authorization": f"Bearer {KIMI_API_KEY}",
        "Content-Type": "application/json"
    }
    try:
        res = http_requests.post(
            KIMI_API_URL,
            headers=headers,
            json=payload,
            stream=True,
            timeout=120
        )
        if res.status_code != 200:
            yield f"[API Error] {res.text}"
            return
        for line in res.iter_lines():
            if line and b"content" in line:
                yield line.decode("utf-8", errors="ignore")
    except Exception as e:
        yield f"[Error] {e}"
@app.route("/export_docx", methods=["POST"])
def export_docx():
    data = request.json
    doc = docx.Document()
    doc.add_heading("Summary", 0)
    doc.add_paragraph(data.get("text", ""))
    stream = io.BytesIO()
    doc.save(stream)
    stream.seek(0)
    return send_file(stream, as_attachment=True, download_name="summary.docx")

@app.route("/export_pdf", methods=["POST"])
def export_pdf():
    data = request.json
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=11)
    text = data.get("text", "").encode("latin-1", "ignore").decode("latin-1")
    pdf.multi_cell(0, 6, text)
    stream = io.BytesIO(pdf.output())
    stream.seek(0)
    return send_file(stream, as_attachment=True, download_name="summary.pdf")
if __name__ == "__main__":

 
1. High-Level Architecture
Your system is a multi-modal AI processing pipeline with 3 AI engines:
                │      Frontend UI        │
                │ (HTML / JS / Uploads)   │
                └──────────┬──────────────┘
                           │ HTTP POST
                           ▼
                ┌─────────────────────────┐
                │     Flask API Layer     │
                │   /summarize endpoint   │
                └──────────┬──────────────┘
                           │
        ┌──────────────────┼───────────────────┐
        ▼                  ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Text Pipeline │  │ Vision Pipe  │  │ Structured   │
│ Dracarys LLM  │  │ Kimi K2.5    │  │ Nemotron LLM │
└──────┬───────┘  └──────┬───────┘  └──────┬───────┘
       ▼                 ▼                 ▼
   Streaming                
   Response                   Response
       └───────────────┬────────────────┘
                       ▼
              ┌───────────────────┐
              │   User Response   │
              │ (streamed output) │
              └───────────────────┘
 
2. Core Modules (Your Code Breakdown)
🟦 A. Flask Controller Layer
User Request
   ↓
Extract files + text
   ↓
Parse files:
   ├── txt → text_content
   ├── pdf → PyPDF2 / PyMuPDF fallback
   ├── docx → python-docx
   ├── images/videos → base64 encode
   ↓
Decide pipeline:
   ├── media exists → Vision Model (Kimi)
   ├── mode = notes/flowchart/exam → Nemotron
   └── default → Dracarys summarizer
   ↓
Return streaming response
 
________________________________________
🟨 B. Data Processing Layer
1. Text Processing
TXT → direct decode → text_content
2. PDF Processing (Hybrid System)
PDF →
   ├─ Try text extraction (PyPDF2)
   ├─ If empty:
   │     → Convert pages to images (PyMuPDF)
   │     → Send to vision model
   └─ else → normal text pipeline
3. DOCX Processing
DOCX → extract paragraphs → text_content
4. Media Encoding
Image/Video →
    read binary
    base64 encode
    attach as:
    "image_url": data:<mime>;base64,...

 
C. AI Routing Layer (Decision Engine)
This is the brain of your system:
IF media_parts exist:
    → stream_kimi()

ELSE IF mode in [notes, flowchart, exam]:
    → stream_nemotron()

ELSE:
    → stream_dracarys()

 
D. AI Model Layer
1. Dracarys (Summarizer LLM)
Input: raw text
Output: simple summary

Flow:
User Text → Prompt Builder → OpenAI SDK → Streaming tokens → Response
________________________________________
2. Nemotron (Structured Output Engine)
Input: text + mode (notes/flowchart/exam)

Flow:
System Prompt (rules + format)
        +
User Text
        ↓
NVIDIA Nemotron API
        ↓
Streaming structured output
Used for:
•	Notes 
•	Flowcharts (Mermaid) 
•	Exam prep 
________________________________________
3. Kimi Vision Model
Input: text + media (images/videos/PDF scans)

Flow:
Base64 media + prompt
        ↓
NVIDIA Kimi API (SSE streaming)
        ↓
Parsed token stream
        ↓
Response output
Used for:
•	Image understanding 
•	Video description 
•	Scanned PDF OCR-like reasoning 
________________________________________
🟧 E. Streaming Layer (VERY IMPORTANT)
All models use:
stream=True
Flow:
LLM generates token
        ↓
Flask yields chunk
        ↓
Frontend receives stream
        ↓
UI updates live
This creates:
👉 ChatGPT-like typing effect
________________________________________
🟥 F. Export Layer
1. DOCX Export
AI Output → python-docx → file stream → download
2. PDF Export
AI Output → FPDF → PDF bytes → download
________________________________________
🔄 3. Full System Flow (End-to-End)
Example: User uploads PDF + selects "notes"
1. User uploads file
        ↓
2. Flask receives request
        ↓
3. PDF extracted:
      ├─ text found → use text
      └─ else → convert to images
        ↓
4. mode = "notes"
        ↓
5. Router selects Nemotron
        ↓
6. Prompt = "Create structured notes"
        ↓
7. AI streams output
        ↓
8. Frontend displays live text
________________________________________
Example: User uploads image
1. Image uploaded
        ↓
2. base64 encoding
        ↓
3. media_parts detected
        ↓
4. Routed to Kimi Vision model
        ↓
5. AI analyzes image
        ↓
6. Streaming response
________________________________________
🧠 4. Architecture Summary (Simple View)
                USER
                 ↓
        Flask API Gateway
                 ↓
      ┌──────────┼──────────┐
      ↓          ↓          ↓
 Dracarys   Nemotron    Kimi Vision
 (text)     (structured) (multimodal)
      └──────────┼──────────┘
                 ↓
         Streaming Response
                 ↓
             Frontend UI
________________________________________


 
    app.run(debug=True, port=5000)
