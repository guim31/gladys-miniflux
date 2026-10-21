// -----------------------------------------------------------------------------
// The REST API of Miniflux (`<base>/v1/...`), the few calls the integration
// needs, authenticated by an API key (`X-Auth-Token`).
//
// Facts checked on a real server, Miniflux 2.3.4 (ghcr.io/miniflux/miniflux),
// see test/fixtures/miniflux/2.3.4/:
// - answers are JSON; errors are `{ "error_message": "..." }` (401 "access
//   unauthorized", 404 "resource not found", 400 "the list of entries cannot
//   be empty"); an unknown route is a plain-text 404 "404 page not found";
// - the write calls (`PUT /v1/entries`, `/categories/{id}/mark-all-as-read`,
//   `/feeds/refresh`) answer 204 with an empty body;
// - `GET /v1/feeds/counters` lists only the feeds with unread (or read)
//   entries: a feed absent from `unreads` has none;
// - `GET /v1/entries` embeds the whole feed in every entry (its `username`
//   and `password` fields included) and the full HTML content: pages stay
//   small, and nothing of an entry is logged;
// - entry ids only grow (a PostgreSQL sequence): `after_entry_id` lists what
//   arrived since an id;
// - `PUT /v1/feeds/refresh` (and `/categories/{id}/refresh`) only queue the
//   feeds whose next check is due — most often none ("batch_size=0" in the
//   Miniflux log); `PUT /v1/feeds/{id}/refresh` fetches that feed now and
//   answers when it is done (204, or 500 with the parsing error).
// -----------------------------------------------------------------------------

import { scrubUrls } from './model.js';

export const DEFAULT_TIMEOUT = 15_000;

export class MinifluxError extends Error {
  /**
   * @param {'unreachable' | 'unauthorized' | 'not_found' | 'timeout' | 'http' | 'invalid' | 'rejected'} kind
   * @param {string} message never carries a credential
   * @param {number} [status]
   */
  constructor(kind, message, status) {
    super(message);
    this.name = 'MinifluxError';
    this.kind = kind;
    this.status = status;
  }
}

export class MinifluxClient {
  /**
   * @param {object} options
   * @param {string} options.url normalized base URL (see normalizeUrl)
   * @param {string} options.token the API key
   * @param {typeof fetch} [options.fetch]
   * @param {number} [options.timeout]
   */
  constructor({ url, token, fetch: fetchImpl, timeout }) {
    this.url = url;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
  }

  async #send(method, path, body, timeout = this.timeout) {
    const headers = { Accept: 'application/json', 'X-Auth-Token': this.token };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    let raw;
    try {
      response = await this.fetch(`${this.url}/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
        redirect: 'follow',
      });
      raw = await response.text();
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new MinifluxError('timeout', `No answer from Miniflux within ${timeout} ms`);
      }
      const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'error';
      throw new MinifluxError('unreachable', `Miniflux unreachable (${cause})`);
    }
    if (!response.ok) {
      throw MinifluxClient.#fail(path, response.status, raw);
    }
    if (response.status === 204 || raw.trim() === '') {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      // A proxy login page answering 200 in HTML, for instance.
      throw new MinifluxError('invalid', `${path}: the answer is not JSON (is this Miniflux?)`);
    }
  }

  static #fail(path, status, raw) {
    let detail = raw.trim() || `HTTP ${status}`;
    try {
      const data = JSON.parse(raw);
      if (typeof data?.error_message === 'string') {
        detail = data.error_message;
      }
    } catch {
      // not JSON
    }
    if (/^\s*</.test(detail)) {
      detail = `HTTP ${status}`;
    }
    const kind =
      status === 401 || status === 403
        ? 'unauthorized'
        : status === 404
          ? 'not_found'
          : status === 400
            ? 'rejected'
            : 'http';
    return new MinifluxError(
      kind,
      `${path.split('?')[0]}: ${scrubUrls(detail).replace(/\s+/g, ' ').slice(0, 120)}`,
      status,
    );
  }

  /** `{ id, username, ... }`: the owner of the API key. */
  async me() {
    const user = await this.#send('GET', '/me');
    if (!user || !Number.isInteger(user.id)) {
      throw new MinifluxError('invalid', 'This address does not answer like Miniflux');
    }
    return user;
  }

  /** `[{ id, title }]` */
  async categories() {
    const data = await this.#send('GET', '/categories');
    if (!Array.isArray(data)) {
      throw new MinifluxError('invalid', 'Miniflux did not answer its categories');
    }
    return data;
  }

  /** `[{ id, title, site_url, category: { id, title }, parsing_error_count, ... }]` */
  async feeds() {
    const data = await this.#send('GET', '/feeds');
    if (!Array.isArray(data)) {
      throw new MinifluxError('invalid', 'Miniflux did not answer its feeds');
    }
    return data;
  }

  /** `{ feedId: unread entries }` (feeds without unread entries are absent). */
  async unreadCounters() {
    const data = await this.#send('GET', '/feeds/counters');
    if (!data || typeof data.unreads !== 'object' || data.unreads === null) {
      throw new MinifluxError('invalid', 'Miniflux did not answer its counters');
    }
    return data.unreads;
  }

  /**
   * One page of entries.
   * @param {{ status?: string, categoryId?: number, afterId?: number, order?: string, limit?: number }} query
   * @returns {Promise<{ total: number, entries: object[] }>}
   */
  async entries({ status, categoryId, afterId, order = 'id', limit = 20 } = {}) {
    const params = new URLSearchParams({ order, direction: 'desc', limit: String(limit) });
    if (status) {
      params.set('status', status);
    }
    if (categoryId !== undefined) {
      params.set('category_id', String(categoryId));
    }
    if (afterId !== undefined) {
      params.set('after_entry_id', String(afterId));
    }
    const data = await this.#send('GET', `/entries?${params}`);
    if (!Array.isArray(data?.entries)) {
      throw new MinifluxError('invalid', 'Miniflux did not answer its entries');
    }
    return {
      total: Number.isInteger(data.total) ? data.total : data.entries.length,
      entries: data.entries,
    };
  }

  /** @param {number[]} ids */
  async markEntriesRead(ids) {
    await this.#send('PUT', '/entries', { entry_ids: ids, status: 'read' });
  }

  async markCategoryRead(categoryId) {
    await this.#send('PUT', `/categories/${categoryId}/mark-all-as-read`);
  }

  async markAllRead(userId) {
    await this.#send('PUT', `/users/${userId}/mark-all-as-read`);
  }

  /** Fetch one feed now (answers once Miniflux read it). */
  async refreshFeed(feedId, timeout) {
    await this.#send('PUT', `/feeds/${feedId}/refresh`, undefined, timeout);
  }
}
