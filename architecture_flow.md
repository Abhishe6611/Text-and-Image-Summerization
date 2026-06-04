High-Level System Design 
+-------------------------------------------------------------+ 
|                         USER                                | 
|             (Browser / Web Interface)                       | 
+---------------------------+---------------------------------+ 
                            | 
                            | HTTP Request 
                            | 
                            ▼ 
+-------------------------------------------------------------+ 
|                    FLASK APPLICATION                        | 
|                        (app.py)                             | 
+-------------------------------------------------------------+ 
                            | 
         +------------------+-------------------+ 
         |                                      | 
         ▼                                      ▼ 
+-------------------+                +--------------------+ 
| Input Validation  |                | Logging & Errors   | 
| • File Type Check |                | • Activity Logs    | 
| • File Size Check |                | • Exception Handle | 
+---------+---------+                +--------------------+ 
          | 
          ▼ 
+-------------------------------------------------------------+ 
|                  DOCUMENT PROCESSOR                         | 
+-------------------------------------------------------------+ 
| TXT Files  → Direct Text Extraction                         | 
| PDF Files  → PyPDF2 / PyMuPDF                              | 
| DOCX Files → python-docx                                   | 
| Images     → Base64 Encoding                               | 
| Videos     → Base64 Encoding                               | 
+---------------------------+---------------------------------+ 
                            | 
                            ▼ 
+-------------------------------------------------------------+ 
|                     MODEL ROUTER                            | 
+-------------------------------------------------------------+ 
|                                                             | 
| Text ----------------------> Dracarys LLM                  | 
| Notes / Flowchart / Exam -> Nemotron LLM                   | 
| Image / Video -----------> Kimi Vision Model               | 
|                                                             | 
+---------------------------+---------------------------------+ 
                            | 
                            ▼ 
+-------------------------------------------------------------+ 
|                  STREAMING RESPONSE                         | 
|             (Server Sent Events - SSE)                      | 
+---------------------------+---------------------------------+ 
                            | 
                            ▼ 
+-------------------------------------------------------------+ 
|                    USER INTERFACE                           | 
|                                                             | 
| Display Summary / Notes / Flowchart / Analysis             | 
|                                                             | 
|         Export PDF            Export DOCX                  | 
+-------------------------------------------------------------+ 
 
2. Complete Workflow 
                    START 
                      │ 
                      ▼ 
          User Opens Web Application 
                      │ 
                      ▼ 
       Upload Text / PDF / DOCX / Image / Video 
                      │ 
                      ▼ 
            Flask Receives Request 
                      │ 
                      ▼ 
          Validate File Size & Type 
                      │ 
             ┌────────┴────────┐ 
             │                 │ 
             ▼                 ▼ 
      Invalid File        Valid File 
             │                 │ 
      Return Error            ▼ 
                    Extract Text / Media 
                              │ 
                     ┌────────┴─────────┐ 
                     │                  │ 
                     ▼                  ▼ 
             Text Available      Image / Video 
                     │                  │ 
                     └────────┬─────────┘ 
                              │ 
                              ▼ 
                     AI Model Selection 
                              │ 
       ┌──────────────────────┼───────────────────────┐ 
       │                      │                       │ 
       ▼                      ▼                       ▼ 
 Dracarys LLM         Nemotron LLM          Kimi Vision 
(Text Summary)     (Notes/Flowchart)      (Media Analysis) 
       │                      │                       │ 
       └──────────────────────┼───────────────────────┘ 
                              │ 
                              ▼ 
                  Stream AI Generated Output 
                              │ 
                              ▼ 
                  Display Result on Browser 
                              │ 
                 ┌────────────┴────────────┐ 
                 │                         │ 
                 ▼                         ▼ 
         Export as PDF             Export as DOCX 
                 │                         │ 
                 └────────────┬────────────┘ 
                              │ 
                              ▼ 
                            END 
 
3. Data Flow Diagram (DFD - Level 0) 
                 +----------------+ 
                 |     User       | 
                 +--------+-------+ 
                          | 
              Upload Input / Request 
                          | 
                          ▼ 
              +----------------------+ 
              |  AI Summary System   | 
              +----------+-----------+ 
                         | 
         ----------------------------------- 
         |                |                | 
         ▼                ▼                ▼ 
+---------------+ +---------------+ +---------------+ 
| Dracarys AI   | | Nemotron AI   | | Kimi Vision   | 
| Text Summary  | | Notes & Exam  | | Media Analyze | 
+-------+-------+ +-------+-------+ +-------+-------+ 
        |                 |                 | 
        ------------------------------------- 
                          | 
                          ▼ 
                Generated AI Output 
                          | 
                          ▼ 
                    +-----------+ 
                    |   User    | 
                    +-----------+ 
 
4. Module Design 
app.py 
│ 
├── Configuration 
│     ├── Load API Keys 
│     ├── Initialize Models 
│     └── Logging 
│ 
├── Utility Functions 
│     ├── validate_size() 
│     ├── extract_pdf_text() 
│     ├── scanned_pdf_to_images() 
│     └── format_error() 
│ 
├── Routes 
│     ├── / 
│     ├── /health 
│     ├── /summarize 
│     ├── /export_pdf 
│     └── /export_docx 
│ 
├── AI Services 
│     ├── stream_dracarys() 
│     ├── stream_nemotron() 
│     └── stream_kimi() 
│ 
└── Application Runner 
└── app.run() 
