import * as React from "react";
import { cn } from "@/lib/utils";

/** Every Card in the app now has a subtle spotlight that follows the
 * cursor on hover — applied here once so every page that already uses
 * <Card> gets it automatically, no per-page changes needed. */
export function Card({ className, onMouseMove, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    onMouseMove?.(e);
  }
  return (
    <div
      className={cn("relative spotlight-card rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md", className)}
      onMouseMove={handleMouseMove}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative border-b border-border p-5", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative p-5", className)} {...props} />;
}
