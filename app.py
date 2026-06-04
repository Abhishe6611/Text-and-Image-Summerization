
from flask import Flask, render_template, request, jsonify, send_file, Response
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv
import requests as http_requests
import os
import io
import json
import base64
import logging
import tempfile
import PyPDF2
import docx
import fitz
from fpdf import FPDF

# --------------------------------------------------
# Configuration
# --------------------------------------------------
load_dotenv()

app = Flask(__name__)
CORS(app)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 25 * 1024 * 1024

TEXT_API_KEY = os.getenv("TEXT_API_KEY")
KIMI_API_KEY = os.getenv("KIMI_API_KEY")
NEMOTRON_API_KEY = os.getenv("NEMOTRON_API_KEY")

TEXT_MODEL = "abacusai/dracarys-llama-3.1-70b-instruct"
VISION_MODEL = "moonshotai/kimi-k2.5"
NEMOTRON_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1.5"

KIMI_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"

text_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=TEXT_API_KEY
)

nemotron_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=NEMOTRON_API_KEY
)

TEXT_EXTS = {"txt"}
DOC_EXTS = {"pdf", "docx"}
IMAGE_EXTS = {"png", "jpg", "jpeg", "gif", "webp"}
VIDEO_EXTS = {"mp4", "webm"}

MIME_MAP = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm"
}

MODE_PROMPTS = {
    "notes": "Generate structured study notes.",
    "flowchart": "Generate Mermaid flowchart code only.",
    "exam": "Generate exam preparation material."
}

DIFFICULTY_PREFIX = {
    "simple": "Use beginner friendly language.",
    "intermediate": "Use balanced academic language.",
    "advanced": "Use technical and detailed language."
}


# --------------------------------------------------
# Utility Functions
# --------------------------------------------------
def validate_size(file):
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)

    if size > MAX_FILE_SIZE:
        raise Exception(
            f"{file.filename} exceeds 25MB upload limit."
        )


def extract_pdf_text(file):
    reader = PyPDF2.PdfReader(file)
    return "".join(
        page.extract_text() or ""
        for page in reader.pages
    )


def scanned_pdf_to_images(file):
    media = []

    file.seek(0)
    pdf_bytes = file.read()

    doc = fitz.open(
        stream=pdf_bytes,
        filetype="pdf"
    )

    for i in range(min(len(doc), 20)):
        pix = doc[i].get_pixmap(dpi=150)
        img = base64.b64encode(
            pix.tobytes("png")
        ).decode()

        media.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{img}"
            }
        })

    return media


def format_error(message):
    return jsonify({
        "success": False,
        "error": str(message)
    })


# --------------------------------------------------
# Routes
# --------------------------------------------------
@app.route("/")
def home():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({
        "status": "running",
        "text_model": TEXT_MODEL,
        "vision_model": VISION_MODEL,
        "nemotron_model": NEMOTRON_MODEL
    })


@app.route("/summarize", methods=["POST"])
def summarize():
    try:
        text_content = ""
        media_parts = []

        uploaded_files = (
            request.files.getlist("files") +
            request.files.getlist("file")
        )

        for file in uploaded_files:

            if file.filename == "":
                continue

            validate_size(file)

            ext = file.filename.rsplit(
                ".", 1
            )[-1].lower()

            logger.info(
                f"Processing {file.filename}"
            )

            if ext in TEXT_EXTS:
                text_content += (
                    file.read().decode("utf-8")
                    + "\n"
                )

            elif ext == "docx":
                d = docx.Document(file)
                text_content += "\n".join(
                    p.text for p in d.paragraphs
                )

            elif ext == "pdf":
                extracted = extract_pdf_text(file)

                if extracted.strip():
                    text_content += extracted
                else:
                    media_parts.extend(
                        scanned_pdf_to_images(file)
                    )

            elif ext in IMAGE_EXTS.union(VIDEO_EXTS):
                raw = file.read()

                media_parts.append({
                    "type": "image_url",
                    "image_url": {
                        "url":
                        f"data:{MIME_MAP[ext]};base64,"
                        f"{base64.b64encode(raw).decode()}"
                    }
                })

            else:
                return format_error(
                    f"Unsupported file type: {ext}"
                ), 400

        if not text_content:
            text_content = request.form.get(
                "text",
                ""
            )

        if (
            not text_content.strip()
            and not media_parts
        ):
            return format_error(
                "No input supplied."
            ), 400

        mode = request.form.get(
            "mode",
            "summarize"
        )

        difficulty = request.form.get(
            "difficulty",
            "intermediate"
        )

        if media_parts:
            return Response(
                stream_kimi(
                    text_content,
                    media_parts
                ),
                mimetype="text/plain"
            )

        if mode in [
            "notes",
            "flowchart",
            "exam"
        ]:
            return Response(
                stream_nemotron(
                    text_content,
                    mode,
                    difficulty
                ),
                mimetype="text/plain"
            )

        return Response(
            stream_dracarys(
                text_content,
                difficulty
            ),
            mimetype="text/plain"
        )

    except Exception as e:
        logger.exception(e)
        return format_error(e), 500


# --------------------------------------------------
# AI Services
# --------------------------------------------------
def stream_dracarys(
    text,
    difficulty="intermediate"
):
    prompt = (
        DIFFICULTY_PREFIX.get(
            difficulty,
            ""
        )
        + "\n\nSummarize:\n\n"
        + text
    )

    try:
        completion = (
            text_client.chat.completions.create(
                model=TEXT_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.5,
                max_tokens=1024,
                stream=True
            )
        )

        for chunk in completion:
            if (
                chunk.choices[0]
                .delta.content
                is not None
            ):
                yield (
                    chunk.choices[0]
                    .delta.content
                )

    except Exception as e:
        yield f"\n\n[Error] {e}"


def stream_nemotron(
    text,
    mode,
    difficulty
):
    system_prompt = (
        DIFFICULTY_PREFIX.get(
            difficulty,
            ""
        )
        + "\n\n"
        + MODE_PROMPTS.get(
            mode,
            ""
        )
    )

    try:
        completion = (
            nemotron_client.chat
            .completions.create(
                model=NEMOTRON_MODEL,
                messages=[
                    {
                        "role":
                        "system",
                        "content":
                        system_prompt
                    },
                    {
                        "role":
                        "user",
                        "content":
                        text
                    }
                ],
                stream=True,
                max_tokens=4096
            )
        )

        for chunk in completion:
            if (
                chunk.choices[0]
                .delta.content
                is not None
            ):
                yield (
                    chunk.choices[0]
                    .delta.content
                )

    except Exception as e:
        yield f"\n\n[Error] {e}"


def stream_kimi(
    text,
    media_parts
):
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content":
                [{"type": "text",
                  "text": text}]
                + media_parts
            }
        ],
        "stream": True,
        "max_tokens": 4096
    }

    headers = {
        "Authorization":
        f"Bearer {KIMI_API_KEY}",
        "Content-Type":
        "application/json"
    }

    try:
        r = http_requests.post(
            KIMI_API_URL,
            json=payload,
            headers=headers,
            stream=True,
            timeout=120
        )

        for line in r.iter_lines():
            if line:
                txt = (
                    line.decode(
                        "utf-8"
                    )
                )
                if txt.startswith(
                    "data: "
                ):
                    yield txt[6:]

    except Exception as e:
        yield f"\n\n[Error] {e}"


# --------------------------------------------------
# Export APIs
# --------------------------------------------------
@app.route(
    "/export_docx",
    methods=["POST"]
)
def export_docx():

    text = (
        request.json
        .get("text", "")
    )

    d = docx.Document()
    d.add_heading(
        "AI Summary",
        0
    )
    d.add_paragraph(text)

    mem = io.BytesIO()
    d.save(mem)
    mem.seek(0)

    return send_file(
        mem,
        as_attachment=True,
        download_name="summary.docx"
    )


@app.route(
    "/export_pdf",
    methods=["POST"]
)
def export_pdf():

    text = (
        request.json
        .get("text", "")
    )

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font(
        "Helvetica",
        size=11
    )

    safe = (
        text.encode(
            "latin-1",
            "replace"
        )
        .decode(
            "latin-1"
        )
    )

    pdf.multi_cell(
        0,
        6,
        safe
    )

    out = io.BytesIO(
        pdf.output(
            dest="S"
        ).encode(
            "latin-1"
        )
    )

    return send_file(
        out,
        as_attachment=True,
        download_name="summary.pdf"
    )


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
