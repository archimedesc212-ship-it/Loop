import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useApi(() => api.something(args), [deps])
 * -> { data, error, loading, reload, setData }
 * Ignores responses from superseded calls so fast navigation never shows stale data.
 */
export function useApi(fn, deps = [], { skip = false } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: !skip });
  const callId = useRef(0);
  const run = useCallback(async () => {
    const id = ++callId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      if (id === callId.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === callId.current) setState({ data: null, error, loading: false });
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { if (!skip) run(); }, [run, skip]);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: run, setData };
}
