const STORAGE_KEY = 'loop.musicProviders.v1';

function browserStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; }
  catch { return null; }
}

export function getMusicProviderSettings() {
  const storage = browserStorage();
  if (!storage) return { youtubeApiKey: '' };
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    return { youtubeApiKey: typeof saved.youtubeApiKey === 'string' ? saved.youtubeApiKey : '' };
  } catch {
    return { youtubeApiKey: '' };
  }
}

export function saveMusicProviderSettings(patch = {}) {
  const storage = browserStorage();
  const current = getMusicProviderSettings();
  const next = {
    youtubeApiKey: typeof patch.youtubeApiKey === 'string'
      ? patch.youtubeApiKey.trim()
      : current.youtubeApiKey,
  };
  if (!storage) throw new Error('Browser storage is unavailable.');
  storage.setItem(STORAGE_KEY, JSON.stringify(next));
  try { window.dispatchEvent(new CustomEvent('loop:provider-settings-changed', { detail: next })); } catch { /* event is a convenience only */ }
  return next;
}

export function getYouTubeApiKey() {
  // The browser key is a public credential. Restrict it to YouTube Data API v3
  // and the deployed site's HTTP referrers in Google Cloud Console.
  return getMusicProviderSettings().youtubeApiKey || import.meta.env?.VITE_YOUTUBE_API_KEY || '';
}
