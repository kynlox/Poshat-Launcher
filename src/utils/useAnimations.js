import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "poshat-animations";

function readEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "false") return false;
  } catch {}
  return true;
}

export function useAnimations() {
  const [enabled, setEnabledState] = useState(readEnabled);

  useEffect(() => {
    document.documentElement.dataset.animations = enabled ? "enabled" : "disabled";
  }, [enabled]);

  const setEnabled = useCallback((next) => {
    setEnabledState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      try { localStorage.setItem(STORAGE_KEY, String(value)); } catch {}
      return value;
    });
  }, []);

  const toggle = useCallback(() => setEnabled((v) => !v), [setEnabled]);

  return { enabled, setEnabled, toggle };
}
