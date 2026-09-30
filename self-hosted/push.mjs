import webpush from 'web-push';
import { participationNotices } from '../lib/participation.mjs';
const invalid = () => {
  throw Object.assign(new Error('Use a supported browser push subscription.'), {
    status: 400,
  });
};
export function validateSubscription(value) {
  let u;
  try {
    u = new URL(value?.endpoint);
  } catch {
    invalid();
  }
  const host = u.hostname;
  if (
    u.protocol !== 'https:' ||
    u.port ||
    u.username ||
    u.password ||
    u.hash ||
    value.endpoint.length > 2000 ||
    !(
      host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      /^[a-z0-9-]+\.push\.apple\.com$/.test(host)
    )
  )
    invalid();
  if (
    !/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh ?? '') ||
    !/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth ?? '')
  )
    invalid();
  return {
    endpoint: u.href,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
  };
}
export function createPush(
  db,
  {
    origin,
    now = Date.now,
    send = webpush.sendNotification.bind(webpush),
  } = {},
) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_keys (id INTEGER PRIMARY KEY CHECK(id=1), public_key TEXT NOT NULL, private_key TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_subscriptions (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, subscription TEXT NOT NULL, mode TEXT NOT NULL, since INTEGER NOT NULL, seen TEXT NOT NULL DEFAULT '[]', last_sent INTEGER NOT NULL DEFAULT 0, last_attempt INTEGER NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', accepted INTEGER NOT NULL DEFAULT 0, checked_at INTEGER NOT NULL DEFAULT 0);`);
  const notices = (userId) =>
    db
      .prepare(
        "SELECT state_json FROM workspaces WHERE visibility != 'archived' AND EXISTS (SELECT 1 FROM json_each(state_json,'$.members') m WHERE json_extract(m.value,'$.userId')=?) LIMIT 100",
      )
      .all(userId)
      .flatMap((row) => {
        const s = JSON.parse(row.state_json);
        return participationNotices(s, userId, now()).map((n) => ({
          ...n,
          id: `${s.id}:${n.id}`,
        }));
      });
  const keys = () => {
    let row = db
      .prepare('SELECT public_key,private_key FROM push_keys WHERE id=1')
      .get();
    if (!row) {
      const k = webpush.generateVAPIDKeys();
      db.prepare('INSERT OR IGNORE INTO push_keys VALUES (1,?,?)').run(
        k.publicKey,
        k.privateKey,
      );
      row = db
        .prepare('SELECT public_key,private_key FROM push_keys WHERE id=1')
        .get();
    }
    return {
      publicKey: row.public_key,
      privateKey: row.private_key,
      subject: origin?.startsWith('https:') ? origin : 'https://vergecommon.com',
    };
  };
  const dispatch = async (row, test = false) => {
    // Recheck account existence and authorization immediately before every send.
    if (!db.prepare('SELECT id FROM users WHERE id=?').get(row.user_id)) return;
    const visible = notices(row.user_id),
      seen = new Set(JSON.parse(row.seen));
    const pending = visible.filter((n) => n.at >= row.since && !seen.has(n.id));
    if (
      !test &&
      (!pending.length ||
        now() - (row.last_sent || (row.mode === 'digest' ? row.since : 0)) <
          (row.mode === 'digest' ? 7 * 86400000 : 8 * 3600000) ||
        now() - row.last_attempt < 15 * 60000)
    )
      return;
    db.prepare(
      'UPDATE push_subscriptions SET last_attempt=? WHERE endpoint=? AND user_id=?',
    ).run(now(), row.endpoint, row.user_id);
    try {
      await send(
        JSON.parse(row.subscription),
        JSON.stringify({
          title: 'VergeCommon',
          body: test
            ? 'Your browser reminders are connected. Open VergeCommon to check your co-ops.'
            : 'There is an update or a due action in your co-ops. Open VergeCommon to check it.',
          url: '/workspace/',
        }),
        {
          vapidDetails: keys(),
          TTL: 3600,
          urgency: 'normal',
          topic: 'vergecommon-coop-updates',
          timeout: 5000,
        },
      );
      db.prepare(
        'UPDATE push_subscriptions SET last_sent=?,seen=?,accepted=accepted+1,last_error=? WHERE endpoint=? AND user_id=?',
      ).run(
        now(),
        JSON.stringify(visible.map((n) => n.id)),
        '',
        row.endpoint,
        row.user_id,
      );
      return { accepted: true };
    } catch (e) {
      if ([404, 410].includes(e.statusCode))
        db.prepare(
          'DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?',
        ).run(row.endpoint, row.user_id);
      else
        db.prepare(
          'UPDATE push_subscriptions SET last_error=? WHERE endpoint=? AND user_id=?',
        ).run('Delivery needs retry', row.endpoint, row.user_id);
      return { accepted: false };
    }
  };
  return {
    async handle({ req, url, principal, readBody, json }) {
      if (!principal || principal.kind === 'token')
        return json(401, { error: 'Sign in in your browser first.' });
      if (req.method === 'GET') {
        const rows = db
          .prepare(
            'SELECT mode,last_sent,last_error,accepted FROM push_subscriptions WHERE user_id=?',
          )
          .all(principal.id);
        return json(200, { publicKey: keys().publicKey, devices: rows });
      }
      if (!['POST', 'DELETE'].includes(req.method))
        return json(405, { error: 'Method not allowed.' });
      let input;
      try {
        input = JSON.parse((await readBody(req, 5000)).toString());
      } catch {
        return json(400, { error: 'Invalid request.' });
      }
      const subscription = validateSubscription(input.subscription);
      if (req.method === 'DELETE') {
        db.prepare(
          'DELETE FROM push_subscriptions WHERE endpoint=? AND user_id=?',
        ).run(subscription.endpoint, principal.id);
        return json(200, { removed: true });
      }
      if (url.pathname === '/api/push/test') {
        const row = db
          .prepare(
            'SELECT * FROM push_subscriptions WHERE endpoint=? AND user_id=?',
          )
          .get(subscription.endpoint, principal.id);
        if (!row)
          return json(404, {
            error: 'Enable reminders on this browser first.',
          });
        if (now() - row.last_attempt < 60000)
          return json(429, { error: 'Wait a minute before testing again.' });
        const result = await dispatch(row, true);
        return json(result?.accepted ? 200 : 503, {
          ...result,
          message: result?.accepted
            ? 'Browser service accepted the test. Confirm that the notification appeared on your device.'
            : 'The test was not accepted. Try enabling reminders again.',
        });
      }
      if (!['updates', 'digest'].includes(input.mode))
        return json(400, {
          error: 'Choose activity updates or a weekly digest.',
        });
      const existing = db
        .prepare('SELECT user_id FROM push_subscriptions WHERE endpoint=?')
        .get(subscription.endpoint);
      if (existing && existing.user_id !== principal.id)
        return json(409, {
          error:
            'This browser has reminders for another account. Disable those first or use a different browser profile.',
        });
      if (
        !existing &&
        db
          .prepare(
            'SELECT count(*) AS n FROM push_subscriptions WHERE user_id=?',
          )
          .get(principal.id).n >= 5
      )
        return json(409, {
          error: 'Five browsers are already connected. Disable one first.',
        });
      db.prepare(
        'INSERT INTO push_subscriptions (endpoint,user_id,subscription,mode,since,seen) VALUES (?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET mode=excluded.mode',
      ).run(
        subscription.endpoint,
        principal.id,
        JSON.stringify(subscription),
        input.mode,
        now(),
        JSON.stringify(notices(principal.id).map((n) => n.id)),
      );
      return json(200, { saved: true });
    },
    async tick() {
      const rows = db
        .prepare(
          'SELECT * FROM push_subscriptions ORDER BY checked_at ASC LIMIT 20',
        )
        .all();
      for (const row of rows) {
        db.prepare(
          'UPDATE push_subscriptions SET checked_at=? WHERE endpoint=?',
        ).run(now(), row.endpoint);
        await dispatch(row);
      }
    },
  };
}
