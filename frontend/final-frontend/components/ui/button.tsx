import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" };

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "default" && "bg-primary text-white hover:bg-blue-700",
        variant === "outline" && "border border-border bg-white hover:bg-slate-50",
        variant === "ghost" && "hover:bg-slate-100",
        className
      )}
      {...props}
    />
  );
}
