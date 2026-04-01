"use client";

import { useState, useRef, useEffect, useCallback, ChangeEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileUp,
  MonitorIcon,
  Paperclip,
  Layers,
  Wand2,
  FileText,
  AlignLeft,
  Settings2,
  Loader2,
  Download,
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 120,
    maxHeight: 400,
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSummarize = async () => {
    if (!message.trim() && !selectedFile) return;

    setHasStarted(true);
    setIsLoading(true);
    setSummary("");

    const formData = new FormData();
    if (selectedFile) {
      formData.append("file", selectedFile);
    }
    if (message.trim()) {
      formData.append("text", message);
    }

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
        setSummary((prev) => prev + chunk);
      }
    } catch (err) {
      console.error(err);
      setSummary("\n\n[Error: Failed to fetch summary. Make sure the backend is running.]");
    } finally {
      setIsLoading(false);
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

  return (
    <div
      className="relative w-full h-screen flex flex-col items-center overflow-hidden matrix-bg"
    >
      {/* Optimized strict overlay */}
      <div className="absolute inset-0 bg-neutral-950/80 z-0 mix-blend-multiply"></div>

      {/* Instant Header (Fast CSS transform) */}
      <div className={cn(
        "absolute z-10 w-full transform transition-all duration-700 ease-out flex items-center justify-center",
        hasStarted
          ? "top-0 h-20 bg-black/60 border-b border-white/5 backdrop-blur-md"
          : "top-[10vh] lg:top-[12vh] h-32"
      )}>
        <div className={cn(
          "flex items-center gap-4 transition-transform duration-700 ease-out",
          hasStarted ? "scale-75 origin-left lg:absolute lg:left-8" : "scale-100 flex-col"
        )}>
          <div className="flex items-center justify-center bg-black/60 rounded-full ring-1 ring-emerald-500/30 p-3 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Wand2 className={cn("text-emerald-400 transition-all", hasStarted ? "w-6 h-6" : "w-10 h-10")} />
          </div>
          <div className={cn("flex flex-col items-center", hasStarted && "lg:items-start")}>
            <h1 className="font-mono font-bold text-transparent bg-clip-text bg-gradient-to-b from-emerald-100 to-emerald-600 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] tracking-tighter text-4xl matrix-text">
              DOCUSUM_AI
            </h1>
            {!hasStarted && (
               <p className="text-emerald-500/70 font-mono font-medium mt-2 text-center text-sm md:text-base animate-pulse">
                &gt; INITIALIZING DOCUMENT SUMMARIZATION PROTOCOL_
               </p>
            )}
          </div>
        </div>
      </div>

      {/* Fast, Grid-Based Container. No Layout Reflows on the Container itself */}
      <div className={cn(
        "relative z-10 w-full max-w-7xl mx-auto px-4 lg:px-8 transition-all duration-700 ease-in-out flex flex-col pb-8",
        hasStarted ? "pt-28 flex-1" : "pt-[38vh] lg:pt-[34vh]"
      )}>
        
        {/* Ambient Matrix Glow behind the UI */}
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.03)_0%,rgba(0,0,0,0)_60%)] pointer-events-none" />

        <div className={cn(
          "grid gap-6 transition-all duration-700 ease-out",
          hasStarted ? "grid-cols-1 lg:grid-cols-2 h-[calc(100vh-140px)] lg:h-[calc(100vh-160px)] w-full" : "grid-cols-1 max-w-3xl mx-auto w-full h-[220px]"
        )}>
          
          {/* Left Column: Input Box */}
            <div className="flex flex-col h-full matrix-box rounded-2xl overflow-hidden backdrop-blur-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-500/20 bg-emerald-950/20">
              <div className="flex items-center gap-2 text-neutral-400 text-sm font-medium">
                <FileText className="w-4 h-4" />
                <span>Source Context</span>
              </div>
            </div>

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (!hasStarted) adjustHeight();
              }}
              placeholder="Paste your article, meeting notes, or documentation here..."
              className="w-full px-6 py-5 resize-none border-none flex-1 bg-transparent text-neutral-100 text-[15px] leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-neutral-600 custom-scrollbar"
              style={{ overflowY: "auto" }}
            />

            {/* Footer Buttons */}
            <div className="flex items-center justify-between p-4 border-t border-white/5 bg-black/40 mt-auto">
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".txt,.pdf,.docx"
              />
              <Button
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "hover:text-white hover:bg-neutral-800 rounded-lg gap-2 text-sm px-4 whitespace-nowrap",
                  selectedFile ? "text-emerald-400 bg-emerald-400/10" : "text-neutral-400"
                )}
              >
                <Paperclip className="w-4 h-4" />
                <span className="truncate max-w-[150px]">
                  {selectedFile ? selectedFile.name : "Attach File"}
                </span>
              </Button>

              <div className="flex items-center gap-4">
                <span className="text-xs text-neutral-500 font-medium hidden sm:block">
                  {message.length} chars
                </span>

                {/* Highly Performant CSS Gradient Border Snake Glow */}
                <div className="relative group rounded-xl">
                  {/* Subtle pulsing glow underneath instead of spinning which kills CPU */}
                  <div className={cn(
                    "absolute -inset-[1px] rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-300 opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-300",
                    isLoading && "animate-pulse opacity-100 from-emerald-400 to-teal-400"
                  )} />

                  <Button
                    disabled={(message.length === 0 && !selectedFile) || isLoading}
                    onClick={handleSummarize}
                    className={cn(
                      "relative z-10 flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all w-full",
                      (message.length > 0 || selectedFile) && !isLoading
                        ? "bg-neutral-900 text-white hover:bg-neutral-800 border border-emerald-500/50 group-hover:border-emerald-400 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]"
                        : "bg-neutral-900 border border-white/5 text-neutral-500 cursor-not-allowed"
                    )}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" /> : <Wand2 className="w-4 h-4 text-emerald-400" />}
                    <span>{isLoading ? "Summarizing..." : "Summarize"}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Output Box (Only mounts when started) */}
          {hasStarted && (
              <div className="flex flex-col h-full matrix-box rounded-2xl overflow-hidden animate-in fade-in slide-in-from-right-10 duration-500 backdrop-blur-sm">
                <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-500/20 bg-emerald-950/20">
                <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  <span>{isLoading ? "Generating Summary..." : "AI Summary Result"}</span>
                </div>
                {summary && !isLoading && (
                  <Button onClick={handleExport} variant="ghost" size="icon" className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10 rounded-lg">
                    <Download className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="p-6 md:p-8 text-neutral-200 text-[15px] leading-relaxed flex-1 overflow-y-auto custom-scrollbar">
                {isLoading && !summary ? (
                  <div className="flex flex-col gap-4 animate-pulse opacity-60">
                    <div className="h-3 bg-emerald-500/30 rounded w-3/4"></div>
                    <div className="h-3 bg-emerald-500/30 rounded w-full"></div>
                    <div className="h-3 bg-emerald-500/30 rounded w-5/6"></div>
                    <div className="h-3 bg-emerald-500/30 rounded w-full"></div>
                    <div className="h-3 bg-emerald-500/30 rounded w-4/5 pt-4 mt-4"></div>
                  </div>
                ) : (
                  <div className="prose prose-invert prose-emerald max-w-none 
                    prose-p:leading-relaxed prose-pre:bg-neutral-900/50 
                    prose-strong:text-emerald-400 prose-strong:font-bold 
                    prose-ul:list-disc prose-ul:pl-4 prose-ol:list-decimal prose-ol:pl-4
                    prose-li:marker:text-emerald-500/50">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          )}
          
        </div>
        
        {/* Quick Actions (Centered at bottom when not started) */}
      </div>
    </div>
  );
}

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function QuickAction({ icon, label, onClick }: QuickActionProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border-white/10 bg-black/40 text-neutral-300 hover:text-white hover:bg-white/10 transition-colors shadow-sm backdrop-blur-sm"
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </Button>
  );
}
