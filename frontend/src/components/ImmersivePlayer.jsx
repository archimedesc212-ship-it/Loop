import { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../hooks/usePlayer';
import * as Icon from './Icons';

function VisualizerCanvas({ audioElement, active }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    let frame = 0;
    let raf = 0;
    let analyser = null;
    let source = null;
    let audioContext = null;
    let data = null;

    // Only analyse same-origin LOOP audio. External embeds/previews are isolated
    // by browser security and must never be intercepted or muted.
    try {
      if (audioElement?.src && new URL(audioElement.src, window.location.href).origin === window.location.origin) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioContext = new AudioContextClass();
          source = audioContext.createMediaElementSource(audioElement);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.84;
          source.connect(analyser);
          analyser.connect(audioContext.destination);
          data = new Uint8Array(analyser.frequencyBinCount);
          if (active && audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        }
      }
    } catch {
      // A media element can only be attached to one AudioContext. Keep the
      // visual treatment graceful when another player already owns the source.
    }

    const draw = () => {
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      if (analyser && data && active) analyser.getByteFrequencyData(data);
      const count = 64;
      const gap = Math.max(3, width / 180);
      const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
      for (let i = 0; i < count; i += 1) {
        const measured = analyser && data ? data[Math.floor(i * data.length / count)] / 255 : 0;
        const ambient = 0.08 + (Math.sin(frame * 0.018 + i * 0.28) + 1) * 0.035;
        const amplitude = active ? Math.max(ambient, measured) : 0.035;
        const barHeight = Math.max(3, amplitude * height * 0.72);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;
        const gradient = context.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, 'rgba(130, 240, 180, 0.78)');
        gradient.addColorStop(1, 'rgba(30, 215, 96, 0.12)');
        context.fillStyle = gradient;
        context.beginPath();
        context.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        context.fill();
      }
      frame += 1;
      raf = window.requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.cancelAnimationFrame(raf);
      try { source?.disconnect(); analyser?.disconnect(); } catch {}
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    };
  }, [audioElement, active]);
  return <canvas ref={canvasRef} className="loop-visualizer-canvas" aria-hidden="true" />;
}

export default function ImmersivePlayer({ open, onClose }) {
  const player = usePlayer();
  const [artworkVisible, setArtworkVisible] = useState(true);
  const [annotationsVisible, setAnnotationsVisible] = useState(true);
  const current = player.current;
  const artwork = current?.artworkUrl || player.media?.artworkUrl;
  const annotations = useMemo(() => {
    if (Array.isArray(current?.annotations)) return current.annotations;
    if (typeof current?.annotation === 'string' && current.annotation.trim()) return [current.annotation];
    return [];
  }, [current]);
  const lyrics = Array.isArray(current?.lyrics) ? current.lyrics : [];

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

  if (!open || !current) return null;
  const external = player.externalPlayback;
  return (
    <section className={`loop-immersive-player${artworkVisible ? ' artwork-on' : ' visualizer-only'}`} role="dialog" aria-modal="true" aria-label="Immersive music player">
      {artworkVisible && artwork && <div className="loop-immersive-art" style={{ backgroundImage: `url("${artwork}")` }} />}
      <div className="loop-immersive-shade" />
      <div className="loop-immersive-visualizer"><VisualizerCanvas audioElement={player.audioElement} active={player.status === 'playing'} /></div>
      <header className="loop-immersive-top">
        <div><span className="loop-immersive-kicker">NOW PLAYING</span><div className="loop-immersive-provider">{player.media?.label || 'LOOP MUSIC'}</div></div>
        <button className="icon-btn loop-immersive-close" onClick={onClose} aria-label="Close immersive player"><Icon.X /></button>
      </header>
      <div className="loop-immersive-content">
        <div className="loop-immersive-track">
          {artworkVisible && artwork && <img src={artwork} alt="" className="loop-immersive-cover" />}
          <div className="loop-immersive-track-copy">
            <h1>{current.title}</h1>
            <p>{current.artist?.name || 'Unknown artist'}{current.album?.title ? ` · ${current.album.title}` : ''}</p>
          </div>
        </div>
        <div className="loop-immersive-lower">
          <div className="loop-immersive-controls">
            <div className="loop-immersive-buttons">
              <button className="icon-btn" onClick={player.prev} aria-label="Previous track"><Icon.Prev /></button>
              {!external && <button className="play-btn" onClick={player.toggle} aria-label={player.status === 'playing' ? 'Pause' : 'Play'}>{player.status === 'playing' ? <Icon.Pause /> : <Icon.Play />}</button>}
              <button className="icon-btn" onClick={player.next} aria-label="Next track"><Icon.Next /></button>
            </div>
            {!external && <div className="loop-immersive-progress">
              <span>{Math.floor(player.position / 60)}:{String(Math.floor(player.position % 60)).padStart(2, '0')}</span>
              <input type="range" min="0" max={Math.max(1, Math.floor(player.length))} value={Math.round(player.position)} onChange={(event) => player.seek(Number(event.target.value))} aria-label="Seek song" />
              <span>{Math.floor(player.length / 60)}:{String(Math.floor(player.length % 60)).padStart(2, '0')}</span>
            </div>}
            <div className="loop-immersive-toggles">
              <button className={artworkVisible ? 'active' : ''} onClick={() => setArtworkVisible((value) => !value)}>{artworkVisible ? 'Hide artwork' : 'Show artwork'}</button>
              <button className={annotationsVisible ? 'active' : ''} onClick={() => setAnnotationsVisible((value) => !value)}>{annotationsVisible ? 'Hide annotations' : 'Show annotations'}</button>
            </div>
          </div>
          {annotationsVisible && <aside className="loop-annotation-panel" aria-live="polite">
            <div className="loop-annotation-heading"><span>LYRICS & ANNOTATIONS</span><span className="loop-annotation-dot" /></div>
            {annotations.length > 0 ? annotations.map((note, index) => <p key={index} className="loop-annotation-item">{typeof note === 'string' ? note : note.text || note.content || 'Annotation'}</p>) : lyrics.length > 0 ? lyrics.map((line, index) => <p key={index} className="loop-annotation-item">{typeof line === 'string' ? line : line.text || line.lyric || ''}</p>) : <p className="loop-annotation-empty">Annotations for this track will appear here when verified track notes are available. They stay in this same panel in both background modes.</p>}
          </aside>}
        </div>
      </div>
      {external && <p className="loop-immersive-provider-note">This provider controls its own playback. Audio visualisation is available only when LOOP has direct access to the audio stream.</p>}
    </section>
  );
}
