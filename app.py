import os
import io
import base64
import json
import logging
import tempfile

import PyPDF2
import docx
import fitz                          # PyMuPDF
from fpdf import FPDF
from flask import Flask, render_template, request, jsonify, send_file, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from openai import OpenAI
import requests as http_requests

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── App setup ─────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# Change 2 — Hard file-size cap
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB

# Change 3 — Rate limiting
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="memory://",
)

# ── Constants (Change 5 — no more magic numbers) ──────────────────────────────
NVIDIA_BASE_URL     = "https://integrate.api.nvidia.com/v1"
KIMI_API_URL        = "https://integrate.api.nvidia.com/v1/chat/completions"

TEXT_MODEL          = "abacusai/dracarys-llama-3.1-70b-instruct"
VISION_MODEL        = "moonshotai/kimi-k2.5"
NEMOTRON_MODEL      = "nvidia/llama-3.3-nemotron-super-49b-v1.5"

MAX_PDF_PAGES       = 20
PDF_RENDER_DPI      = 150

MAX_TOKENS_TEXT     = 1024
MAX_TOKENS_NEMOTRON = 16384
MAX_TOKENS_KIMI     = 16384

TEMP_TEXT           = 0.5
TEMP_NEMOTRON       = 0.6
TEMP_KIMI           = 1.00
TOP_P_TEXT          = 1.0
TOP_P_NEMOTRON      = 0.95
TOP_P_KIMI          = 1.00

REQUEST_TIMEOUT_SEC = 120

TEXT_EXTS           = {"txt"}
IMAGE_EXTS          = {"png", "jpg", "jpeg", "gif", "webp"}
VIDEO_EXTS          = {"mp4", "webm"}
ALL_MEDIA_EXTS      = IMAGE_EXTS | VIDEO_EXTS

MIME_MAP = {
    "png": "image/png",   "jpg": "image/jpeg",
    "jpeg": "image/jpeg", "gif": "image/gif",
    "webp": "image/webp", "mp4": "video/mp4",
    "webm": "video/webm",
}

VALID_MODES        = {"summarize", "notes", "flowchart", "exam"}
VALID_DIFFICULTIES = {"simple", "intermediate", "advanced"}

# ── API clients (keys kept as-is, same as original) ───────────────────────────
text_client = OpenAI(
    base_url=NVIDIA_BASE_URL,
    api_key="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",
)
nemotron_client = OpenAI(
    base_url=NVIDIA_BASE_URL,
    api_key="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",
)
KIMI_API_KEY = "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"

# ── Mode-specific system prompts ──────────────────────────────────────────────
MODE_PROMPTS = {
    "notes": """You are an expert study-notes generator. Given the following content, create comprehensive, well-structured study notes. Follow this format:
- Use clear hierarchical headers (# Topic, ## Subtopic, ### Key Point)
- Use bullet points for key facts and definitions
- **Bold** all important terms and definitions
- Add a "Key Takeaways" section at the end
- Keep language concise but thorough
- Use numbered lists for sequential processes
Do NOT add any preamble. Start directly with the notes.""",

    "flowchart": """You are a Mermaid.js diagram expert. Given the following content, create a clear and well-structured Mermaid flowchart that visualizes the key concepts, processes, or relationships.

Rules:
- Output ONLY the raw Mermaid code inside a ```mermaid code block
- Use `graph TD` (top-down) orientation
- Use descriptive labels in brackets `[Label]` for process nodes
- Use curly braces `{Decision?}` for decision/diamond nodes
- Use `([Label])` for rounded nodes (start/end)
- Connect nodes with labeled arrows where helpful: `A -->|yes| B`
- Use subgraphs to group related concepts if the content has multiple sections
- Keep node labels short but meaningful (max 6 words)
- Ensure the diagram is syntactically valid Mermaid
Do NOT add any explanation before or after the mermaid block.""",

    "exam": """You are an expert exam preparation assistant. Given the following content, create comprehensive exam-ready study material. Structure it as follows:

## 📝 Key Concepts
List the most important concepts with brief explanations.

## ❓ Short Answer Questions
Generate 5-8 short answer questions with model answers.

## 🔘 Multiple Choice Questions
Generate 5-8 MCQs with 4 options each. Mark the correct answer with ✅.

## 📋 Fill in the Blanks
Generate 5 fill-in-the-blank questions with answers.

## 🧠 Mnemonics & Memory Aids
Create helpful mnemonics or memory tricks for the key concepts.

## ⚡ Quick Revision Points
Bullet-point summary of the most exam-critical facts.

Make the content thorough, accurate, and exam-focused. Do NOT add any preamble.""",
}

DIFFICULTY_PREFIX = {
    "simple":       "Use simple, easy-to-understand language suitable for beginners. Avoid jargon. Explain like teaching a 10th grader.",
    "intermediate": "Use clear, standard academic language. Balance detail with readability.",
    "advanced":     "Use precise, technical language. Include in-depth analysis, edge cases, and expert-level detail.",
}


# ═════════════════════════════════════════════════════════════════════════════
# Change 9 — Uniform error helper
# ═════════════════════════════════════════════════════════════════════════════
def api_error(message: str, status_code: int = 400):
    """Return a consistent JSON error envelope."""
    logger.warning(f"API error {status_code}: {message}")
    return jsonify({"success": False, "error": message, "status": status_code}), status_code


# ═════════════════════════════════════════════════════════════════════════════
# Change 2 — 413 handler
# ═════════════════════════════════════════════════════════════════════════════
@app.errorhandler(413)
def file_too_large(_e):
    return api_error("File too large. Maximum upload size is 50 MB.", 413)


# ═════════════════════════════════════════════════════════════════════════════
# Change 4 — File parsing helpers
# ═════════════════════════════════════════════════════════════════════════════
def _extract_pdf(file) -> tuple[str, list]:
    """
    Extract content from a PDF file.
    - Text-based PDFs → returns (text, [])
    - Scanned PDFs    → renders pages as images, returns ("", [image_parts])
    """
    pdf_reader = PyPDF2.PdfReader(file)
    text = "".join(page.extract_text() or "" for page in pdf_reader.pages)

    if text.strip():
        return text, []

    # Fallback: render pages to PNG for vision model
    file.seek(0)
    pdf_doc = fitz.open(stream=file.read(), filetype="pdf")
    media_parts = []
    for i in range(min(len(pdf_doc), MAX_PDF_PAGES)):
        pix = pdf_doc[i].get_pixmap(dpi=PDF_RENDER_DPI)
        b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
        media_parts.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{b64}"},
        })
    logger.info(f"Scanned PDF: rendered {len(media_parts)} page(s) as images.")
    return "", media_parts


def extract_content_from_file(file) -> tuple[str, list]:
    """
    Dispatch a single uploaded file to the correct parser.

    Returns:
        (text_content, media_parts) — one or both may be non-empty.

    Raises:
        ValueError: for unsupported file extensions.
    """
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    if ext in TEXT_EXTS:
        return file.read().decode("utf-8"), []

    if ext == "pdf":
        return _extract_pdf(file)

    if ext == "docx":
        doc = docx.Document(file)
        text = "\n".join(p.text for p in doc.paragraphs)
        return text, []

    if ext in ALL_MEDIA_EXTS:
        raw = file.read()
        b64 = base64.b64encode(raw).decode("utf-8")
        mime = MIME_MAP.get(ext, "application/octet-stream")
        part = {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
        return "", [part]

    raise ValueError(f"Unsupported file type: .{ext}")


# ═════════════════════════════════════════════════════════════════════════════
# Routes
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/")
def home():
    return render_template("index.html")


# Change 10 — Health endpoint
@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "models": {
            "text":       TEXT_MODEL,
            "vision":     VISION_MODEL,
            "structured": NEMOTRON_MODEL,
        },
    })


@app.route("/summarize", methods=["POST"])
@limiter.limit("10 per minute")   # Change 3 — per-route rate limit
def summarize():
    # ── Change 11: validate mode & difficulty early ───────────────────────────
    mode       = request.form.get("mode", "summarize").strip().lower()
    difficulty = request.form.get("difficulty", "intermediate").strip().lower()

    if mode not in VALID_MODES:
        return api_error(f"Invalid mode '{mode}'. Choose from: {', '.join(sorted(VALID_MODES))}")

    if difficulty not in VALID_DIFFICULTIES:
        return api_error(f"Invalid difficulty '{difficulty}'. Choose from: {', '.join(sorted(VALID_DIFFICULTIES))}")

    # ── Parse uploaded files (Change 4) ──────────────────────────────────────
    text_content = ""
    media_parts  = []

    uploaded_files = request.files.getlist("files") + request.files.getlist("file")
    for file in uploaded_files:
        if not file.filename:
            continue
        try:
            text, parts = extract_content_from_file(file)
            text_content += text + "\n" if text else ""
            media_parts.extend(parts)
        except ValueError as e:
            return api_error(str(e))
        except Exception as e:
            logger.exception(f"Failed to process {file.filename}")
            return api_error(f"Failed to process '{file.filename}': {str(e)}", 500)

    # Fallback: plain text from form or JSON body
    if not text_content.strip():
        if "text" in request.form:
            text_content = request.form["text"]
        elif request.is_json:
            text_content = (request.json or {}).get("text", "")

    if not text_content.strip() and not media_parts:
        return api_error("Please provide text, a document, or media to analyze.")

    # ── Change 8: log every request ───────────────────────────────────────────
    logger.info(
        f"summarize | mode={mode} difficulty={difficulty} "
        f"has_media={bool(media_parts)} text_len={len(text_content.strip())}"
    )

    # ── Route to correct model ────────────────────────────────────────────────
    if media_parts:
        return Response(stream_kimi(text_content.strip(), media_parts), mimetype="text/plain")
    if mode in ("notes", "flowchart", "exam"):
        return Response(stream_nemotron(text_content.strip(), mode, difficulty), mimetype="text/plain")
    return Response(stream_dracarys(text_content.strip(), difficulty), mimetype="text/plain")


# ═════════════════════════════════════════════════════════════════════════════
# Streaming helpers
# ═════════════════════════════════════════════════════════════════════════════

def stream_dracarys(text: str, difficulty: str = "intermediate"):
    """Stream text summarization via Dracarys (OpenAI SDK)."""
    diff_instruction = DIFFICULTY_PREFIX[difficulty]
    prompt = (
        f"{diff_instruction}\n\n"
        f"Please provide a concise text summary of the following content:\n\n{text}"
    )
    try:
        completion = text_client.chat.completions.create(
            model=TEXT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=TEMP_TEXT,
            top_p=TOP_P_TEXT,
            max_tokens=MAX_TOKENS_TEXT,
            stream=True,
        )
        for chunk in completion:
            delta = chunk.choices[0].delta.content
            if delta is not None:
                yield delta
    except Exception as e:
        logger.exception("stream_dracarys failed")
        yield f"\n\n[Error: {str(e)}]"


def stream_nemotron(text: str, mode: str, difficulty: str = "intermediate"):
    """Stream structured output (notes / flowchart / exam) via Nemotron Super 49B."""
    diff_instruction = DIFFICULTY_PREFIX[difficulty]
    system_prompt = f"{diff_instruction}\n\n{MODE_PROMPTS[mode]}"
    try:
        completion = nemotron_client.chat.completions.create(
            model=NEMOTRON_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": text},
            ],
            temperature=TEMP_NEMOTRON,
            top_p=TOP_P_NEMOTRON,
            max_tokens=MAX_TOKENS_NEMOTRON,
            frequency_penalty=0,
            presence_penalty=0,
            stream=True,
        )
        for chunk in completion:
            delta = chunk.choices[0].delta.content
            if delta is not None:
                yield delta
    except Exception as e:
        logger.exception("stream_nemotron failed")
        yield f"\n\n[Error: {str(e)}]"


def stream_kimi(text: str, media_parts: list):
    """Stream image/video analysis via Kimi K2.5 (raw requests + SSE)."""
    prompt_text = text or "Please analyze and describe the attached media in detail."
    content_parts = [{"type": "text", "text": prompt_text}, *media_parts]

    headers = {
        "Authorization": f"Bearer {KIMI_API_KEY}",
        "Accept": "text/event-stream",
        "Content-Type": "application/json",
    }
    payload = {
        "model": VISION_MODEL,
        "messages": [{"role": "user", "content": content_parts}],
        "max_tokens": MAX_TOKENS_KIMI,
        "temperature": TEMP_KIMI,
        "top_p": TOP_P_KIMI,
        "stream": True,
        "chat_template_kwargs": {"thinking": True},
    }

    try:
        response = http_requests.post(
            KIMI_API_URL,
            headers=headers,
            json=payload,
            stream=True,
            timeout=REQUEST_TIMEOUT_SEC,
        )

        if response.status_code != 200:
            yield f"\n\n[API Error {response.status_code}: {response.text[:500]}]"
            return

        in_reasoning   = False
        reasoning_done = False

        for line in response.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8")
            if not decoded.startswith("data: "):
                continue
            data_str = decoded[6:]
            if data_str.strip() == "[DONE]":
                break
            try:
                chunk = json.loads(data_str)
                choices = chunk.get("choices", [])
                if not choices:
                    continue
                delta     = choices[0].get("delta", {})
                content   = delta.get("content")
                reasoning = delta.get("reasoning_content")

                if reasoning:
                    if not in_reasoning:
                        yield "> **Thinking Process...**\n> "
                        in_reasoning = True
                    yield reasoning.replace("\n", "\n> ")

                if content is not None:
                    if in_reasoning and not reasoning_done:
                        yield "\n\n"
                        reasoning_done = True
                    yield content
            except json.JSONDecodeError:
                continue

    except http_requests.exceptions.Timeout:
        logger.error("stream_kimi timed out")
        yield "\n\n[Error: Request timed out.]"
    except Exception as e:
        logger.exception("stream_kimi failed")
        yield f"\n\n[Error: {str(e)}]"


# ═════════════════════════════════════════════════════════════════════════════
# Export routes
# ═════════════════════════════════════════════════════════════════════════════

@app.route("/export_docx", methods=["POST"])
def export_docx():
    data = request.json or {}
    text = data.get("text", "")
    if not text.strip():
        return api_error("No text provided for export.")

    doc = docx.Document()
    doc.add_heading("AI Summary", 0)
    doc.add_paragraph(text)

    stream = io.BytesIO()
    doc.save(stream)
    stream.seek(0)
    return send_file(
        stream, as_attachment=True, download_name="summary.docx",
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@app.route("/export_pdf", methods=["POST"])
def export_pdf():
    """
    Change 6 — Unicode-safe PDF export.
    Uses DejaVu Sans (bundled with fpdf2) to handle all Unicode characters
    including emojis, Hindi, Arabic, etc. without silent replacement.
    """
    data = request.json or {}
    text = data.get("text", "")
    if not text.strip():
        return api_error("No text provided for export.")

    pdf = FPDF()
    pdf.add_page()
    pdf.add_font("DejaVu", "", "DejaVuSans.ttf")
    pdf.set_font("DejaVu", size=11)
    pdf.multi_cell(w=0, h=6, text=text)

    stream = io.BytesIO(pdf.output())
    stream.seek(0)
    return send_file(
        stream, as_attachment=True, download_name="summary.pdf",
        mimetype="application/pdf",
    )


@app.route("/export_image_pdf", methods=["POST"])
def export_image_pdf():
    """
    Change 7 — Temp file handled safely via context manager.
    Guaranteed cleanup even if pdf.image() raises an exception.
    """
    file = request.files.get("image")
    if not file:
        return api_error("No image provided.")

    img_bytes = file.read()

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(img_bytes)
        tmp_path = tmp.name

    pdf = FPDF(orientation="L")   # Landscape — better for flowcharts
    pdf.add_page()

    try:
        pdf.image(tmp_path, x=10, y=10, w=pdf.w - 20)
    except Exception:
        logger.warning("Could not embed image in PDF — writing fallback text.")
        pdf.set_font("Helvetica", size=14)
        pdf.cell(w=0, h=10, text="Flowchart image could not be embedded.")
    finally:
        os.unlink(tmp_path)   # Always cleaned up

    stream = io.BytesIO(pdf.output())
    stream.seek(0)
    return send_file(
        stream, as_attachment=True, download_name="flowchart.pdf",
        mimetype="application/pdf",
    )


# ═════════════════════════════════════════════════════════════════════════════
# Entry point — Change 12: debug controlled by env variable, not hardcoded
# ═════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    port       = int(os.environ.get("PORT", 5000))
    logger.info(f"Starting server on port {port} (debug={debug_mode})")
    app.run(debug=debug_mode, port=port)
