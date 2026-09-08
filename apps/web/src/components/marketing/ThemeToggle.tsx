"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@callme/ui";

type Theme = "light" | "dark";

/**
 * Deliberately tiny — this is one of only two client components on the landing
 * page, and every kilobyte of JS here is paid for in Core Web Vitals on the
 * page we most want to rank.
 *
 * The initial theme is applied by a blocking inline script in the root layout,
 * so this only has to keep the toggle's own icon in sync after hydration.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem("callme-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      return;
    }
    setTheme(
      window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark",
    );
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("callme-theme", next);
    } catch {
      /* private browsing can refuse writes; the toggle still works this session */
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
