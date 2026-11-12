import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, isDemoMode } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { Field, PageHead } from '../components/ui';

export default function AuthPage({ mode = 'login' }) {
  const registering = mode === 'register';
  const { refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', email: '', displayName: '', login: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const change = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    if (registering && form.password !== form.confirm) {
      toast.error('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (registering) {
        await api.register({ username: form.username.toLowerCase(), email: form.email.trim().toLowerCase(),
          displayName: form.displayName.trim(), password: form.password });
      } else {
        await api.login({ login: form.login.trim(), password: form.password });
      }
      await refresh();
      toast.success(registering ? 'Your LOOP account is ready.' : 'Signed in to LOOP.');
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) { toast.error(error); } finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageHead kicker="Your music space" title={registering ? 'Create your LOOP account' : 'Welcome back'} />
      {isDemoMode ? (
        <section className="panel stack">
          <strong>Keep listening as a guest, or enable LOOP accounts</strong>
          <p className="small muted">This deployment is running in database-free mode. Guest listening, local favourites and playlists continue to work. Account sign-in and cross-device sync become available after connecting the LOOP API and database and setting <code>VITE_DEMO_MODE=false</code>.</p>
          <p className="small muted">When accounts are enabled, creating an account from this device upgrades the current guest profile so its server-side preferences, likes and playlists stay with the new account.</p>
          <Link className="btn primary" to="/">Continue as Guest</Link>
        </section>
      ) : (
        <form className="panel stack" onSubmit={submit}>
          {registering ? <>
            <Field label="Display name"><input className="input" required minLength={1} maxLength={60} autoComplete="name" value={form.displayName} onChange={(e) => change('displayName', e.target.value)} /></Field>
            <Field label="Username" hint="3–30 lowercase letters, numbers or underscores."><input className="input" required minLength={3} maxLength={30} pattern="[a-z0-9_]+" autoComplete="username" value={form.username} onChange={(e) => change('username', e.target.value.toLowerCase())} /></Field>
            <Field label="Email"><input className="input" required type="email" maxLength={120} autoComplete="email" value={form.email} onChange={(e) => change('email', e.target.value)} /></Field>
          </> : <Field label="Username or email"><input className="input" required minLength={3} maxLength={120} autoComplete="username" value={form.login} onChange={(e) => change('login', e.target.value)} /></Field>}
          <Field label="Password" hint={registering ? 'At least 8 characters, including a letter and a number.' : undefined}><input className="input" required type="password" minLength={registering ? 8 : 1} maxLength={72} autoComplete={registering ? 'new-password' : 'current-password'} value={form.password} onChange={(e) => change('password', e.target.value)} /></Field>
          {registering && <Field label="Confirm password"><input className="input" required type="password" minLength={8} maxLength={72} autoComplete="new-password" value={form.confirm} onChange={(e) => change('confirm', e.target.value)} /></Field>}
          <button className="btn primary" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}</button>
          <p className="small muted">{registering ? 'Already have an account?' : 'New to LOOP?'}{' '}
            <Link className="link" to={registering ? '/login' : '/register'}>{registering ? 'Sign in' : 'Create an account'}</Link>
          </p>
          {!registering && <p className="tiny muted">Want to keep this guest profile's preferences and playlists? Choose Create an account instead; signing in switches to your existing account.</p>}
          <p className="small"><Link className="link" to="/">← Keep listening as a guest</Link></p>
          <p className="tiny muted">LOOP stores passwords as bcrypt hashes and uses secure, HTTP-only session cookies. Never share your password with anyone.</p>
        </form>
      )}
    </div>
  );
}
