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

# ─────────────────────────────
# App Setup
# ─────────────────────────────
app = Flask(__name__)

CORS(app, resources={r"/*": {"origins": "*"}})  # tighten in production

logging.basicConfig(level=logging.INFO)

# ─────────────────────────────
# Config (ENV VARIABLES ONLY)
# ─────────────────────────────
TEXT_API_KEY = os.getenv("TEXT_API_KEY")
NEMOTRON_API_KEY = os.getenv("NEMOTRON_API_KEY")
KIMI_API_KEY = os.getenv("KIMI_API_KEY")

TEXT_MODEL = "abacusai/dracarys-llama-3.1-70b-instruct"
NEMOTRON_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"
VISION_MODEL = "moonshotai/kimi-k2.5"

KIMI_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

# ─────────────────────────────
# Clients
# ─────────────────────────────
text_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=TEXT_API_KEY
)

nemotron_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=NEMOTRON_API_KEY
)

# ─────────────────────────────
# Limits
# ─────────────────────────────
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

# ─────────────────────────────
# Prompts
# ─────────────────────────────
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

# ─────────────────────────────
# Helpers
# ─────────────────────────────
def read_text_file(file):
    return file.read().decode("utf-8", errors="ignore")


def extract_pdf(file):
    pdf_reader = PyPDF2.PdfReader(file)
    text = "".join(page.extract_text() or "" for page in pdf_reader.pages)

    if text.strip():
        return text, []

    # fallback OCR-like image conversion
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


# ─────────────────────────────
# Routes
# ─────────────────────────────
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


# ─────────────────────────────
# Model Streams
# ─────────────────────────────
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


# ─────────────────────────────
# Export APIs
# ─────────────────────────────
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


# ─────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5000)
