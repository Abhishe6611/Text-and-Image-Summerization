# Architecture Flow

## Text & Image Summarization Platform

---

# 1. Overview

The Text & Image Summarization Platform is a multimodal AI application designed to process text documents, images, videos, and scanned PDFs and generate intelligent outputs such as:

* Text Summaries
* Structured Study Notes
* Mermaid Flowcharts
* Exam Preparation Material
* Image/Video Analysis Reports

The application is implemented using **Flask**, **OpenAI-compatible NVIDIA NIM APIs**, **PyPDF2**, **PyMuPDF**, **FPDF**, and several document-processing libraries.

The architecture follows a modular request-processing pipeline consisting of:

1. Client Layer
2. Request Validation Layer
3. Content Extraction Layer
4. AI Processing Layer
5. Streaming Response Layer
6. Export Services Layer

---

# 2. High-Level Architecture

```text
┌─────────────────────┐
│      User UI        │
│ Browser / Frontend  │
└──────────┬──────────┘
           │ HTTP Request
           ▼
┌─────────────────────┐
│     Flask App       │
│      app.py         │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Validation Layer    │
│ Mode Validation     │
│ File Validation     │
│ Size Validation     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Content Extraction  │
│ PDF Parser          │
│ DOCX Parser         │
│ Text Reader         │
│ Media Converter     │
└──────────┬──────────┘
           │
           ▼
┌───────────────────────────────────┐
│ AI Routing Engine                 │
├───────────────────────────────────┤
│ Text → Dracarys Model             │
│ Notes → Nemotron Model            │
│ Exam → Nemotron Model             │
│ Flowchart → Nemotron Model        │
│ Media → Kimi Vision Model         │
└──────────┬────────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Streaming Engine    │
│ Token Streaming     │
│ SSE Processing      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Client Response     │
└─────────────────────┘
```

---

# 3. Request Lifecycle

## Step 1 — User Request

The user submits one of the following:

* Raw Text
* PDF Document
* DOCX Document
* Image File
* Video File

The request is sent to:

```http
POST /summarize
```

---

## Step 2 — Rate Limiting

Before any processing begins, Flask-Limiter evaluates the request.

### Global Limits

```python
200 requests/day
50 requests/hour
```

### Endpoint Limit

```python
10 requests/minute
```

Purpose:

* Prevent abuse
* Protect AI APIs
* Prevent denial-of-service attacks

---

## Step 3 — Input Validation

The application validates:

### Mode

Allowed values:

```python
summarize
notes
flowchart
exam
```

### Difficulty

Allowed values:

```python
simple
intermediate
advanced
```

Invalid values immediately return:

```json
{
  "success": false,
  "error": "Invalid mode",
  "status": 400
}
```

---

## Step 4 — Upload Validation

Maximum upload size:

```python
50 MB
```

Configured via:

```python
MAX_CONTENT_LENGTH
```

Oversized uploads trigger:

```http
413 Payload Too Large
```

Response:

```json
{
  "success": false,
  "error": "File too large"
}
```

---

# 4. Content Extraction Layer

The extraction layer converts uploaded files into AI-consumable content.

---

## Text Files

Supported:

```text
.txt
```

Processing:

```python
file.read().decode("utf-8")
```

Output:

```python
(text_content, [])
```

---

## DOCX Files

Supported:

```text
.docx
```

Processing:

```python
docx.Document()
```

Paragraphs are extracted and merged into a single text body.

Output:

```python
(text_content, [])
```

---

## PDF Files

Supported:

```text
.pdf
```

### Scenario A — Text-Based PDF

PyPDF2 extracts text.

```python
page.extract_text()
```

Output:

```python
(text_content, [])
```

---

### Scenario B — Scanned PDF

If no text is detected:

1. PyMuPDF renders pages.
2. Pages converted to PNG.
3. Images encoded to Base64.
4. Sent to Vision Model.

Output:

```python
("", media_parts)
```

---

## Image Files

Supported:

```text
png
jpg
jpeg
gif
webp
```

Processing:

```python
Base64 Encoding
```

Output:

```python
media_parts
```

---

## Video Files

Supported:

```text
mp4
webm
```

Processing:

```python
Base64 Encoding
```

Output:

```python
media_parts
```

---

# 5. AI Routing Engine

After extraction, the system decides which AI model should process the request.

---

## Route 1 — Media Analysis

Condition:

```python
if media_parts:
```

Model:

```python
moonshotai/kimi-k2.5
```

Function:

```python
stream_kimi()
```

Capabilities:

* Image Understanding
* Video Analysis
* OCR
* Visual Reasoning
* Caption Generation

---

## Route 2 — Structured Content Generation

Condition:

```python
notes
flowchart
exam
```

Model:

```python
nvidia/llama-3.3-nemotron-super-49b-v1.5
```

Function:

```python
stream_nemotron()
```

Capabilities:

* Study Notes
* Exam Material
* Flowcharts
* Educational Content

---

## Route 3 — Standard Summarization

Condition:

```python
mode == summarize
```

Model:

```python
abacusai/dracarys-llama-3.1-70b-instruct
```

Function:

```python
stream_dracarys()
```

Capabilities:

* Text Summaries
* Article Condensation
* Report Summaries

---

# 6. Prompt Engineering Layer

The application dynamically modifies prompts based on difficulty.

---

## Simple

Target Audience:

```text
Beginners
```

Instruction:

```text
Explain like a 10th grader.
Avoid jargon.
```

---

## Intermediate

Target Audience:

```text
College Students
```

Instruction:

```text
Balanced detail and readability.
```

---

## Advanced

Target Audience:

```text
Professionals
```

Instruction:

```text
Technical language
Edge cases
Expert-level detail
```

---

# 7. Streaming Architecture

Instead of waiting for full AI generation, responses are streamed.

Benefits:

* Faster perceived response time
* Better UX
* Lower timeout probability

---

## Dracarys Streaming

Uses:

```python
OpenAI SDK
```

Pattern:

```python
stream=True
```

Data Flow:

```text
Model
 ↓
Token Chunk
 ↓
Yield
 ↓
Client
```

---

## Nemotron Streaming

Uses:

```python
OpenAI SDK Streaming
```

Returns:

```text
Notes
Flowcharts
Exam Content
```

Token-by-token.

---

## Kimi Streaming

Uses:

```python
Server-Sent Events (SSE)
```

Data Flow:

```text
HTTP Stream
 ↓
JSON Chunks
 ↓
Reasoning Stream
 ↓
Final Output
```

Unique capability:

```text
Shows Thinking Process
```

before final answer generation.

---

# 8. Export Services

The platform provides downloadable outputs.

---

## DOCX Export

Endpoint:

```http
POST /export_docx
```

Library:

```python
python-docx
```

Output:

```text
summary.docx
```

---

## PDF Export

Endpoint:

```http
POST /export_pdf
```

Library:

```python
FPDF
```

Font:

```python
DejaVu Sans
```

Benefits:

* Unicode support
* Hindi support
* Arabic support
* Emoji support

---

## Flowchart PDF Export

Endpoint:

```http
POST /export_image_pdf
```

Process:

```text
Image
 ↓
Temporary File
 ↓
PDF
 ↓
Download
```

Automatic cleanup prevents file leaks.

---

# 9. Logging System

Every request generates logs.

Example:

```text
summarize | mode=notes
difficulty=advanced
has_media=False
text_len=5420
```

Benefits:

* Monitoring
* Debugging
* Auditability

---

# 10. Health Monitoring

Endpoint:

```http
GET /health
```

Response:

```json
{
  "status": "ok",
  "models": {
    "text": "...",
    "vision": "...",
    "structured": "..."
  }
}
```

Used by:

* Load balancers
* Monitoring systems
* Kubernetes probes
* CI/CD validation

---

# 11. Security Features

## File Size Restriction

```python
50 MB
```

---

## Input Validation

Mode validation

Difficulty validation

---

## Uniform Error Responses

Example:

```json
{
  "success": false,
  "error": "Unsupported file type",
  "status": 400
}
```

---

## Rate Limiting

Protects infrastructure from abuse.

---

## Temporary File Cleanup

Guaranteed deletion via:

```python
finally:
    os.unlink(tmp_path)
```

---

# 12. Complete End-to-End Flow

```text
User Uploads File
        │
        ▼
Flask Route (/summarize)
        │
        ▼
Rate Limiter
        │
        ▼
Input Validation
        │
        ▼
Content Extraction
        │
        ▼
AI Router
 ┌──────┼───────────┐
 │      │           │
 ▼      ▼           ▼
Dracarys Nemotron  Kimi
 │        │         │
 ▼        ▼         ▼
Streaming Response
        │
        ▼
User Receives Output
        │
        ▼
Optional Export
(DOCX / PDF)
```

# Conclusion

The architecture follows a layered, modular design focused on scalability, maintainability, and security. The application separates validation, content extraction, AI inference, streaming delivery, and export generation into clearly defined responsibilities. Through rate limiting, structured error handling, health monitoring, and multimodal AI routing, the platform is suitable for both educational and production-oriented deployments.
