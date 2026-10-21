// The hub against the SDK's fake Gladys and a fake Miniflux built on real
// Miniflux 2.3.4 answers: devices and states, the two triggers, the scene
// actions, the widget and the connection status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MemoryStore } from '../src/store.js';
import { HOST, TOKEN, createMiniflux } from './helpers/fakeMiniflux.js';
import {
  USER,
  categoryDevice,
  createAll,
  createWorld,
  mainDevice,
  mainFeature,
} from './helpers/world.js';

const NEWS = 2;
const TECH = 3;
const events = (fake, key = 'new_entry') => fake.sceneEvents.filter((e) => e.key === key);

test('one Miniflux device and one device per category, states once added', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.external_id, d.name]),
    [
      [mainDevice, 'Miniflux'],
      [categoryDevice(1), 'All'],
      [categoryDevice(NEWS), 'News'],
      [categoryDevice(TECH), 'Tech'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['Articles non lus', 'Flux en erreur'],
  );
  assert.equal(world.fake.lastState(mainFeature('unread')), undefined, 'nothing before adding');
  await createAll(world.fake);
  assert.equal(world.fake.lastState(mainFeature('unread')), 5);
  assert.equal(world.fake.lastState(mainFeature('errors')), 1);
  assert.equal(world.fake.lastState(`${categoryDevice(NEWS)}:unread`), 2);
  assert.equal(world.fake.lastState(`${categoryDevice(TECH)}:unread`), 3);
  assert.equal(world.fake.lastState(`${categoryDevice(1)}:unread`), 0);
  assert.equal((await world.fake.poll(devices[0])).success, true);
});

test('the counters follow Miniflux at each read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  world.server.addEntry({ feedId: 1 });
  world.server.fixFeed(3);
  await world.hub.refresh();
  assert.equal(world.fake.lastState(mainFeature('unread')), 6);
  assert.equal(world.fake.lastState(mainFeature('errors')), 0);
  assert.equal(world.fake.lastState(`${categoryDevice(NEWS)}:unread`), 3);
});

test('new entries: nothing at the first read, then one event per unread entry', async (t) => {
  const world = await createWorld({
    config: { url: HOST, api_key: TOKEN, keywords: 'zigbee, Météo' },
  });
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read is a baseline');
  world.server.addEntry({
    feedId: 2,
    title: 'ZigBee 4.0 is here',
    url: 'https://blog.example.org/z',
  });
  world.server.addEntry({ feedId: 1, title: 'Meteo of the week' });
  world.server.addEntry({ feedId: 1, title: 'Read elsewhere already', status: 'read' });
  await world.hub.refresh();
  const fired = events(world.fake);
  assert.equal(fired.length, 2);
  assert.deepEqual(fired[0].data, {
    category: categoryDevice(TECH),
    feed: 'Home Automation Blog',
    keyword: 'zigbee',
    title: 'ZigBee 4.0 is here',
    url: 'https://blog.example.org/z',
    category_name: 'Tech',
    author: '',
    published: fired[0].data.published,
    entry_id: 6,
  });
  assert.equal(fired[1].data.keyword, 'Météo', 'case and accents ignored');
  assert.equal(fired[1].data.category, categoryDevice(NEWS));
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 2, 'never twice');
});

test('the backlog of a feed added since the previous read is not announced', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const feed = world.server.addFeed({ title: 'Brand new', categoryId: NEWS });
  for (let i = 0; i < 5; i += 1) {
    world.server.addEntry({ feedId: feed.id, title: `Old ${i}` });
  }
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 0);
  world.server.addEntry({ feedId: feed.id, title: 'Really new' });
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['Really new'],
  );
});

test('a burst of entries announces the ten newest, the rest is recorded as seen', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 15; i += 1) {
    world.server.addEntry({ feedId: 1, title: `Entry ${i}` });
  }
  await world.hub.refresh();
  const fired = events(world.fake);
  assert.equal(fired.length, 10);
  assert.equal(fired[0].data.title, 'Entry 5');
  assert.equal(fired[9].data.title, 'Entry 14');
  await world.hub.refresh();
  assert.equal(events(world.fake).length, 10);
});

test('an event Gladys did not take is fired again at the next read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addEntry({ title: 'First' });
  world.server.addEntry({ title: 'Second' });
  world.server.breakFeed(1);
  await world.hub.refresh();
  assert.equal(world.fake.sceneEvents.length, 0);
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['First', 'Second'],
  );
  assert.equal(events(world.fake, 'feed_error').length, 1);
});

test('what was seen survives a restart', async (t) => {
  const store = new MemoryStore();
  const server = createMiniflux();
  const first = await createWorld({ server, store });
  await first.app.stop();
  assert.equal(store.data.user, USER);
  assert.equal(store.data.lastId, 5);
  assert.deepEqual(store.data.errors, [3]);
  server.addEntry({ title: 'While stopped' });
  const second = await createWorld({ server, store });
  t.after(() => second.app.stop());
  assert.deepEqual(
    events(second.fake).map((e) => e.data.title),
    ['While stopped'],
  );
  assert.equal(events(second.fake, 'feed_error').length, 0, 'the broken feed was known');
});

test('feed in error: once when it breaks, again only after it worked', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(events(world.fake, 'feed_error').length, 0, 'already broken at the baseline');
  world.server.breakFeed(2, 'Get "https://blog.example.org/": dial tcp: i/o timeout');
  await world.hub.refresh();
  world.server.breakFeed(2);
  await world.hub.refresh();
  const fired = events(world.fake, 'feed_error');
  assert.equal(fired.length, 1);
  assert.deepEqual(fired[0].data, {
    category: categoryDevice(TECH),
    feed: 'Home Automation Blog',
    category_name: 'Tech',
    error: 'Get "https://blog.example.org/": dial tcp: i/o timeout',
    error_count: 1,
    site: 'https://blog.example.org/',
    feed_id: 2,
  });
  world.server.fixFeed(2);
  await world.hub.refresh();
  world.server.breakFeed(2);
  await world.hub.refresh();
  assert.equal(events(world.fake, 'feed_error').length, 2);
  // A feed added already broken: the user saw the error when adding it.
  const feed = world.server.addFeed({ title: 'Born broken' });
  world.server.breakFeed(feed.id);
  await world.hub.refresh();
  assert.equal(events(world.fake, 'feed_error').length, 2);
});

test('mark a category as read, or everything with the Miniflux device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  let ack = await world.fake.sceneAction('mark_category_read', { category: categoryDevice(TECH) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { count: 3, category: 'Tech' });
  assert.equal(world.fake.lastState(mainFeature('unread')), 2, 'read again at once');
  ack = await world.fake.sceneAction('mark_category_read', { category: mainDevice });
  assert.deepEqual(ack.data.outputs, { count: 2, category: '' });
  assert.ok(world.server.state.requests.includes(`PUT /users/${USER}/mark-all-as-read`));
  assert.equal(world.fake.lastState(mainFeature('unread')), 0);
  // A category deleted in Miniflux since the last read.
  world.server.state.categories = world.server.state.categories.filter((c) => c.id !== NEWS);
  ack = await world.fake.sceneAction('mark_category_read', { category: categoryDevice(NEWS) });
  assert.equal(ack.success, false);
  assert.match(ack.error, /n'existe plus/);
  ack = await world.fake.sceneAction('mark_category_read', { category: 'ext:other:thing' });
  assert.equal(ack.success, false);
});

test('mark entries as read: the id of a trigger, or a list', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('mark_entries_read', { entry_ids: '1, 2 ,3' });
  assert.deepEqual(ack.data.outputs, { count: 3 });
  assert.deepEqual(
    world.server.state.entries
      .filter((e) => e.status === 'unread')
      .map((e) => e.id)
      .sort(),
    [4, 5],
  );
  ack = await world.fake.sceneAction('mark_entries_read', { entry_ids: 'twelve' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /identifiants/);
});

test('refresh the feeds: each feed of the scope is fetched now, then Miniflux is read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('refresh_feeds', { category: categoryDevice(TECH) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { count: 2 });
  world.server.addEntry({ feedId: 2, title: 'Fetched by the refresh' });
  await world.hub.refreshingFeeds;
  assert.deepEqual(world.server.state.refreshed.sort(), [2, 3], 'the broken one too');
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['Fetched by the refresh'],
  );
  ack = await world.fake.sceneAction('refresh_feeds', {});
  assert.deepEqual(ack.data.outputs, { count: 3 });
  await world.hub.refreshingFeeds;
  const widget = await world.fake.widgetAction('unread', 'refresh', {}, { settings: {} });
  assert.equal(widget.success, true, widget.error);
  await world.hub.refreshingFeeds;
  assert.equal(world.server.state.refreshed.length, 8);
});

test('read the unread titles, of all or one category, and mark them as read', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  let ack = await world.fake.sceneAction('read_unread', { count: '3' });
  assert.equal(ack.data.outputs.count, 3);
  assert.equal(ack.data.outputs.unread, 5);
  assert.equal(
    ack.data.outputs.titles,
    [
      'Zigbee tips — Home Automation Blog',
      'Weather of the week — Flaky Feed',
      'Weather of the week — Example News',
    ].join('\n'),
  );
  assert.equal(ack.data.outputs.latest_title, 'Zigbee tips');
  assert.equal(ack.data.outputs.latest_feed, 'Home Automation Blog');
  ack = await world.fake.sceneAction('read_unread', {
    category: categoryDevice(NEWS),
    mark_read: true,
  });
  assert.equal(ack.data.outputs.count, 2);
  assert.equal(ack.data.outputs.latest_url, 'https://news.example.org/weather');
  ack = await world.fake.sceneAction('read_unread', { category: categoryDevice(NEWS) });
  assert.equal(ack.data.outputs.count, 0);
  assert.equal(ack.data.outputs.titles, '');
});

test('the widget: counts, the newest unread entries, two buttons', async (t) => {
  const world = await createWorld({ config: { url: 'https://rss.example.org', api_key: TOKEN } });
  t.after(() => world.app.stop());
  let content = (await world.fake.widgetGet('unread', { language: 'fr', settings: {} })).data
    .content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  const [unread, errors, list, refresh, read] = content.components;
  assert.deepEqual([unread.label, unread.value], ['Articles non lus', 5]);
  assert.deepEqual([errors.label, errors.value], ['Flux en erreur', 1]);
  assert.equal(list.items.length, 5);
  assert.equal(list.items[0].title, 'Zigbee tips');
  assert.match(list.items[0].subtitle, /^Home Automation Blog · 20 oct/);
  assert.equal(list.items[0].description, 'Pairing made easy.');
  // An http article link is left out; the link to Miniflux is https.
  assert.deepEqual(
    list.items[0].links.map((l) => l.url),
    ['https://rss.example.org/unread/entry/3'],
  );
  assert.equal(list.items[1].links[0].url, 'https://flaky.example.org/weather');
  assert.equal(refresh.action.key, 'refresh');
  assert.deepEqual(read.action, {
    key: 'mark_read',
    confirm: true,
    params: { entry_ids: '3,4,1,5,2' },
  });

  content = (
    await world.fake.widgetGet('unread', {
      language: 'en',
      settings: { category: categoryDevice(NEWS) },
    })
  ).data.content;
  assert.deepEqual([content.components[0].label, content.components[0].value], ['News', 2]);
  assert.equal(content.components[1].type, 'card-list', 'no feed in error in News');

  // An entry arrives after the widget was drawn: the tap leaves it unread.
  world.server.addEntry({ feedId: 1, title: 'Not seen yet' });
  const button = content.components.find((c) => c.action?.key === 'mark_read');
  const ack = await world.fake.widgetAction('unread', 'mark_read', button.action.params, {
    settings: { category: categoryDevice(NEWS) },
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(
    world.server.state.entries.filter((e) => e.status === 'unread').map((e) => e.title),
    ['Gladys 5.2 is out', 'Weather of the week', 'Zigbee tips', 'Not seen yet'],
  );
  world.server.state.entries.at(-1).status = 'read';
  await world.hub.refresh();
  content = (
    await world.fake.widgetGet('unread', {
      language: 'en',
      settings: { category: categoryDevice(NEWS) },
    })
  ).data.content;
  assert.equal(content.components[1].text, 'Nothing left to read.');
  assert.ok(!content.components.some((c) => c.action?.key === 'mark_read'), 'nothing to mark');
});

test('the widget Mark as read without the listed ids marks nothing', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetAction('unread', 'mark_read', {}, { settings: {} });
  assert.equal(ack.success, false);
  assert.equal(world.server.state.entries.filter((e) => e.status === 'unread').length, 5);
});

test('another Miniflux server is a new baseline, even for the same user id', async (t) => {
  const store = new MemoryStore();
  const server = createMiniflux();
  const first = await createWorld({ server, store });
  await first.app.stop();
  assert.equal(store.data.server, HOST);
  server.addEntry({ title: 'On the other server' });
  const second = await createWorld({
    server,
    store,
    config: { url: 'http://192.0.2.41:8080', api_key: TOKEN },
  });
  t.after(() => second.app.stop());
  assert.equal(second.fake.sceneEvents.length, 0);
});

test('a refused event does not turn the backlog of a new feed into news', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const publish = world.gladys.publishSceneEvent.bind(world.gladys);
  let down = true;
  world.gladys.publishSceneEvent = async (...args) => {
    if (down) {
      throw Object.assign(new Error('Gladys restarting'), { status: 503 });
    }
    return publish(...args);
  };
  world.server.addEntry({ feedId: 1, title: 'Real news' });
  const feed = world.server.addFeed({ title: 'Brand new' });
  world.server.addEntry({ feedId: feed.id, title: 'Backlog' });
  await world.hub.refresh();
  down = false;
  await world.hub.refresh();
  assert.deepEqual(
    events(world.fake).map((e) => e.data.title),
    ['Real news'],
  );
});

test('feed errors are passed on without the query string of a URL', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.server.breakFeed(
    2,
    'Get "https://blog.example.org/feed?key=s3cr3t": dial tcp: i/o timeout',
  );
  await world.hub.refresh();
  const [event] = events(world.fake, 'feed_error');
  assert.equal(event.data.error, 'Get "https://blog.example.org/feed": dial tcp: i/o timeout');
});

test('connection status: missing settings, refused key, down and back, not Miniflux', async (t) => {
  const world = await createWorld({ config: {} });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Enter the address/);
  await world.fake.configUpdated({ url: 'ftp://nope', api_key: TOKEN });
  assert.match(world.fake.connectionStatus.message.en, /not valid/);
  await world.fake.configUpdated({ url: HOST });
  assert.match(world.fake.connectionStatus.message.en, /API key/);
  await world.fake.configUpdated({ url: HOST, api_key: 'wrong' });
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /refusé la clé/);
  await world.fake.configUpdated({ url: HOST, api_key: TOKEN });
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.goDown();
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer/);
  const widget = (await world.fake.widgetGet('unread', { settings: {} })).data.content;
  assert.ok(widget.components.some((c) => /does not answer/.test(c.text ?? '')));
  world.server.goUp();
  await world.hub.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  world.server.state.html = true;
  await world.hub.refresh();
  assert.match(world.fake.connectionStatus.message.en, /does not answer like Miniflux/);
});

test('test_connection: who and how many', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(
    ack.data.message.fr,
    'Connecté à Miniflux en tant que admin : 5 article(s) non lu(s), 3 flux, dont 1 en erreur.',
  );
});

test('a new language renames the features at the next discovery', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.fake.configUpdated({ url: HOST, api_key: TOKEN, language: 'de' });
  assert.deepEqual(
    world.fake.discoveredDevices[0].features.map((f) => f.name),
    ['Ungelesene Artikel', 'Feeds mit Fehler'],
  );
});
