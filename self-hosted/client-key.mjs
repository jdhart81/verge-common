// Rate-limit identity for a network client.
//
// Invariant: every address a single ordinary subscriber can cheaply rotate
// through maps to ONE key. IPv4 hosts get their /32; IPv6 hosts get their /64
// (the standard end-site allocation), so rotating source addresses inside one
// prefix cannot mint fresh rate-limit buckets. IPv4-mapped IPv6 addresses are
// treated as the IPv4 address they carry.
function expandIpv6(address) {
  const [head, tail] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail !== undefined && tail !== '' ? tail.split(':') : [];
  if (tail === undefined) return left;
  return [
    ...left,
    ...Array(8 - left.length - right.length).fill('0'),
    ...right,
  ];
}

export function clientKey(value) {
  let address = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/%.*$/, '');
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) address = mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) return `v4:${address}`;
  if (!address.includes(':')) return `other:${address || 'unknown'}`;
  const groups = expandIpv6(address);
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g)))
    return `other:${address}`;
  return `v6:${groups
    .slice(0, 4)
    .map((g) => g.padStart(4, '0'))
    .join(':')}::/64`;
}

// Open redirects: after URL normalization a path beginning with // or /\ is
// protocol-relative in browsers, so it must never be used as a return target.
export function isSafeRelativePath(path) {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.startsWith('/\\')
  );
}
