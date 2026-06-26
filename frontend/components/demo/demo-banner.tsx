"use client";

import { useDemo } from "@/components/demo/demo-context";
import { X, Zap } from "lucide-react";
import { useRouter } from "next/navigation";

export function DemoBanner() {
  const { isDemo, setIsDemo } = useDemo();
  const router = useRouter();

  if (!isDemo) return null;

  function exitDemo() {
    setIsDemo(false);
    router.push("/login");
  }

  return (
    <div className="w-full flex items-center justify-between gap-4 px-4 py-2 text-sm font-medium text-white"
      style={{ background: "linear-gradient(90deg, #7c3aed, #6366f1, #0ea5e9)" }}>
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 shrink-0" />
        <span>
          You&apos;re viewing a <strong>live demo</strong> — all data is sample data.
          Sign up to connect your real tools.
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => { setIsDemo(false); router.push("/login"); }}
          className="bg-white text-indigo-700 font-semibold text-xs px-3 py-1.5 rounded-full hover:bg-indigo-50 transition-colors">
          Sign up free
        </button>
        <button onClick={exitDemo}
          className="text-white/70 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
