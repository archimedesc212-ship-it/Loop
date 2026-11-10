/** Volume multiplier for a final fade-out window before a sleep timer stops playback. */
export function sleepFadeFactor(secondsRemaining, totalSeconds, fadeSeconds = 30) {
  const remaining = Math.max(0, Number(secondsRemaining) || 0);
  const total = Math.max(0, Number(totalSeconds) || 0);
  const fadeWindow = Math.min(Math.max(0, Number(fadeSeconds) || 0), total);
  if (remaining <= 0) return 0;
  if (fadeWindow === 0 || remaining > fadeWindow) return 1;
  return Math.min(1, Math.max(0, remaining / fadeWindow));
}

export function formatSleepRemaining(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${minutes}:${String(secs).padStart(2, '0')}`;
}
