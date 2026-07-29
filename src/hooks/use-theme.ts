import { useCallback, useEffect, useState } from "react";
import {
  applyTheme,
  cycleTheme,
  readStoredTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const pref = readStoredTheme();
    setPreference(pref);
    setResolved(applyTheme(pref));
    setReady(true);

    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystem = () => {
      const current = readStoredTheme();
      if (current === "system") {
        setResolved(applyTheme("system"));
      }
    };
    mq.addEventListener("change", onSystem);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = readStoredTheme();
      setPreference(next);
      setResolved(applyTheme(next));
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mq.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((pref: ThemePreference) => {
    setPreference(pref);
    setResolved(applyTheme(pref));
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      /* ignore */
    }
  }, []);

  const cycle = useCallback(() => {
    setTheme(cycleTheme(preference));
  }, [preference, setTheme]);

  return {
    preference,
    resolved: ready ? resolved : resolveTheme(preference),
    ready,
    setTheme,
    cycle,
  };
}
