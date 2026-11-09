// Small inline icon set (stroke icons, currentColor).
const I = ({ children, size, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    width={size} height={size} aria-hidden="true" {...p}>{children}</svg>
);

export const Home = (p) => <I {...p}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></I>;
export const Mood = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" /></I>;
export const Globe = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></I>;
export const Search = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>;
export const Library = (p) => <I {...p}><path d="M4 4v16M9 4v16M14 4l6 16" /></I>;
export const Chart = (p) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>;
export const Shield = (p) => <I {...p}><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" /></I>;
export const Play = (p) => <I {...p} fill="currentColor" stroke="none"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></I>;
export const Pause = (p) => <I {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></I>;
export const Next = (p) => <I {...p} fill="currentColor" stroke="none"><path d="M5 6.2v11.6a1 1 0 0 0 1.5.86L15 13.3V18h2V6h-2v4.7L6.5 5.34A1 1 0 0 0 5 6.2z" /></I>;
export const Prev = (p) => <I {...p} fill="currentColor" stroke="none"><path d="M19 6.2v11.6a1 1 0 0 1-1.5.86L9 13.3V18H7V6h2v4.7l8.5-5.36A1 1 0 0 1 19 6.2z" /></I>;
export const Heart = ({ filled, ...p }) => <I {...p} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></I>;
export const Plus = (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const Check = (p) => <I {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></I>;
export const X = (p) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>;
export const Info = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></I>;
export const Spark = (p) => <I {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></I>;
export const Eye = (p) => <I {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>;
export const EyeOff = (p) => <I {...p}><path d="M3 3l18 18M10.6 5.1A10.5 10.5 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.2C3.6 8 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 5.1-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2" /></I>;
export const Logout = (p) => <I {...p}><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4M14 12H4" /></I>;
export const Settings = (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></I>;
export const More = (p) => <I {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></I>;
export const Refresh = (p) => <I {...p}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></I>;
export const Undo = (p) => <I {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></I>;
export const Clock = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>;
export const Star = ({ filled, ...p }) => <I {...p} fill={filled ? 'currentColor' : 'none'}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></I>;
export const List = (p) => <I {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></I>;
export const Database = (p) => <I {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></I>;
export const Save = (p) => <I {...p}><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7M8 20v-6h8v6" /></I>;
export const Volume = (p) => <I {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></I>;
export const VolumeOff = (p) => <I {...p}><path d="M4 9v6h4l5 4V5L8 9z" /><path d="m17 9 5 5M22 9l-5 5" /></I>;
export const ThumbDown = (p) => <I {...p}><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H6.3a2 2 0 0 0-2 1.7l-1.3 8A2 2 0 0 0 5 14h5zM17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3" /></I>;
export const Film = (p) => <I {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></I>;
export const Wifi = (p) => <I {...p}><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" /></I>;
export const Arrow = (p) => <I {...p}><path d="M5 12h14M13 6l6 6-6 6" /></I>;

export const BrandMark = (p) => (
  <svg viewBox="0 0 64 64" aria-hidden="true" {...p}>
    <rect width="64" height="64" rx="16" fill="#1E2439" />
    <path d="M14 44V22l9 12 9-12 9 12 9-12v22" fill="none" stroke="#F2B544" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
