import { useCallback, useEffect, useState } from "react";

// Простой хук: возвращает Set id установленных версий.
// Не подписан на события — обновляем явно через refresh() (например, после
// успешной установки) или периодическим polling'ом — это дёшево, чтение FS.
export function useInstalledVersions(pollMs = 0) {
  const [set, setSet] = useState(() => new Set());

  const refresh = useCallback(async () => {
    const api = window.poshatAPI;
    if (!api || !api.versions || !api.versions.installed) {
      setSet(new Set());
      return;
    }
    try {
      const list = await api.versions.installed();
      setSet(new Set(Array.isArray(list) ? list : []));
    } catch {
      setSet(new Set());
    }
  }, []);

  useEffect(() => {
    refresh();
    if (pollMs > 0) {
      const t = setInterval(refresh, pollMs);
      return () => clearInterval(t);
    }
    return undefined;
  }, [refresh, pollMs]);

  return { installed: set, refresh };
}
