'use client';
import { useEffect, useState } from 'react';
import { Compass, Users, Smartphone } from 'lucide-react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function AppShell() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [offline, setOffline] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const sync = () => setInstalled(display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const connection = () => setOffline(!navigator.onLine);
    const available = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    sync(); connection();
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', complete);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    display.addEventListener('change', sync);
    if ('serviceWorker' in navigator && window.isSecureContext && !['localhost', '127.0.0.1'].includes(location.hostname)) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', complete);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      display.removeEventListener('change', sync);
    };
  }, []);
  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(choice.outcome === 'accepted' ? 'Installation requested. Follow your browser’s instructions.' : 'You can keep using Verge Common in your browser.');
    } catch { setMessage('Use your browser’s menu to install Verge Common.'); }
    setPrompt(null);
  }
  return <>
    {offline && <div className="connection-note" role="status">You’re offline. Reconnect before saving changes; unsent changes are not queued.</div>}
    {prompt && !installed && <aside className="install-note"><span>Keep your community close.</span><button onClick={install}>Install Verge Common</button><button aria-label="Dismiss install suggestion" onClick={() => setPrompt(null)}>Later</button></aside>}
    {message && <div className="connection-note" role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss installation message">×</button></div>}
    <nav className="mobile-app-nav" aria-label="App navigation">
      <a href="/network/"><Compass size={21} aria-hidden="true"/>Discover</a>
      <a href="/workspace/"><Users size={21} aria-hidden="true"/>My co-ops</a>
      <a href="/app/"><Smartphone size={21} aria-hidden="true"/>{installed ? 'App help' : 'Get the app'}</a>
    </nav>
  </>;
}
