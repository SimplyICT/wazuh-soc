import { useState, useEffect, useCallback } from 'react';

export function useApi(fetchFn, deps = [], refreshKey) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const execute = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchFn()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => { execute(); }, [execute, refreshKey]);

  return { data, loading, error, refetch: execute };
}
