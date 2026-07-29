"use client";

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, Loader2 } from "lucide-react";
import { downloadCallRecording, RECORDING_KIND_LABELS, type RecordingKind } from "@/lib/api";

interface Props {
  tenantId: string;
  callId: string;
  filenamePrefix: string;
  hasVideo?: boolean;
}

const DEFAULT_KINDS: RecordingKind[] = ["mono-recording", "stereo-recording", "customer-recording", "assistant-recording", "call-logs"];

export function RecordingDownloadMenu({ tenantId, callId, filenamePrefix, hasVideo }: Props) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState<RecordingKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const kinds = hasVideo ? [...DEFAULT_KINDS, "video-recording" as RecordingKind] : DEFAULT_KINDS;

  async function handleDownload(kind: RecordingKind) {
    setDownloading(kind);
    setError(null);
    try {
      await downloadCallRecording(tenantId, callId, kind, filenamePrefix);
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || "Download failed.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        <Download className="w-3.5 h-3.5" /> Download <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1">
          {kinds.map((kind) => (
            <button
              key={kind}
              onClick={() => handleDownload(kind)}
              disabled={downloading !== null}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {RECORDING_KIND_LABELS[kind]}
              {downloading === kind && <Loader2 className="w-3 h-3 animate-spin" />}
            </button>
          ))}
          {error && <p className="px-3 py-1.5 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
