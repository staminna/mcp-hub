import { useCallback, useEffect, useState } from "react";
import { useToast } from "./toast.tsx";

/** Load data once on mount (and on reload()); errors become a toast. */
export function useApi<T>(load: () => Promise<T>, errorTitle: string, deps: unknown[] = []) {
  const toast = useToast();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    return load()
      .then(setData)
      .catch((err: Error) => {
        setError(err.message);
        toast.error(errorTitle, err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    setData(null);
    reload();
  }, [reload]);

  return { data, setData, error, reload };
}
