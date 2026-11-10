// Player state + the listening protocol:
//   play → POST /playback/start  (opens/extends a listening session, writes a play row)
//   pause/resume/seek → POST /playback/:id/events  (meaningful events only)
//   end / skip / next → POST /playback/:id/finish {listenedSec}
// The database derives completion %, completed/skipped and replay, then refreshes
// the listener's preferences in the same transaction. In a private session only
// /playback/private is called, which writes temporary memory and nothing else.
//
// Real app playback is selected by the server (backend mediaService):
//   USER_LOCAL / PREVIEW → a real <audio> element (time comes from the element)
//   GENERATED_SKETCH     → a clearly labelled demo sound sketch
// Catalogue-only tracks are resolved through the backend YouTube Data API.
// LOOP uses the official YouTube iframe and never extracts or re-hosts audio.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { createSketchPlayer } from '../lib/sketch';
import { sleepFadeFactor } from '../lib/sleepTimer';
import { useToast } from './useToast';
import { searchYouTubeBrowser } from '../lib/youtubeBrowser';

const PlayerCtx = createContext(null);
const SPEED_KEY = 'muse.demoSpeed';
const VOLUME_KEY = 'muse.volume';
const listeners = new Set();
export const onPlayFinished = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** A song can be started unless the API told us it has no playable source. */
export const isPlayable = (song) => !song || !song.playback || song.playback.playable !== false;

const stored = (k, d) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage unavailable */ } };

export function PlayerProvider({ children }) {
  const toast = useToast();
  const sketch = useRef(null);
  const audio = useRef(null);
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [status, setStatus] = useState('idle');          // idle | loading | playing | paused | external
  const [position, setPosition] = useState(0);
  const [media, setMedia] = useState(null);              // what is sounding: { type, label, demo, attribution, … }
  const [audioElement, setAudioElement] = useState(null);
  const [speed, setSpeedState] = useState(() => stored(SPEED_KEY, 1));
  const [volume, setVolumeState] = useState(() => Math.min(1, Math.max(0, stored(VOLUME_KEY, 0.8))));
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');
  const [lastResult, setLastResult] = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(null);
  const [sleepDuration, setSleepDuration] = useState(0);
  const [sleepEndAt, setSleepEndAt] = useState(null);
  const handle = useRef(null);                            // { playId, private, songId }
  const listened = useRef(0);
  const posRef = useRef(0);
  const statusRef = useRef('idle');
  const finishing = useRef(false);
  const volRef = useRef(volume);

  const current = index >= 0 ? queue[index] : null;
  const currentRef = useRef(null);
  currentRef.current = current;
  useEffect(() => { statusRef.current = status; }, [status]);

  if (!sketch.current) sketch.current = createSketchPlayer();

  const fadeFactor = sleepRemaining === null ? 1 : sleepFadeFactor(sleepRemaining, sleepDuration);
  const effectiveVolume = muted ? 0 : volume * fadeFactor;
  useEffect(() => {
    volRef.current = effectiveVolume;
    sketch.current.setVolume(effectiveVolume);
    if (audio.current) audio.current.volume = effectiveVolume;
  }, [effectiveVolume]);

  const stopAudio = useCallback(() => {
    sketch.current.stop();
    if (audio.current) { audio.current.pause(); audio.current.src = ''; audio.current = null; }
    setAudioElement(null);
  }, []);

  /** Report the current play to the API exactly once. */
  const finishCurrent = useCallback(async (reason) => {
    const h = handle.current;
    const song = currentRef.current;
    if (!h || !song || finishing.current) return null;
    finishing.current = true;
    handle.current = null;
    const listenedSec = Math.min(song.durationSec, Math.max(0, Math.round(listened.current)));
    try {
      const r = h.private
        ? await api.playPrivate({ songId: song.id, listenedSec })
        : await api.playFinish(h.playId, { listenedSec, positionSec: Math.min(song.durationSec, Math.round(posRef.current)) });
      const result = { ...r, song, reason, listenedSec };
      setLastResult(result);
      listeners.forEach((fn) => fn(result));
      return result;
    } catch (e) {
      if (e.code !== 'PLAY_FINISHED') toast.error(e);
      return null;
    } finally {
      finishing.current = false;
    }
  }, [toast]);

  const ctxRef = useRef({});
  const queueRef = useRef([]);
  queueRef.current = queue;

  /** Start song i of the queue; songs with no playable source are skipped (never faked). */
  const startAt = useCallback(async (i, q = queueRef.current, tried = 0) => {
    stopAudio();
    setMedia(null);
    if (i < 0 || i >= q.length || tried > q.length) { setStatus('idle'); setMedia(null); return; }
    const song = q[i];
    setIndex(i);
    setStatus('loading');
    listened.current = 0; posRef.current = 0; setPosition(0);
    if (!isPlayable(song)) { toast.info(`“${song.title}” has metadata only — skipped.`); await startAt(i + 1, q, tried + 1); return; }
    const ctx = ctxRef.current;
    try {
      // Official YouTube iframe playback; LOOP never extracts or proxies audio.
      if (song.playback?.type === 'YOUTUBE_EMBED' && song.youtube?.embedUrl) {
        handle.current = null;
        setMedia({ type: 'YOUTUBE_EMBED', label: 'YouTube embedded player', embedUrl: song.youtube.embedUrl, watchUrl: song.youtube.watchUrl, trackName: song.title, artistName: song.artist?.name });
        setStatus('playing');
        return;
      }
      // Resolve catalogue-only tracks through the server-side YouTube Data API.
      // The API key stays on the backend; playback uses YouTube's official iframe.
      if (song.playback?.type === 'YOUTUBE_LOOKUP') {
        const query = `${song.title} ${song.artist?.name || ''} official audio`;
        let videos = [];
        try {
          const result = await api.youtubeSearch(query, 5);
          videos = result?.videos || [];
        } catch { /* database-free Vercel uses the optional browser API key below */ }
        if (!videos.length) {
          try { videos = await searchYouTubeBrowser(query, 5); } catch (searchError) {
            console.warn('LOOP YouTube search fallback:', searchError);
          }
        }
        const video = videos.find((item) => item.embedUrl && item.embeddable !== false);
        if (!video) {
          setStatus('idle');
          setMedia({ type: 'YOUTUBE_SEARCH', label: 'YouTube search', watchUrl: song.recordingSearchUrl || `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, trackName: song.title, artistName: song.artist?.name || '' });
          toast.info(import.meta.env.VITE_YOUTUBE_API_KEY
            ? `No embeddable YouTube upload was found for “${song.title}”.`
            : 'Add VITE_YOUTUBE_API_KEY in Vercel to enable embedded song playback in database-free mode.');
          return;
        }
        handle.current = null;
        setMedia({ type: 'YOUTUBE_EMBED', label: 'YouTube player', embedUrl: video.embedUrl, watchUrl: video.sourceUrl, trackName: song.title, artistName: song.artist?.name || video.channel, thumbnailUrl: video.thumbnailUrl });
        setStatus('external');
        return;
      }
      const r = await api.playStart({ songId: song.id, origin: ctx.origin || 'HOME', batchId: ctx.batchId || undefined, contextCode: ctx.contextCode || undefined });
      handle.current = { playId: r.playId, private: r.private, songId: song.id };
      setMedia(r.media || null);
      if (r.media && r.media.uri) {
        const a = new Audio(r.media.uri);
        a.preload = 'auto';
        a.volume = volRef.current;
        let last = 0;
        a.addEventListener('timeupdate', () => {
          const t = a.currentTime;
          if (t > last && t - last < 2) listened.current += t - last;   // seeking is not listening
          last = t;
          posRef.current = t;
          setPosition(t);
        });
        a.addEventListener('ended', () => { document.dispatchEvent(new CustomEvent('muse:ended')); });
        a.addEventListener('error', () => toast.error({ message: 'This audio file could not be loaded.' }));
        audio.current = a;
          setAudioElement(a);
        await a.play();
      } else {
        const ok = await sketch.current.start(song);
        if (!ok) toast.info('This browser cannot synthesise the demo sketch; the play is still recorded.');
      }
      setStatus('playing');
      if (r.isReplay) toast.info('Replay — MUSE counts this as a strong signal.');
    } catch (e) {
      handle.current = null;
      if (e.code === 'NO_PLAYBACK_SOURCE' || e.code === 'NOT_PLAYABLE') {
        toast.info(`“${song.title}”: ${e.message}`);
        await startAt(i + 1, q, tried + 1);
        return;
      }
      setStatus('idle');
      toast.error(e);
    }
  }, [toast, stopAudio]);

  /** play(song, { queue, origin, batchId, contextCode }) */
  const play = useCallback(async (song, ctx = {}) => {
    // Finish the previous play in parallel. Do not await a network round-trip
    // before calling HTMLAudioElement.play(): browsers require a fresh click.
    const finishingTask = finishCurrent('switch');
    const q = ctx.queue && ctx.queue.length ? ctx.queue : [song];
    const i = Math.max(0, q.findIndex((s) => s.id === song.id));
    ctxRef.current = { origin: ctx.origin, batchId: ctx.batchId, contextCode: ctx.contextCode };
    setQueue(q);
    queueRef.current = q;
    await Promise.all([startAt(i, q), finishingTask]);
  }, [finishCurrent, startAt]);

  const goTo = useCallback(async (i, reason) => {
    await finishCurrent(reason);
    if (i < 0 || i >= queueRef.current.length) { stopAudio(); handle.current = null; setStatus('idle'); setMedia(null); return; }
    await startAt(i);
  }, [finishCurrent, startAt, stopAudio]);

  const seek = useCallback((sec) => {
    const song = currentRef.current;
    if (!song) return;
    const max = audio.current && Number.isFinite(audio.current.duration) ? audio.current.duration : song.durationSec;
    const to = Math.max(0, Math.min(max - 1, Math.round(sec)));
    const h = handle.current;
    if (h && !h.private) api.playEvent(h.playId, { type: 'SEEK', positionSec: Math.round(posRef.current), seekToSec: to }).catch(() => {});
    posRef.current = to; setPosition(to);
    if (audio.current) audio.current.currentTime = to;
  }, []);

  const next = useCallback(() => {
    if (repeat === 'one' && index >= 0) return goTo(index, 'repeat');
    if (shuffle && queueRef.current.length > 1) {
      const choices = queueRef.current.map((_, i) => i).filter((i) => i !== index);
      return goTo(choices[Math.floor(Math.random() * choices.length)], 'next');
    }
    return goTo(index + 1 < queueRef.current.length ? index + 1 : (repeat === 'all' ? 0 : queueRef.current.length), 'next');
  }, [goTo, index, repeat, shuffle]);
  const prev = useCallback(() => (posRef.current > 5 ? seek(0) : goTo(Math.max(0, index - 1), 'prev')), [goTo, index, seek]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'playing') return;
    if (media?.type === 'YOUTUBE_EMBED') {
      document.querySelector('.loop-immersive-youtube iframe, .youtube-inline-panel iframe')?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*');
    }
    sketch.current.pause(); if (audio.current) audio.current.pause();
    setStatus('paused');
    const h = handle.current;
    if (h && !h.private) api.playEvent(h.playId, { type: 'PAUSE', positionSec: Math.round(posRef.current) }).catch(() => {});
  }, [media]);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    if (media?.type === 'YOUTUBE_EMBED') {
      document.querySelector('.loop-immersive-youtube iframe, .youtube-inline-panel iframe')?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
    }
    sketch.current.resume(); if (audio.current) audio.current.play();
    setStatus('playing');
    const h = handle.current;
    if (h && !h.private) api.playEvent(h.playId, { type: 'RESUME', positionSec: Math.round(posRef.current) }).catch(() => {});
  }, [media]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause();
    else if (statusRef.current === 'paused') resume();
    else if (statusRef.current === 'idle' && index >= 0 && currentRef.current) startAt(index);
  }, [index, pause, resume, startAt]);
  const setSpeed = useCallback((s) => { setSpeedState(s); store(SPEED_KEY, s); }, []);
  const setVolume = useCallback((v) => { const x = Math.max(0, Math.min(1, v)); setVolumeState(x); setMuted(false); store(VOLUME_KEY, x); if (media?.type === 'YOUTUBE_EMBED') document.querySelector('.youtube-inline-panel iframe')?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [Math.round(x * 100)] }), '*'); }, [media]);
  const toggleMute = useCallback(() => { setMuted((m) => { const nextMuted = !m; if (media?.type === 'YOUTUBE_EMBED') document.querySelector('.youtube-inline-panel iframe')?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: nextMuted ? 'mute' : 'unMute', args: [] }), '*'); return nextMuted; }); }, [media]);
  const setSleepTimer = useCallback((minutes) => {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value < 1 || value > 180) return false;
    const seconds = Math.round(value * 60);
    setSleepDuration(seconds);
    setSleepEndAt(Date.now() + seconds * 1000);
    setSleepRemaining(seconds);
    return true;
  }, []);
  const cancelSleepTimer = useCallback(() => { setSleepRemaining(null); setSleepDuration(0); setSleepEndAt(null); }, []);
  const stopForSleep = useCallback(async () => {
    stopAudio();
    await finishCurrent('sleep_timer');
    setStatus('idle');
    setPosition(0);
    setMedia(null);
    setSleepRemaining(null);
    setSleepDuration(0);
    setSleepEndAt(null);
  }, [finishCurrent, stopAudio]);

  // The countdown runs while playing or paused; fade begins in the final 30 seconds.
  useEffect(() => {
    if (sleepRemaining === null) return undefined;
    if (sleepRemaining <= 0) { stopForSleep(); return undefined; }
    const id = setTimeout(() => {
      setSleepRemaining(sleepEndAt === null ? null : Math.max(0, Math.ceil((sleepEndAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearTimeout(id);
  }, [sleepRemaining, sleepEndAt, stopForSleep]);

  /** Queue editing: jump to, remove, or add after the current song. */
  const jumpTo = useCallback((i) => goTo(i, 'switch'), [goTo]);
  const removeAt = useCallback((i) => {
    if (i === index) return;
    setQueue((q) => q.filter((_, k) => k !== i));
    if (i < index) setIndex((x) => x - 1);
  }, [index]);
  const playNext = useCallback((song) => {
    if (!isPlayable(song)) { toast.info('This song has metadata only and cannot be queued.'); return; }
    if (index < 0) { play(song); return; }
    setQueue((q) => [...q.slice(0, index + 1), song, ...q.slice(index + 1)]);
    toast.success(`“${song.title}” plays next`);
  }, [index, play, toast]);

  // the song clock for the demo sketch: listened time accumulates only while playing
  // (real audio reports its own time through `timeupdate`)
  useEffect(() => {
    if (status !== 'playing' || audio.current) return undefined;
    const id = setInterval(() => {
      const song = currentRef.current;
      if (!song) return;
      const dt = 0.25 * speed;
      listened.current += dt;
      posRef.current = Math.min(song.durationSec, posRef.current + dt);
      setPosition(posRef.current);
      if (posRef.current >= song.durationSec) next();
    }, 250);
    return () => clearInterval(id);
  }, [status, speed, next]);

  // real audio reached its end (a 30-second preview ends before durationSec)
  useEffect(() => {
    const h = () => next();
    document.addEventListener('muse:ended', h);
    return () => document.removeEventListener('muse:ended', h);
  }, [next]);

  // report an unfinished play if the tab closes
  useEffect(() => {
    const h = () => { finishCurrent('unload'); };
    window.addEventListener('pagehide', h);
    return () => window.removeEventListener('pagehide', h);
  }, [finishCurrent]);

  /** Called on sign-out or when a private session starts/ends. */
  const reset = useCallback(async () => {
    await finishCurrent('reset');
    stopAudio(); setQueue([]); setIndex(-1); setStatus('idle'); setPosition(0); setMedia(null);
    setSleepRemaining(null); setSleepDuration(0); setSleepEndAt(null);
  }, [finishCurrent, stopAudio]);

  const length = audio.current && Number.isFinite(audio.current.duration) ? audio.current.duration : (current ? current.durationSec : 0);
  const value = useMemo(() => ({
    current, queue, index, status, position, length, speed, volume, muted, shuffle, repeat, media, audioElement, lastResult, sleepRemaining,
    play, pause, resume, toggle, next, prev, seek, setSpeed, setVolume, toggleMute, setShuffle: () => setShuffle((value) => !value), setRepeat: () => setRepeat((value) => value === 'off' ? 'all' : value === 'all' ? 'one' : 'off'), setSleepTimer, cancelSleepTimer, jumpTo, removeAt, playNext, reset,
    realAudio: !!(media && media.uri),
    externalPlayback: !!(media && media.type === 'YOUTUBE_EMBED' && media.embedUrl),
    isCurrent: (id) => current && current.id === id,
    isPlaying: (id) => current && current.id === id && status === 'playing',
  }), [current, queue, index, status, position, length, speed, volume, muted, media, audioElement, lastResult, shuffle, repeat, play, pause, resume, toggle, next, prev, seek, setSpeed, setVolume, toggleMute, setSleepTimer, cancelSleepTimer, jumpTo, removeAt, playNext, reset]);

  return <PlayerCtx.Provider value={value}>{children}</PlayerCtx.Provider>;
}

export const usePlayer = () => useContext(PlayerCtx);
