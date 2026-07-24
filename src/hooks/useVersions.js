import { useCallback, useEffect, useRef, useState } from "react";

export function useVersions(filterTypes, order = "asc") {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // null/undefined = "не грузить" (модалка закрыта). Пустой массив = "все типы".
  const enabled = filterTypes !== null && filterTypes !== undefined;
  const filterKey = (filterTypes || []).slice().sort().join(",");

  // epoch для гонок: каждый новый запуск эффекта инвалидирует прошлые промисы.
  const epochRef = useRef(0);

  const load = useCallback(
    async ({ force = false } = {}) => {
      const myEpoch = ++epochRef.current;

      const api = window.poshatAPI;
      if (!api || !api.versions) {
        if (epochRef.current === myEpoch) {
          setData([]);
          setError(null);
          setLoading(false);
        }
        return;
      }

      if (force) setRefreshing(true);

      // list — единственный IPC-вызов. force=true просит main process обновить
      // манифест (фоновый таймер делает то же самое каждые 5 мин).
      try {
        const list = await api.versions.list({
          types: filterTypes,
          order,
          force: !!force,
        });
        if (epochRef.current !== myEpoch) return;
        setData(Array.isArray(list) ? list : []);
        setError(null);
      } catch (err) {
        if (epochRef.current !== myEpoch) return;
        setError(err);
        // data НЕ трогаем — оставляем последний успешный список.
      } finally {
        if (epochRef.current === myEpoch) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [filterKey, order]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      setData([]);
      return () => {};
    }

    setLoading(true);
    setError(null);
    load();

    return () => {
      epochRef.current += 1;
    };
  }, [load, enabled]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: () => load({ force: true }),
  };
}
