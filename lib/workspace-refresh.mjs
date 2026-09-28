// Refresh only an open, visible workspace. Reads never submit queued work.
export function startWorkspaceRefresh({
  refresh,
  document,
  window,
  intervalMs = 30_000,
}) {
  let stopped = false;
  let reading = false;
  const check = async () => {
    if (
      stopped ||
      reading ||
      document.visibilityState !== 'visible' ||
      window.navigator.onLine === false
    )
      return;
    reading = true;
    try {
      await refresh();
    } catch {
      /* The workspace loader reports failures without discarding drafts. */
    } finally {
      reading = false;
    }
  };
  const timer = window.setInterval(check, intervalMs);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  window.addEventListener('focus', check);
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('online', check);
    window.removeEventListener('focus', check);
  };
}
