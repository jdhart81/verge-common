import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = (token) =>
  createHash('sha256').update(token).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const passwordCheck = (password) => {
  if (
    typeof password !== 'string' ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error('Use a password of 12 to 128 characters.');
};
export async function passwordHash(
  password,
  salt = randomBytes(16).toString('hex'),
) {
  passwordCheck(password);
  const key = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, hash] = stored.split(':');
  const key = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 3,
    maxmem: 64 * 1024 * 1024,
  });
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}
export function createAuth(db, now = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_audit (id TEXT PRIMARY KEY, user_id TEXT, event TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  const audit = (id, event) =>
    db
      .prepare('INSERT INTO auth_audit VALUES (?,?,?,?)')
      .run(randomUUID(), id, event, now());
  const session = (id) => {
    const token = secret();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
      digest(token),
      id,
      now() + 7 * 86400000,
    );
    return token;
  };
  const getUser = (row) =>
    row
      ? { id: row.id, username: row.username, displayName: row.display_name }
      : null;
  return {
    rateLimit(key, limit, duration) {
      const hash = digest(key);
      const time = now();
      db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').run(time);
      const row = db
        .prepare(
          'INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
        )
        .get(hash, time + duration);
      return row.count <= limit;
    },
    async register({ username, displayName, password }) {
      username = String(username ?? '')
        .trim()
        .toLowerCase();
      displayName = String(displayName ?? '').trim();
      if (!/^[a-z0-9][a-z0-9_-]{2,39}$/.test(username))
        throw new Error(
          'Use a username of 3–40 letters, numbers, underscores or hyphens.',
        );
      if (!displayName || displayName.length > 80)
        throw new Error('Enter a display name of up to 80 characters.');
      const hash = await passwordHash(password);
      const recoveryCode = secret();
      const id = randomUUID();
      try {
        db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
          id,
          username,
          displayName,
          hash,
          digest(recoveryCode),
          now(),
        );
      } catch (e) {
        if (String(e).includes('UNIQUE'))
          throw new Error('That username is unavailable.');
        throw e;
      }
      audit(id, 'register');
      return {
        user: { id, username, displayName },
        session: session(id),
        recoveryCode,
      };
    },
    async login({ username, password }) {
      const row = db.prepare('SELECT * FROM users WHERE username=?').get(
        String(username ?? '')
          .trim()
          .toLowerCase(),
      );
      const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
      const valid = await passwordMatches(
        password,
        row?.password_hash ?? dummy,
      );
      if (
        !row ||
        !valid ||
        db.prepare('SELECT password_hash FROM users WHERE id=?').get(row.id)
          ?.password_hash !== row.password_hash
      )
        throw new Error('Username or password is incorrect.');
      audit(row.id, 'login');
      return { user: getUser(row), session: session(row.id) };
    },
    authenticate(headers) {
      const authorization = headers.authorization;
      if (authorization) {
        if (
          typeof authorization !== 'string' ||
          !/^Bearer vc_[A-Za-z0-9_-]{43}$/.test(authorization)
        )
          return null;
        const row = db
          .prepare(
            'SELECT users.*,api_tokens.scopes,api_tokens.id AS token_id FROM api_tokens JOIN users ON users.id=api_tokens.user_id WHERE hash=? AND expires_at>?',
          )
          .get(digest(authorization.slice(7)), now());
        return row
          ? {
              ...getUser(row),
              kind: 'token',
              scopes: JSON.parse(row.scopes),
              tokenId: row.token_id,
            }
          : null;
      }
      const token = String(headers.cookie ?? '')
        .split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('vc_session='))
        ?.slice(11);
      if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const row = db
        .prepare(
          'SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND expires_at>?',
        )
        .get(digest(token), now());
      return row
        ? {
            ...getUser(row),
            kind: 'session',
            scopes: ['app:read', 'app:write'],
          }
        : null;
    },
    logout(headers) {
      const token = String(headers.cookie ?? '')
        .split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('vc_session='))
        ?.slice(11);
      if (token)
        db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token));
    },
    tokens(id) {
      return db
        .prepare(
          'SELECT id,label,scopes,expires_at,created_at FROM api_tokens WHERE user_id=? ORDER BY created_at DESC',
        )
        .all(id);
    },
    createToken(id, label, scope) {
      if (typeof label !== 'string' || !label.trim() || label.length > 80)
        throw new Error('Give this device or agent a name.');
      const choices = {
        'app:read': ['app:read'],
        'app:write': ['app:read', 'app:write'],
        'mcp:read': ['mcp:read'],
        'mcp:write': ['mcp:read', 'mcp:write'],
      };
      if (!choices[scope]) throw new Error('Choose valid permissions.');
      if (this.tokens(id).length >= 20)
        throw new Error('Revoke an old token before creating another.');
      const token = `vc_${secret()}`,
        tokenId = randomUUID();
      db.prepare('INSERT INTO api_tokens VALUES (?,?,?,?,?,?,?)').run(
        tokenId,
        digest(token),
        id,
        label.trim(),
        JSON.stringify(choices[scope]),
        now() + 90 * 86400000,
        now(),
      );
      audit(id, 'token_created');
      return token;
    },
    revokeToken(id, tokenId) {
      db.prepare('DELETE FROM api_tokens WHERE user_id=? AND id=?').run(
        id,
        tokenId,
      );
      audit(id, 'token_revoked');
    },
    async changePassword(id, currentPassword, newPassword) {
      const row = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      if (!row || !(await passwordMatches(currentPassword, row.password_hash)))
        throw new Error('Current password is incorrect.');
      const hash = await passwordHash(newPassword);
      const changed = db
        .prepare(
          'UPDATE users SET password_hash=? WHERE id=? AND password_hash=?',
        )
        .run(hash, id, row.password_hash);
      if (!changed.changes)
        throw new Error('Credentials changed. Sign in again.');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(id);
      audit(id, 'password_changed');
      return session(id);
    },
    async recover({ username, recoveryCode, password }) {
      const row = db.prepare('SELECT * FROM users WHERE username=?').get(
        String(username ?? '')
          .trim()
          .toLowerCase(),
      );
      if (
        !row ||
        typeof recoveryCode !== 'string' ||
        !timingSafeEqual(
          Buffer.from(row.recovery_hash, 'hex'),
          Buffer.from(digest(recoveryCode), 'hex'),
        )
      )
        throw new Error('Username or recovery code is incorrect.');
      const hash = await passwordHash(password);
      const code = secret();
      const changed = db
        .prepare(
          'UPDATE users SET password_hash=?, recovery_hash=? WHERE id=? AND recovery_hash=? AND password_hash=?',
        )
        .run(hash, digest(code), row.id, row.recovery_hash, row.password_hash);
      if (!changed.changes)
        throw new Error('Recovery code already used or credentials changed.');
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
      db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(row.id);
      audit(row.id, 'recovered');
      return { session: session(row.id), recoveryCode: code };
    },
    async closeAccount(id, password) {
      const row = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      if (!row || !(await passwordMatches(password, row.password_hash)))
        throw new Error('Password is incorrect.');
      const changed = db
        .prepare('DELETE FROM users WHERE id=? AND password_hash=?')
        .run(id, row.password_hash);
      if (!changed.changes)
        throw new Error('Credentials changed. Sign in again.');
      audit(id, 'account_closed');
    },
  };
}
