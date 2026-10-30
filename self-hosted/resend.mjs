import { createHmac } from 'node:crypto';

// REST contracts verified 2026-10-03; sources and tracking constraints: docs/EMAIL.md.
const safeError = (status, code) => ({ status, code });
const part = (value) => encodeURIComponent(value);
export function createResendClient({
  apiKey,
  fetchImpl = fetch,
  trackingApiKey = apiKey,
}) {
  const pending = new Map();
  async function request(path, method = 'GET', body, key = apiKey) {
    if (process.env.CI && fetchImpl === globalThis.fetch)
      throw safeError(0, 'network_disabled_in_ci');
    let response;
    try {
      response = await fetchImpl(`https://api.resend.com${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw safeError(0, 'transport_error');
    }
    // Never echo provider messages, error names, URLs, or request/response bodies.
    if (!response.ok) throw safeError(response.status, 'provider_error');
    try {
      return await response.json();
    } catch {
      throw safeError(response.status, 'invalid_response');
    }
  }
  async function pages(path, key = apiKey) {
    const rows = [];
    let cursor;
    const seen = new Set();
    for (;;) {
      const result = await request(
        `${path}?limit=100${cursor ? `&after=${part(cursor)}` : ''}`,
        'GET',
        undefined,
        key,
      );
      if (!Array.isArray(result.data) || typeof result.has_more !== 'boolean')
        throw safeError(0, 'invalid_response');
      rows.push(...result.data);
      if (!result.has_more) return rows;
      cursor = result.data.at(-1)?.id;
      if (!cursor || seen.has(cursor)) throw safeError(0, 'invalid_pagination');
      seen.add(cursor);
    }
  }
  async function assertNoTracking(from) {
    const domain = String(from)
      .match(/@([^\s>]+)>?$/)?.[1]
      ?.toLowerCase();
    const domains = await pages('/domains', trackingApiKey);
    const row = domains.find((item) => item.name === domain);
    if (!row || row.open_tracking !== false || row.click_tracking !== false)
      throw safeError(0, 'tracking_not_disabled');
  }
  return {
    async sendEmail({ from, to, subject, html, text, reply_to }) {
      await assertNoTracking(from);
      return request('/emails', 'POST', {
        from,
        to,
        subject,
        html,
        text,
        reply_to,
      });
    },
    async upsertContact(email, segmentId) {
      const key = createHmac('sha256', apiKey).update(email).digest('hex');
      if (pending.has(key)) return pending.get(key);
      const operation = (async () => {
        let contact;
        try {
          contact = await request(`/contacts/${part(email)}`);
        } catch (error) {
          if (error.status !== 404) throw error;
          try {
            return await request('/contacts', 'POST', {
              email,
              unsubscribed: false,
              segments: [{ id: segmentId }],
            });
          } catch (createError) {
            // A competing process may have created the same provider-unique email.
            if (createError.status !== 409) throw createError;
            contact = await request(`/contacts/${part(email)}`);
          }
        }
        // Never undo a hosted unsubscribe by replaying an old confirmation link.
        if (!contact.id) throw safeError(0, 'invalid_response');
        const segments = await pages(`/contacts/${part(contact.id)}/segments`);
        if (!segments.some((segment) => segment.id === segmentId)) {
          await request(
            `/contacts/${part(contact.id)}/segments/${part(segmentId)}`,
            'POST',
          );
        }
        return { id: contact.id };
      })();
      pending.set(key, operation);
      try {
        return await operation;
      } finally {
        pending.delete(key);
      }
    },
    async createBroadcast({ segment_id, from, subject, html, text, reply_to }) {
      await assertNoTracking(from);
      // Allowlisted fields only: send/scheduled_at can never leak into draft creation.
      return request('/broadcasts', 'POST', {
        segment_id,
        from,
        subject,
        html,
        text,
        reply_to,
        send: false,
      });
    },
    getBroadcast: (id) => request(`/broadcasts/${part(id)}`),
    async sendBroadcast(id) {
      const broadcast = await request(`/broadcasts/${part(id)}`);
      await assertNoTracking(broadcast.from);
      return request(`/broadcasts/${part(id)}/send`, 'POST', {});
    },
    async countSegment(id) {
      const contacts = await pages(`/segments/${part(id)}/contacts`);
      return contacts.filter((contact) => contact.unsubscribed === false)
        .length;
    },
  };
}
