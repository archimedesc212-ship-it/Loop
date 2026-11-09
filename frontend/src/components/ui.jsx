// Small shared building blocks: states, modal, chips, stats, meters.
import { Children, Fragment, cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { X } from './Icons';

export function Skeleton({ h = 16, w = '100%', r, style }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function ShelfSkeleton({ n = 6 }) {
  return (
    <div className="shelf">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="stack" style={{ '--gap': '10px', padding: 12 }}>
          <Skeleton h={160} r={12} /><Skeleton h={14} w="80%" /><Skeleton h={12} w="55%" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ n = 6 }) {
  return (
    <div className="stack" style={{ '--gap': '10px' }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="row" style={{ padding: '8px 10px' }}>
          <Skeleton h={48} w={48} r={8} /><div className="grow stack" style={{ '--gap': '6px' }}><Skeleton h={14} w="40%" /><Skeleton h={12} w="25%" /></div>
        </div>
      ))}
    </div>
  );
}

export function Thinking({ label = 'Scoring songs in MySQL' }) {
  return <div className="row soft small"><span className="thinking"><i /><i /><i /></span>{label}…</div>;
}

export function Empty({ title, children, action }) {
  return <div className="empty"><h3>{title}</h3>{children && <p className="small">{children}</p>}{action}</div>;
}

export function ErrorState({ error, onRetry }) {
  const offline = error && (error.code === 'NETWORK' || error.code === 'DATABASE_UNAVAILABLE');
  return (
    <div className="empty error-state" role="alert">
      <h3>{offline ? 'LOOP can’t reach its database' : 'This didn’t load'}</h3>
      <p className="small">{error ? error.message : 'Unknown error.'}</p>
      {onRetry && <button className="btn sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Modal({ title, onClose, children, width }) {
  const ref = useRef(null);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    // focus the first form field; fall back to the first button (e.g. Close)
    (ref.current?.querySelector('input,select,textarea') || ref.current?.querySelector('button'))?.focus();
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="row between" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: '1.15rem' }}>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const MoodChip = ({ name, color, emoji, weight }) => (
  <span className="chip mood" style={{ '--mood': color || '#8C92A8' }}>{emoji ? `${emoji} ` : ''}{name}{weight !== undefined && weight < 1 ? <span className="muted"> {Math.round(weight * 100)}%</span> : null}</span>
);

export function Stat({ label, value, foot, text }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value${text ? ' text' : ''}`}>{value ?? '–'}</div>
      {foot && <div className="foot">{foot}</div>}
    </div>
  );
}

export function Meter({ label, value, display, color }) {
  const v = Math.max(0, Math.min(1, Number(value) || 0));
  return (
    <div className="meter">
      <span className="soft">{label}</span>
      <div className="bar"><i style={{ width: `${v * 100}%`, background: color }} /></div>
      <span className="num small">{display ?? Math.round(v * 100)}</span>
    </div>
  );
}

/**
 * Label + control + hint/error. The label names the control; the hint or error is
 * linked with aria-describedby (so it is announced without becoming part of the name).
 */
export function Field({ label, error, children, hint }) {
  const id = useId();
  const noteId = `${id}-note`;
  const single = Children.count(children) === 1 && isValidElement(children) && children.type !== Fragment;
  if (!single) {
    return (
      <label className="field">
        <span>{label}</span>
        {children}
        {hint && !error && <small className="muted tiny">{hint}</small>}
        {error && <small className="field-error">{error}</small>}
      </label>
    );
  }
  const controlId = children.props.id || id;
  const control = cloneElement(children, {
    id: controlId,
    'aria-describedby': error || hint ? noteId : undefined,
    'aria-invalid': error ? true : undefined,
  });
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {control}
      {hint && !error && <small id={noteId} className="muted tiny">{hint}</small>}
      {error && <small id={noteId} className="field-error" role="alert">{error}</small>}
    </div>
  );
}

export function PageHead({ kicker, title, children, actions }) {
  return (
    <div className="row between wrap" style={{ marginBottom: 22, alignItems: 'flex-end' }}>
      <div className="stack" style={{ '--gap': '8px' }}>
        {kicker && <div className="soft small">{kicker}</div>}
        <h1 className="display">{title}</h1>
        {children}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}
