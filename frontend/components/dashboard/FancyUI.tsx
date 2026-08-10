"use client";

import { useRef, useEffect, useState, type ReactNode } from "react";

export function SpotlightCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  return (
    <div ref={ref} onMouseMove={handleMouseMove} className={`spotlight-card ${className}`}>
      {children}
    </div>
  );
}

export function CountUp({ value, duration = 900, className = "" }: { value: number; duration?: number; className?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{display}</span>;
}

export function BorderBeamCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="border-beam-wrap">
      <div className={`border-beam-inner ${className}`}>{children}</div>
    </div>
  );
}

export function AuroraBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
      <div className="aurora-blob-1 absolute -top-24 -left-16 w-72 h-72 rounded-full bg-gradient-to-br from-indigo-400/40 to-purple-400/20 blur-3xl" />
      <div className="aurora-blob-2 absolute -bottom-24 -right-16 w-72 h-72 rounded-full bg-gradient-to-br from-pink-400/30 to-indigo-400/20 blur-3xl" />
    </div>
  );
}
