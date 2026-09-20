import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';
import { promisify } from 'node:util';
import { contentSafetyIssue } from '../lib/content-safety.mjs';
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
export function createAuth(db, now = Date.now, lifecycle = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS api_tokens (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_audit (id TEXT PRIMARY KEY, user_id TEXT, event TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS social_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, encrypted_token TEXT NOT NULL, subject_hash TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(user_id,provider));
    CREATE TABLE IF NOT EXISTS social_only_users (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS social_revocations (id INTEGER PRIMARY KEY, provider TEXT NOT NULL, encrypted_token TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS social_identity_tombstones (provider TEXT NOT NULL, subject_hash TEXT NOT NULL, deleted_at INTEGER NOT NULL, PRIMARY KEY(provider,subject_hash));
    CREATE TRIGGER IF NOT EXISTS queue_social_revocation BEFORE DELETE ON social_identities BEGIN
      INSERT INTO social_revocations(provider,encrypted_token) VALUES (OLD.provider,OLD.encrypted_token);
      INSERT INTO social_identity_tombstones VALUES (OLD.provider,OLD.subject_hash,CAST(unixepoch('subsec')*1000 AS INTEGER)) ON CONFLICT(provider,subject_hash) DO UPDATE SET deleted_at=excluded.deleted_at;
    END;`);
  const audit = (id, event) => {
    if (id && !db.prepare('SELECT id FROM users WHERE id=?').get(id)) return;
    db.prepare('INSERT INTO auth_audit VALUES (?,?,?,?)').run(
      randomUUID(),
      id,
      event,
      now(),
    );
  };
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
  const eraseUser = async (id, expectedHash) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (
        db.prepare('SELECT password_hash FROM users WHERE id=?').get(id)
          ?.password_hash !== expectedHash
      )
        throw new Error('Credentials changed. Sign in again.');
      lifecycle.eraseAccountData?.(id, now());
      db.prepare('DELETE FROM users WHERE id=?').run(id);
      db.prepare('DELETE FROM auth_audit WHERE user_id=?').run(id);
      audit(null, 'account_deleted');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      lifecycle.abortAccountDeletion?.(id);
      throw error;
    }
    await lifecycle.afterAccountDeletion?.(id);
  };
  const identityRow = (identity) =>
    db
      .prepare('SELECT * FROM social_identities WHERE provider=? AND subject=?')
      .get(identity.provider, identity.subject);
  const checkDeletion = (identity) => {
    const tombstone = db
      .prepare(
        'SELECT deleted_at FROM social_identity_tombstones WHERE provider=? AND subject_hash=?',
      )
      .get(identity.provider, digest(identity.subject));
    if (
      tombstone &&
      (!Number.isFinite(identity.startedAt) ||
        identity.startedAt <= tombstone.deleted_at)
    )
      throw new Error('Account identity changed. Start a new sign-in.');
  };
  return {
    hasPassword(id) {
      return !db
        .prepare('SELECT user_id FROM social_only_users WHERE user_id=?')
        .get(id);
    },
    identities(id) {
      return db
        .prepare('SELECT provider FROM social_identities WHERE user_id=?')
        .all(id)
        .map((r) => r.provider);
    },
    async checkPassword(id, password) {
      const row = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      return (
        !!row &&
        this.hasPassword(id) &&
        (await passwordMatches(password, row.password_hash)) &&
        db.prepare('SELECT password_hash FROM users WHERE id=?').get(id)
          ?.password_hash === row.password_hash
      );
    },
    async socialLogin(identity) {
      checkDeletion(identity);
      let existing = identityRow(identity);
      if (existing) {
        db.prepare(
          'UPDATE social_identities SET encrypted_token=? WHERE provider=? AND subject=?',
        ).run(identity.encryptedToken, identity.provider, identity.subject);
        audit(existing.user_id, 'social_login');
        return {
          user: getUser(
            db.prepare('SELECT * FROM users WHERE id=?').get(existing.user_id),
          ),
          session: session(existing.user_id),
        };
      }
      const hash = await passwordHash(secret());
      const recoveryCode = secret(),
        id = randomUUID(),
        username = 'member_' + randomUUID().replaceAll('-', '').slice(0, 24);
      const name =
        typeof identity.name === 'string' &&
        identity.name.trim().length <= 80 &&
        !contentSafetyIssue(identity.name)
          ? identity.name.trim()
          : '';
      db.exec('BEGIN IMMEDIATE');
      try {
        checkDeletion(identity);
        existing = identityRow(identity);
        if (existing) {
          const result = {
            user: getUser(
              db
                .prepare('SELECT * FROM users WHERE id=?')
                .get(existing.user_id),
            ),
            session: session(existing.user_id),
          };
          db.exec('COMMIT');
          return result;
        }
        db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run(
          id,
          username,
          name || 'Community member',
          hash,
          digest(recoveryCode),
          now(),
        );
        db.prepare('INSERT INTO social_only_users VALUES (?)').run(id);
        db.prepare('INSERT INTO social_identities VALUES (?,?,?,?,?)').run(
          identity.provider,
          identity.subject,
          id,
          identity.encryptedToken,
          digest(identity.subject),
        );
        audit(id, 'social_register');
        const result = {
          user: getUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)),
          session: session(id),
          recoveryCode,
        };
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    linkSocial(id, identity) {
      checkDeletion(identity);
      const existing = identityRow(identity);
      if (existing && existing.user_id !== id)
        throw new Error(
          'That provider account is already linked to another VergeCommon account.',
        );
      const own = db
        .prepare(
          'SELECT subject FROM social_identities WHERE user_id=? AND provider=?',
        )
        .get(id, identity.provider);
      if (own && own.subject !== identity.subject)
        throw new Error(
          'Remove your current provider link before linking another account.',
        );
      db.prepare(
        'INSERT INTO social_identities VALUES (?,?,?,?,?) ON CONFLICT(provider,subject) DO UPDATE SET encrypted_token=excluded.encrypted_token',
      ).run(
        identity.provider,
        identity.subject,
        id,
        identity.encryptedToken,
        digest(identity.subject),
      );
      audit(id, 'social_linked');
    },
    unlinkSocial(id, provider) {
      if (!this.hasPassword(id))
        throw new Error(
          'Set a backup password using your recovery code before removing a sign-in method.',
        );
      db.prepare(
        'DELETE FROM social_identities WHERE user_id=? AND provider=?',
      ).run(id, provider);
      audit(id, 'social_unlinked');
    },
    async closeSocial(id, identity) {
      const existing = identityRow(identity);
      if (!existing || existing.user_id !== id)
        throw new Error(
          'Use a provider account already linked to this VergeCommon account.',
        );
      const row = db
        .prepare('SELECT password_hash FROM users WHERE id=?')
        .get(id);
      if (!row) throw new Error('Sign in again.');
      db.prepare(
        'UPDATE social_identities SET encrypted_token=? WHERE provider=? AND subject=?',
      ).run(identity.encryptedToken, identity.provider, identity.subject);
      await eraseUser(id, row.password_hash);
    },
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
      const safetyIssue = contentSafetyIssue(displayName);
      if (safetyIssue) throw new Error(safetyIssue);
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
      db.prepare('DELETE FROM api_tokens WHERE expires_at <= ?').run(now());
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
    nativeSession(result) {
      // Browser auth primitives issue a session; native clients receive only
      // a device token. Always remove the temporary cookie session.
      try {
        const token = this.createToken(
          result.user.id,
          'VergeCommon iOS',
          'app:write',
        );
        const row = db
          .prepare('SELECT expires_at FROM api_tokens WHERE hash=?')
          .get(digest(token));
        return {
          user: result.user,
          token,
          expiresAt: row.expires_at,
          ...(result.recoveryCode ? { recoveryCode: result.recoveryCode } : {}),
        };
      } finally {
        this.logout({ cookie: `vc_session=${result.session}` });
      }
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
      db.prepare('DELETE FROM social_only_users WHERE user_id=?').run(row.id);
      audit(row.id, 'recovered');
      return {
        user: getUser(row),
        session: session(row.id),
        recoveryCode: code,
      };
    },
    async closeAccount(id, password) {
      const row = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      if (!row || !(await passwordMatches(password, row.password_hash)))
        throw new Error('Password is incorrect.');
      await eraseUser(id, row.password_hash);
    },
  };
}
