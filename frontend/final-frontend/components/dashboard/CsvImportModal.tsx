"use client";

import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { importContactsCsv, type ImportResult } from "@/lib/api-features";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";

interface Props {
  tenantId: string;
  onClose: () => void;
}

export function CsvImportModal({ tenantId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const importMut = useMutation({
    mutationFn: (f: File) => importContactsCsv(tenantId, f),
    onSuccess: (res) => {
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ["contacts", tenantId] });
    },
  });

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".csv")) {
      alert("Please upload a .csv file");
      return;
    }
    setFile(f);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Import Contacts
            </h3>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {!result ? (
            <>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                }`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                {file ? (
                  <p className="text-sm font-medium text-slate-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-slate-500">Drop a CSV file here or click to browse</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Headers: first_name, last_name, phone, email, company, source
                    </p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              <div className="flex gap-2 mt-4">
                <Button
                  className="flex-1"
                  disabled={!file || importMut.isPending}
                  onClick={() => file && importMut.mutate(file)}>
                  {importMut.isPending ? "Importing…" : "Import Contacts"}
                </Button>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">{result.created} contacts imported</span>
              </div>
              {result.duplicates > 0 && (
                <p className="text-sm text-amber-600">{result.duplicates} duplicates skipped</p>
              )}
              {result.errors.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-700 flex items-center gap-1.5 mb-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {result.errors.length} errors
                  </p>
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-24 overflow-y-auto">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
              <Button className="w-full" onClick={onClose}>Done</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
