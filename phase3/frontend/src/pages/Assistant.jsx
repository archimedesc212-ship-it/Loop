import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { RecHeader, RecList, Interpretation } from '../components/Rec';
import * as Icon from '../components/Icons';

const STARTERS = [
  { label: 'Focus for deep work', prompt: 'Calm, focused instrumental music for deep work' },
  { label: 'Lift my mood', prompt: 'Uplifting energetic songs to improve my mood' },
  { label: 'Late-night drive', prompt: 'Dreamy, atmospheric music for a late-night drive' },
  { label: 'Hindi romance', prompt: 'Romantic Hindi songs with a mellow sound' },
  { label: 'Workout energy', prompt: 'Intense high-energy music for a workout' },
  { label: 'Soft unwind', prompt: 'Peaceful acoustic music to unwind before sleep' },
];

function Message({ item, onSuggestion }) {
  return (
    <article className={`assistant-message ${item.role}`}>
      <div className="assistant-avatar" aria-hidden="true">{item.role === 'user' ? 'Y' : <Icon.BrandMark />}</div>
      <div className="assistant-message-body">
        <div className="assistant-message-label">{item.role === 'user' ? 'You' : 'LOOP'}</div>
        {item.text && <p className="assistant-message-text">{item.text}</p>}
        {item.error && (
          <div className="assistant-error" role="status">
            <p>{item.error}</p>
            {item.suggestions?.length > 0 && <div className="row wrap">{item.suggestions.map((suggestion) => <button type="button" className="chip assistant-suggestion" key={suggestion} onClick={() => onSuggestion(suggestion)}>{suggestion}</button>)}</div>}
            <Link className="small link" to="/mood">Open full mood discovery</Link>
          </div>
        )}
        {item.result && (
          <div className="assistant-result stack">
            <RecHeader list={item.result} kicker="YOUR PERSONAL MIX" />
            <Interpretation list={item.result} />
            <RecList list={item.result} />
          </div>
        )}
      </div>
    </article>
  );
}

export default function Assistant() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([]);
  const [notice, setNotice] = useState('');
  const endRef = useRef(null);
  const displayName = useMemo(() => user?.displayName?.split(' ')[0] || 'there', [user]);

  const send = async (value = prompt) => {
    const text = String(value || '').trim();
    if (text.length < 2 || busy) return;
    setMessages((previous) => [...previous, { id: `${Date.now()}-u`, role: 'user', text }]);
    setPrompt('');
    setBusy(true);
    setNotice('');
    try {
      const result = await api.recMood({ moodIds: [], text, limit: 20 });
      const count = result?.songs?.length || 0;
      setMessages((previous) => [...previous, {
        id: `${Date.now()}-a`, role: 'assistant',
        text: count ? `I found ${count} tracks from LOOP’s catalogue that match your request. Here’s your mix:` : 'I could not find a close match in the current catalogue. Try a mood or a slightly different description.',
        result: count ? result : null,
      }]);
    } catch (error) {
      setMessages((previous) => [...previous, {
        id: `${Date.now()}-e`, role: 'assistant',
        error: error?.message || 'I could not create a mix right now. Please try again.',
        suggestions: error?.details?.suggestions || ['Calm music for studying', 'Energetic music for a workout'],
      }]);
      setNotice('Your request did not complete. You can edit it and try again.');
    } finally {
      setBusy(false);
      window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
    }
  };

  const reset = () => { setMessages([]); setPrompt(''); setNotice(''); };
  const onSubmit = (event) => { event.preventDefault(); send(); };

  return (
    <div className={`assistant-page${messages.length ? ' has-messages' : ''}`}>
      <div className="assistant-head">
        <div className="assistant-head-copy">
          <div className="assistant-eyebrow"><Icon.Spark /> LOOP MUSIC ASSISTANT</div>
          <h1>{messages.length ? 'Your music conversation' : `What are we listening to, ${displayName}?`}</h1>
          <p>Describe a mood, moment, genre or activity. LOOP will turn it into a personalised music mix.</p>
        </div>
        <div className="assistant-head-actions">
          {messages.length > 0 && <button type="button" className="btn ghost sm" onClick={reset} disabled={busy}><Icon.Plus /> New chat</button>}
          <Link to="/search" className="btn ghost sm"><Icon.Search /> Search music</Link>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="assistant-empty">
          <div className="assistant-orb"><Icon.BrandMark /></div>
          <div className="assistant-empty-title">Find the sound for your moment.</div>
          <p className="assistant-empty-copy">Ask for a feeling, a situation, or the kind of energy you want. You can be specific or keep it simple.</p>
          <div className="assistant-starters">
            {STARTERS.map((item) => <button type="button" className="assistant-starter" key={item.label} onClick={() => send(item.prompt)}><span>{item.label}</span><Icon.Arrow /></button>)}
          </div>
        </div>
      ) : (
        <div className="assistant-conversation" aria-live="polite">
          {messages.map((item) => <Message key={item.id} item={item} onSuggestion={send} />)}
          {busy && <div className="assistant-thinking"><span className="assistant-dots"><i /><i /><i /></span><span>Finding your sound…</span></div>}
          <div ref={endRef} />
        </div>
      )}

      <div className="assistant-composer-wrap">
        {notice && <p className="assistant-notice" role="status">{notice}</p>}
        <form className="assistant-composer" onSubmit={onSubmit}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
          }} placeholder="Describe what you want to hear…" aria-label="Describe the music you want" rows={2} maxLength={280} disabled={busy} />
          <div className="assistant-composer-footer">
            <span className="assistant-composer-hint">LOOP uses its mood-aware recommendation engine · Enter to send</span>
            <button className="assistant-send" type="submit" disabled={busy || prompt.trim().length < 2} aria-label="Send music request">{busy ? <Icon.Refresh /> : <Icon.Arrow />}</button>
          </div>
        </form>
        <p className="assistant-disclaimer">Recommendations come from LOOP’s available catalogue. Results and playback depend on catalogue and provider availability.</p>
      </div>
    </div>
  );
}
