import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../hooks/useToast';
import { Empty, ErrorState, PageHead, Skeleton } from '../components/ui';
import { diaryDateKey, moodCalendarDays, removeDiaryEntry, upsertDiaryEntry } from '../lib/moodDiary';

function readableDate(value) {
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return String(value);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MoodDiary() {
  const toast = useToast();
  const [days, setDays] = useState(365);
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [moodId, setMoodId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const moods = useApi(() => api.moods(), []);
  const entries = useApi(() => api.moodDiary(days, diaryDateKey()), [days]);
  const activity = useApi(() => api.calendarInsights(days), [days]);
  const todayKey = diaryDateKey();
  const calendarDays = moodCalendarDays(calendarMonth.getFullYear(), calendarMonth.getMonth(), activity.data?.daily || []);
  const monthLabel = calendarMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const todayEntry = (entries.data || []).find((entry) => entry.checkinDate === todayKey) || null;

  useEffect(() => {
    setMoodId(todayEntry?.moodId ? String(todayEntry.moodId) : '');
    setNote(todayEntry?.note || '');
  }, [todayEntry?.entryId, todayEntry?.moodId, todayEntry?.note]);

  const save = async (event) => {
    event.preventDefault();
    if (!moodId && !note.trim()) { toast.error('Choose a mood or write a short note first.'); return; }
    setSaving(true);
    try {
      const body = { checkinDate: todayKey, ...(moodId ? { moodId: Number(moodId) } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
      const saved = await api.saveMoodDiaryToday(body);
      entries.setData((previous) => upsertDiaryEntry(previous, saved));
      toast.success('Today’s private check-in was saved.');
    } catch (error) { toast.error(error); }
    finally { setSaving(false); }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Delete the mood diary entry for ${readableDate(entry.checkinDate)}? This cannot be undone.`)) return;
    try {
      await api.deleteMoodDiaryEntry(entry.entryId);
      entries.setData((previous) => removeDiaryEntry(previous, entry.entryId));
      if (entry.checkinDate === todayKey) { setMoodId(''); setNote(''); }
      toast.success('Mood diary entry deleted.');
    } catch (error) { toast.error(error); }
  };

  return (
    <div className="page stack" style={{ '--gap': '20px', maxWidth: 920 }}>
      <PageHead kicker="PRIVATE BY DEFAULT" title="Mood Diary">
        <p className="soft small">A small, optional check-in about how you feel. Only your account can read these entries. LOOP does not use diary notes or check-ins to rank songs, infer health conditions, or train recommendation models.</p>
      </PageHead>

      <section className="card stack" style={{ '--gap': '14px' }}>
        <div className="row between wrap">
          <div className="stack" style={{ '--gap': '3px' }}>
            <h2 className="section-title">Today’s check-in</h2>
            <p className="small muted">{readableDate(todayKey)} · one entry per day</p>
          </div>
          {todayEntry && <span className="chip">Saved today</span>}
        </div>
        {moods.loading ? <Skeleton h={44} /> : moods.error ? <ErrorState error={moods.error} onRetry={moods.reload} /> : (
          <form className="stack" style={{ '--gap': '12px' }} onSubmit={save}>
            <label className="field"><span>How would you describe your mood?</span>
              <select className="select" value={moodId} onChange={(event) => setMoodId(event.target.value)}>
                <option value="">No mood selected</option>
                {(moods.data || []).map((mood) => <option key={mood.id} value={mood.id}>{mood.emoji} {mood.name}</option>)}
              </select>
            </label>
            <label className="field"><span>A note for yourself <span className="muted">(optional, up to 500 characters)</span></span>
              <textarea className="input" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What would you like to remember about today?" />
              <small className="tiny muted">{note.length}/500</small>
            </label>
            <div className="row between wrap">
              <span className="tiny muted">Only you can view or delete this entry.</span>
              <button className="btn primary" type="submit" disabled={saving || moods.loading}>{saving ? 'Saving…' : todayEntry ? 'Update today’s check-in' : 'Save check-in'}</button>
            </div>
          </form>
        )}
      </section>

      <section className="panel stack" style={{ '--gap': '14px' }}>
        <div className="row between wrap">
          <div><h2 className="section-title">Mood and listening calendar</h2><p className="small muted">A month-at-a-glance view of your listening activity and check-ins.</p></div>
          <div className="row wrap" style={{ '--gap': '8px', alignItems: 'center' }}>
            <button className="btn ghost sm" type="button" onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} aria-label="Previous month">←</button>
            <b className="small" style={{ minWidth: 132, textAlign: 'center' }}>{monthLabel}</b>
            <button className="btn ghost sm" type="button" disabled={calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() === new Date().getMonth()} onClick={() => setCalendarMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} aria-label="Next month">→</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }} aria-label={`${monthLabel} mood calendar`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="tiny muted" style={{ textAlign: 'center', padding: '4px 0' }}>{day}</div>)}
          {calendarDays.map((cell) => (
            <div key={cell.dateKey} title={`${cell.dateKey}${cell.entry?.moodName ? ` · ${cell.entry.moodName}` : ''}${cell.plays ? ` · ${cell.plays} plays, ${cell.minutes} minutes` : ''}`}
              aria-label={`${cell.dateKey}${cell.entry?.moodName ? `, mood ${cell.entry.moodName}` : cell.entry?.hasNote ? ', private note saved' : ''}${cell.plays ? `, ${cell.plays} plays and ${cell.minutes} minutes listened` : ', no listening activity'}`}
              className="card stack" style={{ minHeight: 66, padding: 7, gap: 4, opacity: cell.inMonth ? 1 : 0.35, borderColor: cell.entry?.moodColor || undefined, background: cell.plays > 0 ? 'var(--accent-soft)' : cell.entry?.moodId || cell.entry?.hasNote ? 'var(--surface-2)' : undefined }}>
              <span className="tiny muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{cell.day}</span>
              {cell.entry?.moodEmoji && <b style={{ fontSize: 17, lineHeight: 1 }}>{cell.entry.moodEmoji}</b>}
              {cell.plays > 0 && <span className="tiny">{cell.plays} plays</span>}
              {cell.minutes > 0 && <span className="tiny muted">{cell.minutes}m</span>}
              {cell.entry?.hasNote && <span className="tiny muted">Note</span>}
              {!cell.plays && !cell.entry?.moodEmoji && !cell.entry?.hasNote && <span className="tiny muted">—</span>}
            </div>
          ))}
        </div>
        {activity.loading && <Skeleton h={36} />}
        {activity.error && <ErrorState error={activity.error} onRetry={activity.reload} />}
        <p className="tiny muted">The calendar combines your listening activity with optional self-reported diary moods. Blank days mean no activity was recorded; no mood is inferred. Listening dates follow the application database timezone.</p>
      </section>

      <section className="panel stack" style={{ '--gap': '14px' }}>
        <div className="row between wrap">
          <div><h2 className="section-title">Your recent entries</h2><p className="small muted">A private history of check-ins you chose to save.</p></div>
          <label className="row small muted" style={{ '--gap': '8px' }}>Show
            <select className="select" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Mood diary history range">
              <option value={30}>30 days</option><option value={90}>90 days</option><option value={180}>180 days</option><option value={365}>1 year</option>
            </select>
          </label>
        </div>
        {entries.loading && <div className="stack">{[1, 2, 3].map((item) => <Skeleton key={item} h={62} />)}</div>}
        {entries.error && <ErrorState error={entries.error} onRetry={entries.reload} />}
        {!entries.loading && entries.data && entries.data.length === 0 && <Empty title="No diary entries yet">Your check-ins are optional. Start with today’s entry above whenever it feels useful.</Empty>}
        {!entries.loading && entries.data?.length > 0 && (
          <div className="stack" style={{ '--gap': '8px' }}>
            {entries.data.map((entry) => (
              <article className="card row between wrap" key={entry.entryId} style={{ padding: 13, alignItems: 'flex-start' }}>
                <div className="stack" style={{ '--gap': '5px', minWidth: 0, flex: '1 1 260px' }}>
                  <div className="row wrap"><b>{readableDate(entry.checkinDate)}</b>{entry.moodName && <span className="chip" style={entry.moodColor ? { borderColor: entry.moodColor } : undefined}>{entry.moodEmoji} {entry.moodName}</span>}</div>
                  {entry.note && <p className="small soft" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{entry.note}</p>}
                </div>
                <button className="btn ghost sm" type="button" onClick={() => remove(entry)} aria-label={`Delete entry for ${entry.checkinDate}`}>Delete</button>
              </article>
            ))}
          </div>
        )}
      </section>
      <p className="tiny muted">You can also download your diary entries through <Link className="link" to="/settings">Settings → Personal data export</Link>. Deleting an entry removes it from LOOP’s account database.</p>
    </div>
  );
}
