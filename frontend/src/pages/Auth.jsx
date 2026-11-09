import { useState } from 'react';
import Intro, { introSeen } from '../components/Intro';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { WorldArt } from '../components/Art';
import { BrandMark } from '../components/Icons';
import { Field } from '../components/ui';

const THEME = { palette: ['#0F1322', '#2B2A5C', '#F2B544', '#E86A92'], motif: 'ORBITS', seed: 4210 };

function Art() {
  return (
    <div className="auth-art">
      <WorldArt theme={THEME} className="motif" />
      <div style={{ position: 'relative' }}>
        <div className="row" style={{ marginBottom: 18 }}><BrandMark width={40} height={40} /><span className="display" style={{ fontSize: '1.8rem' }}>LOOP</span></div>
        <h1 className="display" style={{ fontSize: 'clamp(2rem, 4vw, 3.4rem)', maxWidth: '14ch' }}>Tell it how you feel. It finds the music.</h1>
        <p className="lead" style={{ marginTop: 14 }}>Mood-aware recommendations across Telugu, Tamil, Hindi and nine more languages — every pick explained.</p>
      </div>
    </div>
  );
}

function useIntro() {
  const loc = useLocation();
  const forced = new URLSearchParams(loc.search).get('intro') === '1';
  const [show, setShow] = useState(() => forced || !introSeen());
  return [show, () => setShow(false)];
}

export function Login() {
  const { user, signIn, sessionNote } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [intro, closeIntro] = useIntro();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (intro) return <Intro onDone={closeIntro} />;
  if (user) return <Navigate to={loc.state?.from || '/'} replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const u = await signIn(form.login.trim(), form.password);
      nav(u.onboarded ? loc.state?.from || '/' : '/welcome', { replace: true });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form onSubmit={submit} className="stack page" style={{ '--gap': '16px' }} noValidate>
          <div>
            <h2 className="section-title" style={{ fontSize: '1.9rem' }}>Welcome back</h2>
            <p className="soft small" style={{ marginTop: 4 }}>Sign in with your username or email.</p>
          </div>
          {(error || sessionNote) && <div className="empty error-state" role="alert" style={{ padding: 14 }}><p className="small">{error ? error.message : sessionNote}</p></div>}
          <Field label="Username or email"><input className="input" autoComplete="username" value={form.login} onChange={(e) => setForm({ ...form, login: e.target.value })} required /></Field>
          <Field label="Password"><input className="input" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
          <button className="btn primary" disabled={busy || !form.login || !form.password}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <div className="empty" role="note" style={{ padding: 14 }}>
            <p className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Demo account</p>
            <p className="small soft">Username: <strong>Varsha</strong></p>
            <p className="small soft">Password: <strong>Varsha@27</strong></p>
          </div>
          <p className="small soft">New to LOOP? <Link to="/register" className="link">Create an account</Link></p>
        </form>
      </div>
    </div>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ displayName: '', username: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={user.onboarded ? '/' : '/welcome'} replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'username' ? e.target.value.toLowerCase() : e.target.value });
  const fe = (k) => error && error.details && error.details[k] ? error.details[k] : null;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await register({ ...form, email: form.email.trim(), username: form.username.trim() }); nav('/welcome', { replace: true }); } catch (err) { setError(err); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <Art />
      <div className="auth-form">
        <form onSubmit={submit} className="stack page" style={{ '--gap': '14px' }} noValidate>
          <div>
            <h2 className="section-title" style={{ fontSize: '1.9rem' }}>Create your account</h2>
            <p className="soft small" style={{ marginTop: 4 }}>Next, a few quick questions so the first mix already sounds like you.</p>
          </div>
          {error && !error.details && <div className="empty error-state" role="alert" style={{ padding: 14 }}><p className="small">{error.message}</p></div>}
          <Field label="Your name" error={fe('displayName')}><input className="input" value={form.displayName} onChange={set('displayName')} autoComplete="name" /></Field>
          <Field label="Username" error={fe('username') || (error && error.code === 'USERNAME_TAKEN' ? error.message : null)} hint="Lowercase letters, digits and _ (3–30)">
            <input className="input" value={form.username} onChange={set('username')} autoComplete="username" />
          </Field>
          <Field label="Email" error={fe('email') || (error && error.code === 'EMAIL_TAKEN' ? error.message : null)}><input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></Field>
          <Field label="Password" error={fe('password')} hint="At least 8 characters with a letter and a number"><input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" /></Field>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
          <p className="small soft">Already have one? <Link to="/login" className="link">Sign in</Link></p>
        </form>
      </div>
    </div>
  );
}
