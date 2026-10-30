import { updatesEnabled } from '@/lib/updates-config.mjs';

// Server component. Document navigation is required for the hosting gateway.
export function UpdatesLink() {
  if (!updatesEnabled()) return null;
  // eslint-disable-next-line next/no-html-link-for-pages -- This route is served by the gateway, outside the Next router.
  return <a href="/updates/">Get updates</a>;
}
