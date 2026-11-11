// Online state: the browser's own signal plus whether the last API call reached
// the server. Drives the offline banner.
import { useEffect, useState } from 'react';
import { setNetworkHandler } from '../services/api';

export function useOnline() {
  const [browserOnline, setBrowserOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  const [serverReachable, setServerReachable] = useState(true);
  useEffect(() => {
    const on = () => setBrowserOnline(true);
    const off = () => setBrowserOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setNetworkHandler(setServerReachable);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); setNetworkHandler(() => {}); };
  }, []);
  return { online: browserOnline && serverReachable, browserOnline, serverReachable };
}
