export const accentThemes = [
  { id: 'green', label: 'LOOP Green', color: '#1ED760', rgb: '30, 215, 96' },
  { id: 'blue', label: 'Ocean Blue', color: '#429BFF', rgb: '66, 155, 255' },
  { id: 'red', label: 'Ruby Red', color: '#FF5268', rgb: '255, 82, 104' },
  { id: 'violet', label: 'Electric Violet', color: '#A78BFA', rgb: '167, 139, 250' },
  { id: 'pink', label: 'Hot Pink', color: '#F472B6', rgb: '244, 114, 182' },
  { id: 'orange', label: 'Sunset Orange', color: '#FB923C', rgb: '251, 146, 60' },
  { id: 'cyan', label: 'Arctic Cyan', color: '#22D3EE', rgb: '34, 211, 238' },
  { id: 'amber', label: 'Golden Amber', color: '#FBBF24', rgb: '251, 191, 36' },
];

const STORAGE_KEY = 'loop.accentTheme';
const fallback = accentThemes[0];

export function getAccentTheme() {
  try {
    const id = window.localStorage.getItem(STORAGE_KEY);
    return accentThemes.find((theme) => theme.id === id) || fallback;
  } catch {
    return fallback;
  }
}

export function applyAccentTheme(id) {
  const theme = accentThemes.find((item) => item.id === id) || fallback;
  const root = document.documentElement;
  root.style.setProperty('--accent', theme.color);
  root.style.setProperty('--accent-rgb', theme.rgb);
  root.style.setProperty('--accent-soft', `rgba(${theme.rgb}, .14)`);
  root.style.setProperty('--accent-soft-strong', `rgba(${theme.rgb}, .24)`);
  root.style.setProperty('--accent-ink', '#08090C');
  root.dataset.accentTheme = theme.id;
  try { window.localStorage.setItem(STORAGE_KEY, theme.id); } catch { /* private browsing storage can be unavailable */ }
  return theme;
}
