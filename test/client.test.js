// The Miniflux client, the configuration and the pure model, on the answers
// recorded on a real Miniflux 2.3.4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeUrl, parseKeywords } from '../src/config.js';
import { MinifluxClient } from '../src/miniflux/client.js';
import {
  matchKeyword,
  parseIds,
  plainText,
  siteOf,
  summarizeEntry,
  summarizeFeed,
} from '../src/miniflux/model.js';
import { HOST, TOKEN, createMiniflux, fixture } from './helpers/fakeMiniflux.js';

const client = (fetch, token = TOKEN) =>
  new MinifluxClient({ url: HOST, token, fetch, timeout: 100 });

test('addresses: default port 8080, reverse proxy paths, pasted /v1, refusals', () => {
  assert.equal(normalizeUrl('192.0.2.10'), 'http://192.0.2.10:8080');
  assert.equal(normalizeUrl(' 192.0.2.10:8081/ '), 'http://192.0.2.10:8081');
  assert.equal(normalizeUrl('https://example.org/rss/v1/'), 'https://example.org/rss');
  assert.equal(normalizeUrl('https://reader.miniflux.app'), 'https://reader.miniflux.app');
  assert.equal(normalizeUrl('http://user:pass@192.0.2.10'), null);
  assert.equal(normalizeUrl('ftp://192.0.2.10'), null);
  assert.equal(normalizeUrl(''), null);
});

test('configuration: defaults, keywords, unknown values', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    urlInvalid: false,
    token: '',
    refreshMinutes: 5,
    keywords: [],
    language: 'fr',
  });
  const config = normalizeConfig({ refresh_minutes: '7', language: 'it', api_key: ' k ' });
  assert.equal(config.refreshMinutes, 5);
  assert.equal(config.language, 'fr');
  assert.equal(config.token, 'k');
  assert.deepEqual(parseKeywords('Gladys, zigbee;; gladys\nHome Assistant'), [
    'Gladys',
    'zigbee',
    'Home Assistant',
  ]);
});

test('the client reads the recorded answers', async () => {
  const server = createMiniflux();
  const miniflux = client(server.fetch);
  assert.equal((await miniflux.me()).username, 'admin');
  assert.deepEqual(
    (await miniflux.categories()).map((c) => c.title),
    ['All', 'News', 'Tech'],
  );
  assert.deepEqual(await miniflux.unreadCounters(), { 1: 2, 2: 1, 3: 2 });
  const page = await miniflux.entries({ afterId: 3, limit: 1 });
  assert.equal(page.total, 2);
  assert.deepEqual(
    page.entries.map((e) => e.id),
    [5],
  );
  assert.equal(await miniflux.markEntriesRead([1]), undefined, 'a 204 is no error');
});

test('errors: refused key, missing category, empty list, down, not JSON, timeout', async () => {
  const server = createMiniflux();
  await assert.rejects(client(server.fetch, 'nope').me(), {
    kind: 'unauthorized',
    message: '/me: access unauthorized',
  });
  await assert.rejects(client(server.fetch).markCategoryRead(999), {
    kind: 'not_found',
    message: '/categories/999/mark-all-as-read: resource not found',
  });
  await assert.rejects(client(server.fetch).markEntriesRead([]), {
    kind: 'rejected',
    message: '/entries: the list of entries cannot be empty',
  });
  server.goDown();
  await assert.rejects(client(server.fetch).me(), (err) => {
    assert.equal(err.kind, 'unreachable');
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
  server.goUp();
  server.state.html = true;
  await assert.rejects(client(server.fetch).feeds(), { kind: 'invalid' });
  const hanging = (url, init) =>
    new Promise((resolve, reject) => {
      // Node 22: the timer of AbortSignal.timeout does not hold the event loop.
      const hold = setTimeout(() => {}, 5_000);
      init.signal.addEventListener('abort', () => {
        clearTimeout(hold);
        reject(init.signal.reason);
      });
    });
  await assert.rejects(client(hanging).me(), { kind: 'timeout' });
});

test('entries and feeds are summarized without credentials or feed URLs', () => {
  const raw = fixture('entries').body.entries[0];
  const entry = summarizeEntry(raw);
  assert.equal(entry.title, 'Gladys 5.2 is out');
  assert.equal(entry.feed, 'Flaky Feed');
  assert.equal(entry.category, 'Tech');
  assert.equal(entry.summary, 'The new version of Gladys brings widget forms.');
  assert.ok(!JSON.stringify(entry).includes('feeds.example.org'), 'no feed URL');
  const feed = summarizeFeed(fixture('feeds').body[0]);
  assert.equal(feed.errorCount, 3);
  assert.equal(feed.error, 'Unable to detect feed format: parser: unable to detect feed format.');
  assert.equal(siteOf('https://example.org/feed?key=secret'), 'https://example.org/feed');
});

test('text helpers: HTML to text, keywords, entry ids', () => {
  assert.equal(
    plainText('<p>Caf&eacute; &amp; <b>th&#233;</b></p><script>x()</script>'),
    'Caf&eacute; & thé',
  );
  assert.equal(matchKeyword('Le SALON de la domotique', ['salon']), 'salon');
  assert.equal(matchKeyword('Nothing here', ['salon']), '');
  assert.deepEqual(parseIds('12, 13;12'), [12, 13]);
  assert.deepEqual(parseIds(7), [7]);
  assert.equal(parseIds('12, x'), null);
  assert.equal(parseIds(''), null);
});
