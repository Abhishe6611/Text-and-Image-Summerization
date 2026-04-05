"use client";

import { useState, useRef, useEffect, useCallback, type ChangeEvent, type DragEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Paperclip,
  Layers,
  Wand2,
  FileText,
  Loader2,
  X,
  BookOpen,
  GitFork,
  GraduationCap,
  Copy,
  Check,
  Upload,
  Clock,
  Hash,
  Image,
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`; // reset first
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

export default function RuixenMoonChat() {
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [outputMode, setOutputMode] = useState<"summarize" | "notes" | "flowchart" | "exam">("summarize");
  const [copied, setCopied] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [difficulty, setDifficulty] = useState<"simple" | "intermediate" | "advanced">("intermediate");
  const [genPhase, setGenPhase] = useState<"idle" | "thinking" | "generating" | "done">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mermaidRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 120,
    maxHeight: 400,
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Drag & Drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current && isLoading) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [summary, isLoading]);

  // Word count & reading time
  const wordCount = summary.trim() ? summary.trim().split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  const handleSummarize = async () => {
    if (!message.trim() && selectedFiles.length === 0) return;

    setHasStarted(true);
    setIsLoading(true);
    setSummary("");
    setGenPhase("thinking");

    const formData = new FormData();
    selectedFiles.forEach(f => formData.append("file", f));
    if (message.trim()) {
      formData.append("text", message);
    }
    formData.append("mode", outputMode);
    formData.append("difficulty", difficulty);

    try {
      const response = await fetch("http://localhost:5000/summarize", {
        method: "POST",
        body: formData,
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (genPhase === "thinking") setGenPhase("generating");
        setSummary((prev) => prev + chunk);
      }
    } catch (err) {
      console.error(err);
      setSummary("\n\n[Error: Failed to fetch summary. Make sure the backend is running.]");
    } finally {
      setIsLoading(false);
      setGenPhase("done");
    }
  };

  const handleExport = async (format: "txt" | "docx" | "pdf") => {
    if (!summary) return;
    try {
      if (format === "txt") {
        const blob = new Blob([summary], { type: "text/plain" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "summary.txt";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }

      const endpoint = format === "pdf" ? "export_pdf" : "export_docx";
      const response = await fetch(`http://localhost:5000/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: summary }),
      });
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `summary.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  // Flowchart export (PNG or PDF)
  const handleFlowchartExport = async (format: "png" | "pdf") => {
    if (!mermaidRef.current) return;
    const svgEl = mermaidRef.current.querySelector('svg');
    if (!svgEl) return;

    // Serialize SVG to data URL
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new window.Image();
    img.onload = async () => {
      const canvas = document.createElement('canvas');
      const scale = 2; // high-res
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);

      if (format === "png") {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'flowchart.png';
          a.click();
        }, 'image/png');
      } else {
        // PDF: send the PNG to backend
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const formData = new FormData();
          formData.append('image', blob, 'flowchart.png');
          try {
            const res = await fetch('http://localhost:5000/export_image_pdf', {
              method: 'POST',
              body: formData,
            });
            const pdfBlob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(pdfBlob);
            a.download = 'flowchart.pdf';
            a.click();
          } catch (err) {
            console.error('PDF export failed:', err);
          }
        }, 'image/png');
      }
    };
    img.src = url;
  };

  // Mermaid rendering effect for flowchart mode
  useEffect(() => {
    if (outputMode === "flowchart" && summary && !isLoading && mermaidRef.current) {
      // Extract mermaid code from markdown code block (handle various formats)
      const mermaidMatch = summary.match(/```mermaid\s*\n([\s\S]*?)```/) 
        || summary.match(/```\s*\n?(graph\s+[\s\S]*?)```/)
        || summary.match(/```\s*\n?(flowchart\s+[\s\S]*?)```/);
      let code = mermaidMatch ? mermaidMatch[1].trim() : summary.trim();
      
      // Strip any non-mermaid lines at the start (model preamble)
      if (!code.startsWith('graph') && !code.startsWith('flowchart')) {
        const graphIdx = code.search(/^(graph|flowchart)\s/m);
        if (graphIdx > 0) code = code.substring(graphIdx);
      }
      
      mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
      
      const renderMermaid = async () => {
        try {
          if (mermaidRef.current) {
            const id = `mermaid-${Date.now()}`;
            const { svg } = await mermaid.render(id, code);
            if (mermaidRef.current) {
              mermaidRef.current.innerHTML = svg;
            }
          }
        } catch (err) {
          console.error('Mermaid render error:', err);
          if (mermaidRef.current) {
            mermaidRef.current.innerHTML = `<pre style="white-space:pre-wrap;font-size:13px;padding:16px;border:4px solid black;background:#fff8e1;">⚠️ Mermaid diagram had syntax issues. Raw code:\n\n${code}</pre>`;
          }
        } finally {
          // Clean up mermaid error elements that get injected into body
          document.querySelectorAll('#d-mermaid-err, [id^="dmermaid"], .mermaid-error').forEach(el => el.remove());
          const errorDivs = document.querySelectorAll('div[id*="mermaid"]');
          errorDivs.forEach(el => {
            if (el.getAttribute('data-processed') === null && !mermaidRef.current?.contains(el)) {
              el.remove();
            }
          });
        }
      };
      renderMermaid();
    }
  }, [summary, isLoading, outputMode]);

  const MODE_CONFIG = {
    summarize: { label: "SUMMARIZE", icon: <Wand2 className="w-4 h-4" />, color: "bg-[#00ffff]" },
    notes:     { label: "NOTES",     icon: <BookOpen className="w-4 h-4" />, color: "bg-[#ff00ff]" },
    flowchart: { label: "FLOWCHART", icon: <GitFork className="w-4 h-4" />, color: "bg-[#ffdf00]" },
    exam:      { label: "EXAM PREP", icon: <GraduationCap className="w-4 h-4" />, color: "bg-[#39ff14]" },
  } as const;

  return (
    <div className="relative w-full h-screen flex flex-col items-center overflow-hidden brutal-bg text-black font-sans">
      
      {/* Instant Header */}
      <div className={cn(
        "absolute z-10 w-full transform transition-all duration-700 ease-out flex items-center justify-center",
        hasStarted
          ? "top-0 h-20 bg-white border-b-4 border-black"
          : "top-[10vh] lg:top-[12vh] h-32"
      )}>
        <div className={cn(
          "flex items-center gap-4 transition-transform duration-700 ease-out",
          hasStarted ? "scale-75 origin-left lg:absolute lg:left-8" : "scale-100 flex-col"
        )}>
          <div className="flex items-center justify-center bg-[#ff00ff] brutal-box p-3 border-4 border-black rounded-none brutal-shadow-sm">
            <Wand2 className={cn("text-black transition-all", hasStarted ? "w-6 h-6" : "w-10 h-10")} />
          </div>
          <div className={cn("flex flex-col items-center", hasStarted && "lg:items-start")}>
            <h1 className="font-black uppercase tracking-tighter text-4xl lg:text-5xl text-black">
              DOCUSUM
            </h1>
            {!hasStarted && (
               <p className="bg-[#39ff14] text-black font-bold uppercase mt-3 text-center text-sm md:text-base px-3 py-1 border-4 border-black brutal-shadow-sm transform -rotate-2">
                SYSTEM INITIALIZED
               </p>
            )}
          </div>
        </div>
      </div>

      {/* Grid-Based Container */}
      <div className={cn(
        "relative z-10 w-full max-w-7xl mx-auto px-4 lg:px-8 transition-all duration-700 ease-in-out flex flex-col overflow-hidden",
        hasStarted ? "pt-28 flex-1" : "pt-[38vh] lg:pt-[34vh]"
      )}>
        <div className={cn(
          "grid gap-8 transition-all duration-700 ease-out min-h-0",
          hasStarted ? "grid-cols-1 lg:grid-cols-2 flex-1 w-full pb-4" : "grid-cols-1 max-w-3xl mx-auto w-full h-[380px]"
        )}>
          
          {/* Left Column: Input Box */}
          <div className="flex flex-col min-h-0 overflow-hidden brutal-box bg-white">
            <div className="flex items-center justify-between px-5 py-3 border-b-4 border-black bg-[#00ffff]">
              <div className="flex items-center gap-3 text-black text-sm font-black uppercase tracking-widest">
                <FileText className="w-5 h-5" />
                <span>Source Text</span>
              </div>
            </div>

            {/* Mode Toggle Bar */}
            <div className="flex flex-wrap gap-2 px-4 py-3 border-b-4 border-black bg-[#f0f0f0]">
              {(Object.keys(MODE_CONFIG) as Array<keyof typeof MODE_CONFIG>).map((key) => {
                const cfg = MODE_CONFIG[key];
                const isActive = outputMode === key;
                return (
                  <button
                    key={key}
                    onClick={() => setOutputMode(key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase border-4 border-black rounded-none transition-all",
                      isActive
                        ? `${cfg.color} text-black shadow-[0px_0px_0px_0px_#000] translate-x-[3px] translate-y-[3px]`
                        : "bg-white text-black shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#000]"
                    )}
                  >
                    {cfg.icon}
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Drag & Drop Zone + Textarea */}
            <div
              className={cn(
                "flex-1 min-h-0 flex flex-col relative",
                isDragging && "ring-4 ring-[#ff00ff] ring-inset bg-[#ff00ff]/10"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragging && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 border-4 border-dashed border-[#ff00ff]">
                  <div className="flex flex-col items-center gap-2">
                    <Upload className="w-10 h-10 text-[#ff00ff]" />
                    <span className="font-black text-lg uppercase">DROP FILES HERE</span>
                  </div>
                </div>
              )}
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (!hasStarted) adjustHeight();
                }}
                placeholder="PASTE YOUR DOCUMENTATION HERE OR DRAG & DROP FILES..."
                className="w-full px-6 py-5 resize-none outline-none border-none flex-1 min-h-0 bg-white text-black font-bold text-[15px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-neutral-400 custom-scrollbar rounded-none overflow-y-auto"
              />
            </div>

            {/* Difficulty Selector */}
            <div className="flex items-center gap-2 px-4 py-2 border-t-4 border-black bg-[#e8e8e8] shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-600">LEVEL:</span>
              {(["simple", "intermediate", "advanced"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setDifficulty(lvl)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-black uppercase border-2 border-black rounded-none transition-all",
                    difficulty === lvl
                      ? "bg-black text-white shadow-none translate-x-[1px] translate-y-[1px]"
                      : "bg-white text-black shadow-[2px_2px_0px_0px_#000] hover:shadow-[1px_1px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px]"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between p-4 border-t-4 border-black bg-[#f0f0f0] shrink-0 lg:gap-4 flex-wrap gap-2">
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".txt,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm"
                multiple
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "rounded-none border-4 border-black font-black uppercase transition-all brutal-btn-sm-active shadow-[4px_4px_0px_0px_#000] px-4 py-2",
                    selectedFiles.length > 0 ? "bg-[#39ff14] text-black hover:bg-[#32e012]" : "bg-white text-black hover:bg-neutral-200"
                  )}
                >
                  <Paperclip className="w-4 h-4 mr-2" />
                  <span>{selectedFiles.length > 0 ? `${selectedFiles.length} FILE${selectedFiles.length > 1 ? 'S' : ''}` : "Attach"}</span>
                </Button>
                {selectedFiles.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedFiles([]);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="rounded-none border-4 border-black font-black transition-all brutal-btn-sm-active shadow-[4px_4px_0px_0px_#000] px-2 py-2 bg-[#ff00ff] text-white hover:bg-[#d600d6]"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                )}
              </div>

              <div className="flex items-center md:gap-4 gap-2 flex-grow justify-end">
                <span className="text-xs text-black font-black hidden sm:block border-2 border-black bg-white px-2 py-1">
                  {message.length} CHARS
                </span>
                
                <Button
                  disabled={(message.length === 0 && selectedFiles.length === 0) || isLoading}
                  onClick={handleSummarize}
                  className={cn(
                    "flex items-center gap-2 px-8 py-6 rounded-none font-black text-lg uppercase transition-all brutal-btn-active",
                    (message.length > 0 || selectedFiles.length > 0) && !isLoading
                      ? `${MODE_CONFIG[outputMode].color} text-black border-4 border-black shadow-[6px_6px_0px_0px_#000] hover:brightness-110`
                      : "bg-neutral-300 border-4 border-black text-neutral-500 cursor-not-allowed shadow-[6px_6px_0px_0px_#000]"
                  )}
                >
                  {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : MODE_CONFIG[outputMode].icon}
                  <span>{isLoading ? "Processing..." : MODE_CONFIG[outputMode].label}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Right Column: Output Box */}
          {hasStarted && (
            <div className="flex flex-col min-h-0 overflow-hidden brutal-box bg-white animate-in slide-in-from-right-8 duration-500">
              <div className="flex items-center justify-between px-5 py-3 border-b-4 border-black bg-[#ffdf00] shrink-0">
                <div className="flex items-center gap-3 text-black text-sm font-black uppercase tracking-widest">
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{genPhase === "thinking" ? "Thinking..." : "Generating..."}</span>
                    </>
                  ) : (
                    <>
                      <Layers className="w-5 h-5" />
                      <span>{genPhase === "done" ? "Done ✓" : "Result Overview"}</span>
                    </>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {summary && !isLoading && (
                    <>
                      <Button onClick={handleCopy} variant="outline" size="sm" className={cn("h-8 px-3 text-black border-2 border-black rounded-none brutal-btn-sm-active shadow-[2px_2px_0px_0px_#000] font-black", copied ? "bg-[#39ff14]" : "bg-white hover:bg-[#ffdf00]")}>
                        {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                        {copied ? "COPIED" : "COPY"}
                      </Button>
                      {outputMode === "flowchart" ? (
                        <>
                          <Button onClick={() => handleFlowchartExport("png")} variant="outline" size="sm" className="h-8 px-3 text-black bg-white border-2 border-black rounded-none brutal-btn-sm-active shadow-[2px_2px_0px_0px_#000] hover:bg-[#39ff14] font-black">
                            <Image className="w-4 h-4 mr-1" /> PNG
                          </Button>
                          <Button onClick={() => handleFlowchartExport("pdf")} variant="outline" size="sm" className="h-8 px-3 text-black bg-white border-2 border-black rounded-none brutal-btn-sm-active shadow-[2px_2px_0px_0px_#000] hover:bg-[#00ffff] font-black">
                            PDF
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button onClick={() => handleExport("txt")} variant="outline" size="sm" className="h-8 px-3 text-black bg-white border-2 border-black rounded-none brutal-btn-sm-active shadow-[2px_2px_0px_0px_#000] hover:bg-[#39ff14] font-black">
                            TXT
                          </Button>
                          <Button onClick={() => handleExport("docx")} variant="outline" size="sm" className="h-8 px-3 text-black bg-white border-2 border-black rounded-none brutal-btn-sm-active shadow-[2px_2px_0px_0px_#000] hover:bg-[#ff00ff] hover:text-white font-black">
                            DOCX
                          </Button>
                          <Button onClick={() => handleExport("pdf")} variant="outline" size="sm" className="h-8 px-3 text-black bg-white border-2 border-black rounded-none brutal-btn-sm-active shadow-[2px_2px_0px_0px_#000] hover:bg-[#00ffff] font-black">
                            PDF
                          </Button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Stats Bar */}
              {summary && !isLoading && (
                <div className="flex items-center gap-4 px-5 py-2 border-b-4 border-black bg-[#f0f0f0] shrink-0">
                  <div className="flex items-center gap-1">
                    <Hash className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase">{wordCount} WORDS</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase">{readingTime} MIN READ</span>
                  </div>
                </div>
              )}

              <div ref={outputRef} className="p-6 md:p-8 text-black text-[15px] font-medium leading-relaxed flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-white">
                {isLoading && !summary ? (
                  <div className="flex flex-col gap-5 opacity-100 mt-2">
                    <div className="h-5 border-4 border-black bg-neutral-200 w-3/4 brutal-shadow-sm animate-pulse"></div>
                    <div className="h-5 border-4 border-black bg-neutral-200 w-full brutal-shadow-sm animate-pulse"></div>
                    <div className="h-5 border-4 border-black bg-neutral-200 w-5/6 brutal-shadow-sm animate-pulse"></div>
                    <div className="h-5 border-4 border-black bg-neutral-200 w-full brutal-shadow-sm animate-pulse"></div>
                  </div>
                ) : outputMode === "flowchart" && !isLoading && summary ? (
                  <div className="w-full flex flex-col items-center">
                    <div ref={mermaidRef} className="w-full overflow-x-auto border-4 border-black p-4 bg-white brutal-shadow" />
                  </div>
                ) : (
                  <div className="prose prose-strong:text-black prose-strong:font-black prose-h1:font-black prose-h2:font-black prose-h3:font-bold prose-p:font-bold prose-li:font-bold prose-code:font-black prose-code:bg-[#ffdf00] prose-code:px-1 prose-pre:border-4 prose-pre:border-black prose-pre:bg-white text-black max-w-none">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
