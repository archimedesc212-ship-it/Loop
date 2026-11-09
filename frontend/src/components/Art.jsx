// Generated artwork. Album covers are drawn from the two colours stored on the
// album row; MUSE World visuals from the world's palette, motif and seed.
// Nothing here is copied artwork.
import { hash } from '../lib/format';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Album cover: two stored colours + a pattern chosen deterministically from the id. */
export function Cover({ colors = ['#2A3150', '#F2B544'], seed = 1, size, className = '', title }) {
  const [c1, c2] = colors;
  const r = rng(hash(`cover:${seed}`));
  const kind = Math.floor(r() * 4);
  const id = `g${hash(`${seed}${c1}${c2}`)}`;
  let shapes;
  if (kind === 0) {       // concentric arcs
    shapes = [0, 1, 2, 3, 4].map((i) => <circle key={i} cx={20 + r() * 60} cy={95} r={18 + i * 15} fill="none" stroke={c2} strokeOpacity={0.55 - i * 0.08} strokeWidth={5 - i * 0.6} />);
  } else if (kind === 1) { // horizon bands
    shapes = [0, 1, 2, 3].map((i) => <rect key={i} x="0" y={52 + i * 12} width="100" height={7 - i} fill={c2} fillOpacity={0.75 - i * 0.15} />);
    shapes.push(<circle key="s" cx={30 + r() * 40} cy={40} r={14} fill={c2} />);
  } else if (kind === 2) { // waves
    shapes = [0, 1, 2, 3, 4].map((i) => {
      const y = 30 + i * 13; const a = 5 + r() * 6;
      return <path key={i} d={`M0 ${y} C 25 ${y - a}, 50 ${y + a}, 75 ${y} S 100 ${y - a}, 110 ${y}`} fill="none" stroke={c2} strokeOpacity={0.85 - i * 0.14} strokeWidth="3" />;
    });
  } else {                // offset circles
    shapes = [<circle key="a" cx={38} cy={44} r={26} fill={c2} fillOpacity="0.9" />, <circle key="b" cx={62 + r() * 10} cy={62} r={22} fill="none" stroke={c2} strokeWidth="3" strokeOpacity="0.7" />];
  }
  return (
    <div className={`cover ${className}`} style={size ? { width: size, height: size } : undefined} role={title ? 'img' : undefined} aria-label={title}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c1} stopOpacity="0.72" /></linearGradient></defs>
        <rect width="100" height="100" fill={`url(#${id})`} />
        {shapes}
      </svg>
    </div>
  );
}

/** The generative MUSE World visual. motif: ORBITS WAVES PEAKS RAIN SUNBURST GRID STARS EMBERS */
export function WorldArt({ theme, className = '', animate = true }) {
  const palette = (theme && theme.palette) || ['#171C2E', '#2A3150', '#F2B544'];
  const motif = (theme && theme.motif) || 'ORBITS';
  const r = rng(theme && theme.seed ? theme.seed : 7);
  const [bg, mid, hi, a4 = hi, a5 = mid] = palette;
  const W = 800; const H = 420;
  const id = `w${hash(`${motif}${palette.join('')}${theme && theme.seed}`)}`;
  const els = [];
  if (motif === 'ORBITS') {
    const cx = W * (0.62 + r() * 0.2); const cy = H * 0.55;
    for (let i = 0; i < 9; i++) els.push(<ellipse key={i} cx={cx} cy={cy} rx={60 + i * 48} ry={(60 + i * 48) * 0.42} fill="none" stroke={i % 3 ? mid : hi} strokeOpacity={0.55 - i * 0.04} strokeWidth={i % 3 ? 1.2 : 2} transform={`rotate(${-18 + r() * 8} ${cx} ${cy})`} />);
    for (let i = 0; i < 7; i++) { const t = r() * Math.PI * 2; const k = 60 + Math.floor(r() * 8) * 48; els.push(<circle key={`p${i}`} cx={cx + Math.cos(t) * k} cy={cy + Math.sin(t) * k * 0.42} r={3 + r() * 6} fill={i % 2 ? hi : a4} className={animate ? 'pulse' : ''} />); }
  } else if (motif === 'WAVES' || motif === 'RAIN') {
    for (let i = 0; i < 14; i++) {
      const y = 70 + i * 26; const a = 10 + r() * 24; const ph = r() * 200;
      els.push(<path key={i} d={`M-20 ${y} C ${120 + ph} ${y - a}, ${280 + ph} ${y + a}, ${420 + ph} ${y} S ${720} ${y - a}, ${W + 40} ${y + 6}`} fill="none" stroke={i % 4 === 0 ? hi : mid} strokeOpacity={0.25 + (i % 4 === 0 ? 0.45 : 0.2)} strokeWidth={i % 4 === 0 ? 2.2 : 1.2} />);
    }
    if (motif === 'RAIN') for (let i = 0; i < 70; i++) { const x = r() * W; const y = r() * H; els.push(<line key={`d${i}`} x1={x} y1={y} x2={x - 6} y2={y + 18} stroke={a4} strokeOpacity={0.35 + r() * 0.4} strokeWidth="1.4" />); }
  } else if (motif === 'PEAKS') {
    for (let l = 0; l < 4; l++) {
      let d = `M0 ${H}`; const base = H * (0.45 + l * 0.12);
      for (let x = 0; x <= W; x += 80) d += ` L${x} ${base - r() * (110 - l * 18)}`;
      d += ` L${W} ${H} Z`;
      els.push(<path key={l} d={d} fill={[mid, a5, hi, bg][l]} fillOpacity={0.35 + l * 0.15} />);
    }
    els.push(<circle key="sun" cx={W * 0.7} cy={H * 0.28} r={34} fill={hi} />);
  } else if (motif === 'SUNBURST') {
    const cx = W * 0.72; const cy = H * 0.62;
    for (let i = 0; i < 36; i++) { const t = (i / 36) * Math.PI * 2; els.push(<line key={i} x1={cx} y1={cy} x2={cx + Math.cos(t) * 520} y2={cy + Math.sin(t) * 520} stroke={i % 2 ? hi : a4} strokeOpacity={i % 2 ? 0.35 : 0.18} strokeWidth={i % 3 ? 2 : 6} />); }
    els.push(<circle key="c" cx={cx} cy={cy} r={70} fill={hi} />, <circle key="c2" cx={cx} cy={cy} r={110} fill="none" stroke={hi} strokeOpacity="0.4" strokeWidth="2" />);
  } else if (motif === 'GRID') {
    for (let i = -10; i < 20; i++) els.push(<line key={`v${i}`} x1={W / 2 + i * 70} y1={H * 0.5} x2={W / 2 + i * 260} y2={H + 40} stroke={hi} strokeOpacity="0.35" />);
    for (let j = 0; j < 9; j++) { const y = H * 0.5 + (j * j) * 3.4; els.push(<line key={`h${j}`} x1="0" y1={y} x2={W} y2={y} stroke={mid} strokeOpacity={0.3 + j * 0.05} />); }
    els.push(<circle key="sun" cx={W * 0.68} cy={H * 0.44} r={80} fill={a4} fillOpacity="0.9" />);
    for (let k = 0; k < 6; k++) els.push(<rect key={`b${k}`} x={W * 0.68 - 82} y={H * 0.44 + k * 12} width="164" height={3 + k} fill={bg} />);
  } else if (motif === 'STARS') {
    for (let i = 0; i < 160; i++) els.push(<circle key={i} cx={r() * W} cy={r() * H} r={r() < 0.92 ? 0.6 + r() * 1.2 : 2 + r() * 2} fill={r() < 0.8 ? '#ECE8DF' : hi} fillOpacity={0.3 + r() * 0.7} className={animate && i % 9 === 0 ? 'twinkle' : ''} />);
    els.push(<path key="m" d={`M ${W * 0.74} ${H * 0.18} a 46 46 0 1 0 40 70 a 38 38 0 1 1 -40 -70`} fill={hi} />);
  } else {                 // EMBERS
    for (let i = 0; i < 90; i++) { const x = r() * W; const y = H * 0.3 + r() * H * 0.8; els.push(<circle key={i} cx={x} cy={y} r={1 + r() * 4} fill={r() < 0.5 ? hi : a4} fillOpacity={0.25 + r() * 0.7} className={animate && i % 7 === 0 ? 'rise' : ''} />); }
  }
  return (
    <svg className={className} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="72%" cy="40%" r="85%">
          <stop offset="0" stopColor={mid} stopOpacity="0.95" />
          <stop offset="1" stopColor={bg} />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#${id})`} />
      {els}
    </svg>
  );
}
