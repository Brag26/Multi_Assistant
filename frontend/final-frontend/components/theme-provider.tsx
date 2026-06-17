"use client";

// components/theme-provider.tsx — dark mode support using class strategy + localStorage avoided
// (uses cookie-free React state + system preference, persists via a simple data attribute)

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // Detect system preference on mount
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const stored = document.cookie.split("; ").find(c => c.startsWith("voiceops-theme="));
    const initial = stored ? (stored.split("=")[1] as Theme) : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.cookie = `voiceops-theme=${next}; path=/; max-age=31536000`;
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
