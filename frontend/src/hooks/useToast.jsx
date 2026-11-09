import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastCtx = createContext(null);
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message, kind = 'info', ms = 3600) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);
  const value = useMemo(() => ({
    info: (m) => push(m, 'info'),
    success: (m) => push(m, 'success'),
    error: (e) => push(typeof e === 'string' ? e : e?.message || 'Something went wrong.', 'error', 5200),
  }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
            <i className="dot" /><span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
