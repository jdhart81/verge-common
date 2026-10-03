// Pure budget arithmetic, safe to import without loading server commands.
import { DomainError } from './domain-error.mjs';
const fail = (message) => {
  throw new DomainError(message);
};
const integer = (v, max = 1e12) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > max)
    fail(`Enter a whole number between 0 and ${max}.`);
  return v;
};
export function allocateCents(total, members, stewardshipBps, treasuryBps) {
  integer(total);
  integer(stewardshipBps, 10000);
  integer(treasuryBps, 10000);
  if (stewardshipBps + treasuryBps > 10000)
    fail('Co-op budgets cannot exceed 100%.');
  if (
    !members.length ||
    new Set(members.map((m) => m.id)).size !== members.length
  )
    fail('Use unique member IDs.');
  if (members.reduce((s, m) => s + integer(m.shareBps, 10000), 0) !== 10000)
    fail('Member shares must total 100%.');
  const gross = BigInt(total),
    base = 10000n;
  const stewardship = Number((gross * BigInt(stewardshipBps)) / base),
    treasury = Number((gross * BigInt(treasuryBps)) / base),
    pool = total - stewardship - treasury;
  const rows = members.map((m) => ({
    id: m.id,
    name: m.name,
    cents: Number((BigInt(pool) * BigInt(m.shareBps)) / base),
    r: (BigInt(pool) * BigInt(m.shareBps)) % base,
  }));
  rows.sort((a, b) =>
    a.r === b.r ? (a.id < b.id ? -1 : 1) : a.r > b.r ? -1 : 1,
  );
  let left = pool - rows.reduce((s, m) => s + m.cents, 0);
  for (const m of rows) {
    if (left > 0) {
      m.cents++;
      left--;
    }
  }
  return {
    grossCents: total,
    stewardshipCents: stewardship,
    treasuryCents: treasury,
    memberPoolCents: pool,
    platformCutCents: 0,
    members: rows.map(({ r: _r, ...m }) => m),
  };
}
