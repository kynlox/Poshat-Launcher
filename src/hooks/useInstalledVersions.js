import { useCallback, useEffect, useRef, useState } from "react";

export function useInstalledVersions(pollMs = 0) {
  const [set, setSet] = useState(() => new Set());
  const fetching = useRef(false);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const api = window.poshatAPI;
    if (!api || !api.versions || !api.versions.installed) {
      if (mounted.current) setSet(new Set());
      fetching.current = false;
      return;
    }
    try {
      const list = await api.versions.installed();
      if (mounted.current) setSet(new Set(Array.isArray(list) ? list : []));
    } catch {
      if (mounted.current) setSet(new Set());
    }
    fetching.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    if (pollMs > 0) {
      const t = setInterval(refresh, pollMs);
      return () => {
        clearInterval(t);
        mounted.current = false;
      };
    }
    return () => { mounted.current = false; };
  }, [refresh, pollMs]);

  return { installed: set, refresh };
}
