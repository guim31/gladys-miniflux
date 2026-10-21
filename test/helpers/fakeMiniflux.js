// -----------------------------------------------------------------------------
// A fake Miniflux behind a `fetch` function: it starts from the bodies
// recorded on a real Miniflux 2.3.4 (test/fixtures/miniflux/2.3.4/), keeps its
// categories, feeds and entries in memory, and answers the errors the real
// server answers (JSON 401, 400 and 404, a plain-text 404 for an unknown route).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const HOST = 'http://192.0.2.40:8080';
export const TOKEN = 'test-api-key-0123456789abcdef';
export const NOW = Date.parse('2026-10-21T20:00:00.000Z');

export const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/miniflux/2.3.4/${name}.json`, import.meta.url), 'utf8'),
  );

export const settle = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMiniflux({ entries = true } = {}) {
  const state = {
    user: fixture('me').body,
    categories: structuredClone(fixture('categories').body),
    feeds: structuredClone(fixture('feeds').body),
    entries: entries ? structuredClone(fixture('entries').body.entries) : [],
    down: false,
    html: false,
    requests: [],
    refreshed: [],
    clock: Date.parse('2026-10-21T19:40:00.000Z'),
  };
  const answer = (status, body, type = 'application/json') =>
    new Response(
      status === 204 ? null : type === 'application/json' ? JSON.stringify(body) : body,
      {
        status,
        headers: status === 204 ? {} : { 'content-type': type },
      },
    );
  const feedById = (id) => state.feeds.find((f) => f.id === id);
  const categoryOf = (entry) => feedById(entry.feed_id)?.category?.id;

  /** A new entry, as Miniflux stores it after reading a feed. */
  function addEntry({
    feedId = 1,
    title = 'A new article',
    url,
    published,
    status = 'unread',
  } = {}) {
    state.clock += 60_000;
    const id = Math.max(0, ...state.entries.map((e) => e.id)) + 1;
    const feed = structuredClone(feedById(feedId));
    const at = new Date(state.clock).toISOString();
    const entry = {
      ...structuredClone(state.entries[0] ?? fixture('entries').body.entries[0]),
      id,
      feed_id: feedId,
      status,
      title,
      url: url ?? `https://news.example.org/${id}`,
      published_at: published ?? at,
      created_at: at,
      changed_at: at,
      author: '',
      content: `<p>Summary of <b>${title}</b> &amp; more.</p>`,
      feed,
    };
    state.entries.push(entry);
    return entry;
  }

  function addFeed({ title = 'New Feed', categoryId = 2 } = {}) {
    const id = Math.max(0, ...state.feeds.map((f) => f.id)) + 1;
    const category = structuredClone(state.categories.find((c) => c.id === categoryId));
    const feed = {
      ...structuredClone(state.feeds.find((f) => f.parsing_error_count === 0)),
      id,
      title,
      feed_url: `https://feeds.example.org/${id}.xml`,
      site_url: `https://site${id}.example.org/`,
      category,
    };
    state.feeds.push(feed);
    return feed;
  }

  function breakFeed(id, message = 'Unable to detect feed format.') {
    const feed = feedById(id);
    feed.parsing_error_count += 1;
    feed.parsing_error_message = message;
  }

  function fixFeed(id) {
    const feed = feedById(id);
    feed.parsing_error_count = 0;
    feed.parsing_error_message = '';
  }

  async function fetch(url, init = {}) {
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^\/v1/, '');
    const method = init.method ?? 'GET';
    state.requests.push(`${method} ${path}${searchParams.size ? `?${searchParams}` : ''}`);
    if (state.down) {
      throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    }
    if (state.html) {
      return answer(200, '<html>Login</html>', 'text/html');
    }
    if (init.headers?.['X-Auth-Token'] !== TOKEN) {
      return answer(401, fixture('unauthorized').body);
    }
    const body = init.body ? JSON.parse(init.body) : undefined;

    if (method === 'GET' && path === '/me') {
      return answer(200, state.user);
    }
    if (method === 'GET' && path === '/categories') {
      return answer(200, state.categories);
    }
    if (method === 'GET' && path === '/feeds') {
      return answer(200, state.feeds);
    }
    if (method === 'GET' && path === '/feeds/counters') {
      const counters = { reads: {}, unreads: {} };
      for (const entry of state.entries) {
        const side = entry.status === 'unread' ? counters.unreads : counters.reads;
        side[entry.feed_id] = (side[entry.feed_id] ?? 0) + 1;
      }
      return answer(200, counters);
    }
    if (method === 'GET' && path === '/entries') {
      let list = [...state.entries];
      if (searchParams.has('status')) {
        list = list.filter((e) => e.status === searchParams.get('status'));
      }
      if (searchParams.has('category_id')) {
        list = list.filter((e) => categoryOf(e) === Number(searchParams.get('category_id')));
      }
      if (searchParams.has('after_entry_id')) {
        list = list.filter((e) => e.id > Number(searchParams.get('after_entry_id')));
      }
      const key = searchParams.get('order') === 'published_at' ? 'published_at' : 'id';
      list.sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : 0));
      if (searchParams.get('direction') === 'asc') {
        list.reverse();
      }
      const limit = Number(searchParams.get('limit') ?? 100);
      return answer(200, { total: list.length, entries: list.slice(0, limit) });
    }
    if (method === 'PUT' && path === '/entries') {
      if (!Array.isArray(body?.entry_ids) || body.entry_ids.length === 0) {
        return answer(400, fixture('mark-entries-bad').body);
      }
      for (const entry of state.entries) {
        if (body.entry_ids.includes(entry.id)) {
          entry.status = body.status;
        }
      }
      return answer(204);
    }
    let match = path.match(/^\/categories\/(\d+)\/mark-all-as-read$/);
    if (method === 'PUT' && match) {
      const id = Number(match[1]);
      if (!state.categories.some((c) => c.id === id)) {
        return answer(404, fixture('mark-category-missing').body);
      }
      for (const entry of state.entries.filter((e) => categoryOf(e) === id)) {
        entry.status = 'read';
      }
      return answer(204);
    }
    match = path.match(/^\/users\/(\d+)\/mark-all-as-read$/);
    if (method === 'PUT' && match && Number(match[1]) === state.user.id) {
      for (const entry of state.entries) {
        entry.status = 'read';
      }
      return answer(204);
    }
    match = path.match(/^\/feeds\/(\d+)\/refresh$/);
    if (method === 'PUT' && match && feedById(Number(match[1]))) {
      const feed = feedById(Number(match[1]));
      state.refreshed.push(feed.id);
      return feed.parsing_error_count > 0
        ? answer(500, { error_message: 'parser: unable to detect feed format' })
        : answer(204);
    }
    return answer(404, fixture('not-found').body, 'text/plain; charset=utf-8');
  }

  return {
    state,
    fetch,
    addEntry,
    addFeed,
    breakFeed,
    fixFeed,
    goDown() {
      state.down = true;
    },
    goUp() {
      state.down = false;
    },
  };
}
