import { useSyncExternalStore } from 'react';
const query = '(max-width: 767px)';
function subscribe(change: () => void) {
  const match = window.matchMedia(query);
  match.addEventListener('change', change);
  return () => match.removeEventListener('change', change);
}
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
