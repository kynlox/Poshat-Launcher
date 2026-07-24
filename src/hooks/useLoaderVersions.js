import { useEffect, useRef, useState } from "react";

export function useLoaderVersions(loader, mcVersion) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const epochRef = useRef(0);

  useEffect(() => {
    if (!loader || loader === "vanilla" || !mcVersion) {
      epochRef.current += 1;
      setData([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    const myEpoch = ++epochRef.current;
    setLoading(true);
    setError(null);

    const api = window.poshatAPI;
    if (!api || !api.loaders) {
      setData([]);
      setLoading(false);
      setError(null);
      return () => {};
    }

    api.loaders
      .list(loader, mcVersion)
      .then((list) => {
        if (epochRef.current !== myEpoch) return;
        setData(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch((err) => {
        if (epochRef.current !== myEpoch) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      // Сбрасываем эпоху — старый промис тихо умрёт без setState.
      epochRef.current += 1;
    };
  }, [loader, mcVersion]);

  return { data, loading, error };
}
