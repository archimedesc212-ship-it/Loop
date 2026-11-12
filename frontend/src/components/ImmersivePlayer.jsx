import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import { api } from '../services/api';
import { getAccentTheme } from '../lib/theme';
import { EMPTY_LYRICS, normalizeLyricsPayload } from '../lib/lyrics';
import * as Icon from './Icons';
import { Cover } from './Art';

const audioGraphs = new WeakMap();

function VisualizerCanvas({ audioElement, active, enabled, palette = [] }) {
  const canvasRef = useRef(null);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    let raf = 0;
    let analyser = null;
    let audioContext = null;
    let frequency = null;
    let waveform = null;
    let attached = false;
    try {
      const src = audioElement?.currentSrc || audioElement?.src;
      const sameOrigin = !!src && new URL(src, window.location.href).origin === window.location.origin;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (sameOrigin && AudioContextClass) {
        let graph = audioGraphs.get(audioElement);
        if (!graph) {
          audioContext = new AudioContextClass();
          const source = audioContext.createMediaElementSource(audioElement);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.86;
          source.connect(analyser);
          analyser.connect(audioContext.destination);
          graph = { audioContext, analyser };
          audioGraphs.set(audioElement, graph);
        } else ({ audioContext, analyser } = graph);
        frequency = new Uint8Array(analyser.frequencyBinCount);
        waveform = new Uint8Array(analyser.fftSize);
        attached = true;
      }
    } catch { /* CORS or an existing media-element graph prevents safe analysis. */ }
    setAvailable(attached);
    let tick = 0;
    const draw = () => {
      const w = canvas.clientWidth || 1;
      const h = canvas.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, w, h);
      if (enabled && analyser && frequency && waveform && active) {
        if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
        analyser.getByteFrequencyData(frequency);
        analyser.getByteTimeDomainData(waveform);
        const bass = frequency.slice(0, 12).reduce((a, b) => a + b, 0) / (12 * 255);
        const mid = frequency.slice(12, 72).reduce((a, b) => a + b, 0) / (60 * 255);
        const treble = frequency.slice(72, 180).reduce((a, b) => a + b, 0) / (108 * 255);
        const centerY = h * 0.5;
        const colors = palette.length ? palette : ['#73beff', '#ca94ff', '#ffbe87'];
        const gradient = context.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, colors[0]);
        gradient.addColorStop(.5, colors[1] || colors[0]);
        gradient.addColorStop(1, colors[2] || colors[0]);
        context.globalAlpha = .28 + mid * .48;
        context.lineWidth = 2 + bass * 3;
        context.strokeStyle = gradient;
        context.shadowBlur = 16 + bass * 24;
        context.shadowColor = 'rgba(170,170,255,.45)';
        context.beginPath();
        for (let i = 0; i < waveform.length; i += 1) {
          const x = (i / (waveform.length - 1)) * w;
          const y = centerY + ((waveform[i] - 128) / 128) * h * (.12 + mid * .24);
          if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
        context.globalAlpha = 1;
        context.shadowBlur = 0;
        const bars = 72;
        const gap = Math.max(2, w / 300);
        const bw = Math.max(1, (w - gap * (bars - 1)) / bars);
        for (let i = 0; i < bars; i += 1) {
          const value = frequency[Math.floor(i * frequency.length / bars)] / 255;
          const bh = Math.max(2, value * h * .24);
          context.globalAlpha = .12 + value * .42;
          context.fillStyle = colors[1] || colors[0];
          context.beginPath();
          context.roundRect(i * (bw + gap), centerY - bh / 2, bw, bh, bw);
          context.fill();
        }
        context.globalAlpha = 1;
        // Low-density drifting particles whose size and speed follow measured bass.
        for (let i = 0; i < 18; i += 1) {
          const x = ((i * 83 + tick * (.12 + bass * .6)) % (w + 20)) - 10;
          const y = h * (.18 + ((i * 37) % 64) / 100);
          context.beginPath();
          context.fillStyle = colors[2] || colors[0];
          context.globalAlpha = .08 + treble * .18;
          context.arc(x, y, 1 + bass * 2, 0, Math.PI * 2);
          context.fill();
        }
        context.globalAlpha = 1;
      }
      tick += 1;
      if (enabled) raf = window.requestAnimationFrame(draw);
    };
    if (enabled) draw();
    return () => window.cancelAnimationFrame(raf);
  }, [audioElement, active, enabled]);
  return <><canvas ref={canvasRef} className="loop-visualizer-canvas" aria-hidden="true" />{enabled && !available && <span className="loop-visualizer-unavailable">Live audio analysis is unavailable for this provider. YouTube and cross-origin embeds do not expose audio samples to LOOP.</span>}</>;
}

function clock(seconds) {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

export default function ImmersivePlayer({ open, onClose }) {
  const player = usePlayer();
  const [artworkVisible, setArtworkVisible] = useState(true);
  const [visualizerEnabled, setVisualizerEnabled] = useState(true);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const [lyricsData, setLyricsData] = useState(() => normalizeLyricsPayload(EMPTY_LYRICS));
  const [selectedLine, setSelectedLine] = useState(null);
  const [annotationText, setAnnotationText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const current = player.current;
  const artwork = current?.artworkUrl || player.media?.artworkUrl;
  const palette = Array.isArray(current?.cover) ? current.cover.filter((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 3) : [getAccentTheme().color, '#BDA6FF', '#F8D5A8'];
  const activeLine = useMemo(() => {
    if (player.externalPlayback) return null;
    const ms = player.position * 1000;
    const lines = Array.isArray(lyricsData?.lines) ? lyricsData.lines : [];
    let found = null;
    for (const line of lines) {
      if (line.startMs <= ms) found = line;
      else break;
    }
    return found?.id ?? null;
  }, [lyricsData.lines, player.position, player.externalPlayback]);

  useEffect(() => {
    if (!open || !current?.id) return undefined;
    if (!/^\d+$/.test(String(current.id))) {
      setSelectedLine(null); setMessage(''); setLyricsData(normalizeLyricsPayload(EMPTY_LYRICS)); setNoteText('');
      return undefined;
    }
    let cancelled = false;
    setSelectedLine(null); setMessage('');
    setLyricsData(normalizeLyricsPayload(EMPTY_LYRICS));
    setNoteText('');
    api.lyrics(current.id).then((data) => {
      if (!cancelled) {
        const normalized = normalizeLyricsPayload(data);
        setLyricsData(normalized);
        setNoteText(normalized.note?.text || '');
      }
    }).catch((error) => {
      if (!cancelled) setMessage(error.message || 'Could not load saved lyrics.');
    });
    return () => { cancelled = true; };
  }, [open, current?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.classList.add('loop-immersive-open');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('loop-immersive-open');
    };
  }, [open, onClose]);

  const addAnnotation = async () => {
    if (!selectedLine || !annotationText.trim() || !current?.id || !canSaveSongData) return;
    setSaving(true);
    try {
      const result = await api.addLyricAnnotation(current.id, { lineId: selectedLine, text: annotationText.trim() });
      setLyricsData((old) => ({ ...old, lines: (Array.isArray(old.lines) ? old.lines : []).map((line) => line.id === selectedLine ? { ...line, annotations: [...(line.annotations || []), result] } : line) }));
      setAnnotationText(''); setMessage('Annotation saved privately.');
    } catch (error) { setMessage(error.message || 'Could not save annotation.'); }
    finally { setSaving(false); }
  };
  const toggleFavourite = async () => {
    if (!current?.id || !canSaveSongData) return;
    setSaving(true);
    try {
      await api.like(current.id, !lyricsData.favourite);
      setLyricsData((old) => ({ ...old, favourite: !old.favourite }));
      setMessage(lyricsData.favourite ? 'Removed from your favourites.' : 'Added to your favourites.');
    } catch (error) { setMessage(error.message || 'Could not update favourite.'); }
    finally { setSaving(false); }
  };
  const saveNote = async () => {
    if (!current?.id || !canSaveSongData) return;
    setSaving(true);
    try {
      const result = await api.saveSongNote(current.id, noteText);
      setLyricsData((old) => ({ ...old, note: result.note }));
      setMessage('Your listening note was saved.');
    } catch (error) { setMessage(error.message || 'Could not save note.'); }
    finally { setSaving(false); }
  };
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.querySelector('.loop-immersive-player')?.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch { setMessage('Fullscreen is not available in this browser.'); }
  };
  if (!open || !current) return null;
  const lyricLines = Array.isArray(lyricsData?.lines) ? lyricsData.lines : [];
  const selected = lyricLines.find((line) => line.id === selectedLine);
  const external = player.externalPlayback;
  const canSaveSongData = /^\d+$/.test(String(current?.id ?? ''));
  const youtubeSearchFallback = player.media?.type === 'YOUTUBE_SEARCH' && player.media?.watchUrl;
  return (
    <section className={`loop-immersive-player${artworkVisible && artwork ? ' artwork-on' : ' visualizer-only'}${visualizerEnabled ? ' visualizer-enabled' : ''}${external && player.media?.embedUrl ? ' has-youtube' : ''}`} role="dialog" aria-modal="true" aria-label="Immersive music player">
      {artworkVisible && artwork && <div className="loop-immersive-art" style={{ backgroundImage: `url("${artwork}")` }} />}
      <div className="loop-immersive-shade" />
      <div className="loop-immersive-visualizer"><VisualizerCanvas audioElement={player.audioElement} active={player.status === 'playing'} enabled={visualizerEnabled} palette={palette} /></div>
      <header className="loop-immersive-top">
        <div><span className="loop-immersive-kicker">NOW PLAYING</span><div className="loop-immersive-provider">{player.media?.label || 'LOOP MUSIC'}</div></div>
        <div className="loop-immersive-top-actions">
          <button className="loop-immersive-action" onClick={toggleFullscreen}>Fullscreen</button>
          <button className="icon-btn loop-immersive-close" onClick={onClose} aria-label="Close immersive player"><Icon.X /></button>
        </div>
      </header>
      <div className="loop-immersive-content">
        <div className="loop-immersive-stage">
          <div className="loop-immersive-artwork-wrap">
            {artworkVisible && (artwork
              ? <img src={artwork} alt={`${current.title} artwork`} className="loop-immersive-cover" />
              : <Cover colors={current.cover || palette} seed={Number(current.id) || 1} />)}
          </div>
          <div className="loop-immersive-track-copy">
            <span className="loop-immersive-album-label">PLAYING FROM LOOP</span>
            <h1>{current.title}</h1>
            <p>{current.artist?.name || 'Unknown artist'}{current.album?.title ? ` · ${current.album.title}` : ''}</p>
            <div className="loop-immersive-track-meta">
              <span>{player.media?.label || 'LOOP MUSIC'}</span>
              <span className={`loop-immersive-live-dot${player.status === 'playing' ? ' is-playing' : ''}`} />
              <span>{player.status === 'loading' ? 'Loading' : player.status === 'paused' ? 'Paused' : player.status === 'playing' ? 'Playing' : 'Ready'}</span>
            </div>
          </div>
        </div>
        {youtubeSearchFallback && <div className="loop-immersive-video-fallback">
          <p>We couldn't find an embeddable upload for this track.</p>
          <a href={player.media.watchUrl} target="_blank" rel="noreferrer">Find and play it on YouTube <Icon.Arrow /></a>
        </div>}
        <div className="loop-immersive-lower">
          <div className="loop-immersive-controls">
            {!external && <div className="loop-immersive-progress">
              <span>{clock(player.position)}</span>
              <input type="range" min="0" max={Math.max(1, Math.floor(player.length))} value={Math.min(Math.floor(player.length), Math.round(player.position))} onChange={(event) => player.seek(Number(event.target.value))} aria-label="Seek song" />
              <span>{clock(player.length)}</span>
            </div>}
            <div className="loop-immersive-buttons">
              <button className="icon-btn" onClick={player.setShuffle} aria-label="Toggle shuffle" aria-pressed={player.shuffle}>⇄</button>
              <button className="icon-btn" onClick={player.prev} aria-label="Previous track"><Icon.Prev /></button>
              <button className="play-btn" onClick={player.toggle} aria-label={player.status === 'playing' ? 'Pause' : 'Play'}>{player.status === 'playing' ? <Icon.Pause /> : <Icon.Play />}</button>
              <button className="icon-btn" onClick={player.next} aria-label="Next track"><Icon.Next /></button>
              <button className="icon-btn" onClick={player.setRepeat} aria-label="Toggle repeat" aria-pressed={player.repeat !== 'off'}>↻</button>
            </div>
            <div className="loop-immersive-toggles">
              <button className={lyricsData.favourite ? 'active' : ''} onClick={toggleFavourite} aria-pressed={lyricsData.favourite} disabled={!canSaveSongData} title={!canSaveSongData ? 'Favourites are available for LOOP catalogue songs' : undefined}>{lyricsData.favourite ? '♥ Favourited' : '♡ Favourite'}</button>
              <button className={artworkVisible ? 'active' : ''} onClick={() => setArtworkVisible((v) => !v)}>{artworkVisible ? 'Hide artwork' : 'Show artwork'}</button>
              <button className={visualizerEnabled ? 'active' : ''} onClick={() => setVisualizerEnabled((v) => !v)}>{visualizerEnabled ? 'Visualizer on' : 'Visualizer off'}</button>
              <button className={annotationsVisible ? 'active' : ''} onClick={() => setAnnotationsVisible((v) => !v)}>{annotationsVisible ? 'Hide lyrics' : 'Show lyrics'}</button>
            </div>
          </div>
          {annotationsVisible && <aside className="loop-annotation-panel" aria-label="Lyrics and annotations">
            <div className="loop-annotation-heading"><span>LYRICS & YOUR ANNOTATIONS</span><span className="loop-annotation-dot" /></div>
            {lyricsData.lyric && <p className="loop-lyric-source">Lyrics: {lyricsData.lyric.sourceLabel} · {lyricsData.lyric.sourceType === 'LICENSED' ? 'licensed' : 'user provided'}</p>}
            {lyricLines.length ? <div className="loop-lyrics-list">
              {lyricLines.map((line) => <div key={line.id} className={`loop-lyric-line${activeLine === line.id ? ' active' : ''}${selectedLine === line.id ? ' selected' : ''}`}>
                <button onClick={() => setSelectedLine(line.id)}>{line.text}</button>
                {line.annotations?.map((annotation) => <div className="loop-lyric-annotation" key={annotation.id}><span>{annotation.text}</span>{annotation.mine && <button onClick={async () => { try { await api.deleteLyricAnnotation(annotation.id); setLyricsData((old) => ({ ...old, lines: (Array.isArray(old.lines) ? old.lines : []).map((l) => l.id === line.id ? { ...l, annotations: (l.annotations || []).filter((a) => a.id !== annotation.id) } : l) })); } catch (e) { setMessage(e.message); } }}>Delete</button>}</div>)}
              </div>)}
            </div> : <p className="loop-annotation-empty">No licensed or user-provided lyrics are saved for this song yet. LOOP will not invent lyrics.</p>}
            {selected && canSaveSongData && <div className="loop-annotation-compose"><label htmlFor="loop-annotation-text">Add a private note to this lyric</label><textarea id="loop-annotation-text" value={annotationText} onChange={(e) => setAnnotationText(e.target.value)} maxLength={2000} placeholder="Meaning, context, slang, personal interpretation…" /><button disabled={saving || !annotationText.trim()} onClick={addAnnotation}>{saving ? 'Saving…' : 'Save annotation'}</button></div>}
            <div className="loop-note-compose"><label htmlFor="loop-song-note">Your song note</label><textarea id="loop-song-note" value={noteText} onChange={(e) => setNoteText(e.target.value)} maxLength={5000} placeholder={canSaveSongData ? 'Save what this song means to you…' : 'Private notes are available for LOOP catalogue songs.'} disabled={!canSaveSongData} /><button disabled={saving || !canSaveSongData} onClick={saveNote}>{saving ? 'Saving…' : 'Save note'}</button></div>
            {message && <p className="loop-player-message" role="status">{message}</p>}
          </aside>}
        </div>
      </div>
      {external && <p className="loop-immersive-provider-note">YouTube playback stays in its official embedded player above. LOOP cannot extract its audio or read its playback clock, so seek and live visualization are controlled by YouTube.</p>}
    </section>
  );
}
