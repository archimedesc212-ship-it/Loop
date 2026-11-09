// Cinematic introduction, shown once per browser before sign-in (and on demand
// from Settings). About seven seconds; "Skip intro" is focused from the start and
// Escape / Enter skip too. With prefers-reduced-motion the animation is replaced
// by a single still frame and a Continue button.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark } from './Icons';

const KEY = 'muse.introSeen';
const LINES = ['Every mood has a sound.', 'Tell MUSE how you feel.', 'It finds the music — and tells you why.'];
const LINE_MS = 1700;

export function introSeen() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }   // no storage: do not nag
}
export function markIntroSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* storage unavailable */ } }
export function replayIntro() { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } }

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function Intro({ onDone }) {
  const [step, setStep] = useState(0);            // 0..LINES.length-1 lines, LINES.length = brand
  const [leaving, setLeaving] = useState(false);
  const skipRef = useRef(null);
  const still = reducedMotion();

  const finish = useCallback(() => {
    markIntroSeen();
    setLeaving(true);
    setTimeout(onDone, still ? 0 : 450);
  }, [onDone, still]);

  useEffect(() => { skipRef.current?.focus(); }, []);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); finish(); } };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [finish]);
  useEffect(() => {
    if (still) return undefined;
    if (step > LINES.length) { finish(); return undefined; }
    const t = setTimeout(() => setStep((s) => s + 1), step === LINES.length ? 2200 : LINE_MS);
    return () => clearTimeout(t);
  }, [step, still, finish]);

  return (
    <div className={`intro${leaving ? ' leaving' : ''}${still ? ' still' : ''}`} role="dialog" aria-modal="true" aria-label="MUSE introduction">
      <div className="intro-wave" aria-hidden="true">
        {Array.from({ length: 48 }).map((_, i) => <i key={i} style={{ '--i': i, '--h': `${18 + Math.round(70 * Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.11)))}%` }} />)}
      </div>
      <div className="intro-stage" aria-live="polite">
        {!still && step < LINES.length && <p key={step} className="intro-line display">{LINES[step]}</p>}
        {(still || step >= LINES.length) && (
          <div className="intro-brand">
            <BrandMark width={72} height={72} />
            <span className="display">MUSE</span>
            <p className="soft">Music Mood Intelligence</p>
          </div>
        )}
      </div>
      <button ref={skipRef} className="btn ghost sm intro-skip" onClick={finish}>{still ? 'Continue' : 'Skip intro'}</button>
    </div>
  );
}
