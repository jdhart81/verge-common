// Privacy-preserving usage counts for the hosted MCP endpoint.
//
// Invariants (tests/mcp-stats.test.mjs checks each):
// - Only aggregate counts per UTC day are kept: requests, JSON-RPC methods,
//   tools/call per known tool, errors, rate-limited requests, and the
//   anonymous / token-bearing split.
// - Distinct clients are counted with a keyed hash of the network client key
//   under a random salt that exists only in memory and is replaced every UTC
//   day. Neither the salt, the hashes, the client key, an IP address, a token,
//   tool arguments nor tool results are ever written to disk or returned.
// - Only the aggregate counts are persisted, to one small JSON file written
//   atomically (temporary file, then rename). The last 90 days are kept.
// - A missing, unreadable or read-only data directory falls back to memory.
// - Recording never throws, so counting can never fail or change a request.
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const KEEP_DAYS = 90;
export const REPORT_DAYS = 30;
export const STATS_FILE = 'mcp-stats.json';
// Every tool the hosted server can register. Any other name a client sends is
// counted as "other", so client-chosen strings never reach the file.
export const KNOWN_TOOLS = Object.freeze([
  'vergecommon_capabilities',
  'list_public_coops',
  'get_public_coop',
  'example_pooling_draft',
  'prepare_pooling_draft',
  'list_my_workspaces',
  'get_private_workspace',
  'check_woodland_plan',
  'analyze_woodland_spine',
  'apply_coop_command',
]);
const METHODS = ['initialize', 'tools/list', 'tools/call'];
// Bounds memory if the endpoint is flooded; beyond this the count is a floor.
const MAX_DAILY_CLIENTS = 50_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const count = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

function emptyDay() {
  return {
    requests: 0,
    methods: { initialize: 0, 'tools/list': 0, 'tools/call': 0, other: 0 },
    tools: {},
    errors: 0,
    rate_limited: 0,
    anonymous: 0,
    token: 0,
    distinct_clients: 0,
  };
}

// Accept only the known shape from disk; anything else is dropped.
function cleanDay(value) {
  const day = emptyDay();
  if (!value || typeof value !== 'object') return day;
  for (const key of [
    'requests',
    'errors',
    'rate_limited',
    'anonymous',
    'token',
    'distinct_clients',
  ])
    day[key] = count(value[key]);
  for (const key of Object.keys(day.methods))
    day.methods[key] = count(value.methods?.[key]);
  for (const name of [...KNOWN_TOOLS, 'other']) {
    const n = count(value.tools?.[name]);
    if (n) day.tools[name] = n;
  }
  return day;
}

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function createMcpStats({
  file = null,
  now = Date.now,
  salt = () => randomBytes(32),
  flushDelayMs = 30_000,
  log = (message) => console.error(message),
} = {}) {
  const days = new Map();
  let persisted = false;
  let warned = false;
  let timer = null;
  // Today's salt and hashed clients live only here, never on disk.
  let today = null;
  let todaySalt = null;
  let todayClients = new Set();
  let todayBase = 0;

  const warnOnce = (message) => {
    if (warned) return;
    warned = true;
    try {
      log(message);
    } catch {
      // Logging is best effort.
    }
  };

  if (file) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved?.version === 1 && saved.days && typeof saved.days === 'object')
        for (const [key, value] of Object.entries(saved.days))
          if (DAY.test(key)) days.set(key, cleanDay(value));
    } catch (error) {
      // A missing file is a fresh start. Anything else (unreadable, corrupt)
      // starts from memory; the next successful write replaces the file.
      if (error?.code !== 'ENOENT')
        warnOnce('MCP usage counts could not be read; counting from zero.');
    }
  }

  const prune = (ms) => {
    const oldest = utcDay(ms - (KEEP_DAYS - 1) * DAY_MS);
    for (const key of days.keys()) if (key < oldest) days.delete(key);
  };

  const dayFor = (ms) => {
    const key = utcDay(ms);
    if (key !== today) {
      // A new UTC day: a fresh salt, and yesterday's hashes are dropped.
      today = key;
      todaySalt = salt();
      todayClients = new Set();
      todayBase = days.get(key)?.distinct_clients ?? 0;
      prune(ms);
    }
    if (!days.has(key)) days.set(key, emptyDay());
    return days.get(key);
  };

  const toFile = () => ({
    version: 1,
    note: 'Aggregate MCP request counts per UTC day. No addresses, tokens, client hashes, tool arguments or results.',
    days: Object.fromEntries([...days].sort(([a], [b]) => a.localeCompare(b))),
  });

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!file) return false;
    const temporary = `${String(file)}.${String(process.pid)}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(toFile())}\n`, {
        mode: 0o600,
      });
      renameSync(temporary, file);
      persisted = true;
      return true;
    } catch {
      try {
        rmSync(temporary, { force: true });
      } catch {
        // Nothing more to clean up.
      }
      persisted = false;
      warnOnce(
        'MCP usage counts cannot be saved to the data directory; keeping them in memory only.',
      );
      return false;
    }
  }

  const schedule = () => {
    if (!file || timer) return;
    timer = setTimeout(flush, flushDelayMs);
    timer.unref?.();
  };

  /**
   * Count one finished /mcp request. `client` is the rate-limit client key;
   * it is hashed in memory and discarded. Never throws.
   */
  function record({
    client,
    anonymous = false,
    method,
    tool,
    error = false,
    rateLimited = false,
  } = {}) {
    try {
      const day = dayFor(now());
      day.requests += 1;
      if (anonymous) day.anonymous += 1;
      else day.token += 1;
      const known = METHODS.includes(method) ? method : 'other';
      day.methods[known] += 1;
      if (known === 'tools/call') {
        const name = KNOWN_TOOLS.includes(tool) ? tool : 'other';
        day.tools[name] = (day.tools[name] ?? 0) + 1;
      }
      if (error) day.errors += 1;
      if (rateLimited) day.rate_limited += 1;
      if (client !== undefined && todayClients.size < MAX_DAILY_CLIENTS) {
        todayClients.add(
          createHmac('sha256', todaySalt)
            .update(String(client))
            .digest('base64url')
            .slice(0, 22),
        );
        day.distinct_clients = todayBase + todayClients.size;
      }
      schedule();
    } catch {
      // Counting must never affect a request.
    }
  }

  /** Counts only, for the most recent `limit` UTC days that have any. */
  function snapshot(limit = REPORT_DAYS) {
    const ms = now();
    const oldest = utcDay(ms - (limit - 1) * DAY_MS);
    const rows = [...days]
      .filter(([key]) => key >= oldest && key <= utcDay(ms))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        requests: d.requests,
        initialize: d.methods.initialize,
        tools_list: d.methods['tools/list'],
        tool_calls: { ...d.tools },
        other_methods: d.methods.other,
        errors: d.errors,
        rate_limited: d.rate_limited,
        anonymous: d.anonymous,
        token: d.token,
        distinct_clients: d.distinct_clients,
      }));
    return {
      service: 'vergecommon',
      endpoint: '/mcp',
      generated: new Date(ms).toISOString(),
      window_days: limit,
      persisted,
      days: rows,
      note: 'Aggregate counts per UTC day. other_methods includes requests refused before their method was read (for example rate limited). Distinct clients use a daily in-memory salt and can over-count after a restart. No addresses, tokens, tool arguments or results are kept.',
    };
  }

  // Write once at start so a read-only or missing directory is found (and
  // reported) before the first request, not after.
  if (file) flush();

  return {
    record,
    snapshot,
    flush,
    close: flush,
    get persisted() {
      return persisted;
    },
  };
}

/**
 * The hosted server's counter: on unless VERGE_MCP_STATS=0, persisted under
 * the data directory (the writable /data mount in the container).
 */
export function mcpStatsFromEnv({
  env = process.env,
  dataDir,
  ...options
} = {}) {
  if (env.VERGE_MCP_STATS === '0') return null;
  return createMcpStats({
    file: dataDir ? resolve(dataDir, STATS_FILE) : null,
    ...options,
  });
}
