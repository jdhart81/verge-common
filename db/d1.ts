import { env } from 'cloudflare:workers';

export function getD1(): D1Database {
  if (!env.DB) {
    throw new Error('The Verge Common database binding is unavailable.');
  }

  return env.DB;
}
