// What reaches `docker logs` at the default level (info): the lifecycle only.
// A normal cycle (reads, published states, events, polls) writes nothing at
// info, an outage logs one line, and its recovery one more.
//
// The SDK logger writes through console.log (debug, info) and console.error
// (warn, error), re-reading LOG_LEVEL on every call: the tests capture both.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOST, createMiniflux } from './helpers/fakeMiniflux.js';
import { createAll, createWorld } from './helpers/world.js';

function captureLogs(t) {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'debug';
  const captured = [];
  const record = (...args) => captured.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    if (previous === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = previous;
    }
  });
  return {
    all: () => [...captured],
    lines: () =>
      captured.filter((line) => !line.includes('[DEBUG]') && line.includes('[miniflux-')),
    reset: () => captured.splice(0),
  };
}

test('a normal cycle writes nothing at info: reads, states, events, polls', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createAll(world.fake);
  const start = logs.lines();
  assert.deepEqual(start.length, 1, start.join('\n'));
  assert.match(start[0], /Connected to Miniflux \(3 feeds, 5 unread\)/);
  logs.reset();
  for (let i = 0; i < 5; i += 1) {
    world.server.addEntry({ feedId: 1, title: `Article ${i}` });
    await world.hub.refresh();
  }
  world.server.breakFeed(1);
  await world.hub.refresh();
  await world.fake.poll(world.fake.discoveredDevices[0]);
  await world.fake.widgetGet('unread', { settings: {} });
  await world.fake.sceneAction('read_unread', {});
  assert.equal(world.fake.sceneEvents.length, 6, 'events were fired');
  assert.deepEqual(logs.lines(), [], 'nothing at info or above');
});

test('one line per change asked by the user, without titles', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  await world.fake.sceneAction('mark_category_read', {
    category: 'ext:test-integration:category:1_3',
  });
  await world.fake.sceneAction('read_unread', { count: '3', mark_read: true });
  const lines = logs.lines();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /\[INFO\].*Marked as read: a category \(3 entries\)/);
  assert.match(lines[1], /\[INFO\].*Read and marked as read: 2 entries/);
  assert.ok(!lines.join('\n').includes('Gladys 5.2'), 'no title is logged');
});

test('Miniflux down: one warning, nothing per attempt, one line when it is back', async (t) => {
  const logs = captureLogs(t);
  const world = await createWorld();
  t.after(() => world.app.stop());
  logs.reset();
  world.server.goDown();
  for (let i = 0; i < 4; i += 1) {
    await world.hub.refresh();
  }
  const down = logs.lines();
  assert.equal(down.length, 1, down.join('\n'));
  assert.match(down[0], /\[WARN\].*Miniflux unreachable \(ECONNREFUSED\)/);
  logs.reset();
  world.server.goUp();
  await world.hub.refresh();
  const back = logs.lines();
  assert.equal(back.length, 1, back.join('\n'));
  assert.match(back[0], /\[INFO\].*Miniflux answers again \(3 feeds, 5 unread\)/);
});

test('the API key never reaches the logs', async (t) => {
  const logs = captureLogs(t);
  for (const token of ['s3cr3t-wrong-key', 'test-api-key-0123456789abcdef']) {
    const world = await createWorld({
      server: createMiniflux(),
      config: { url: HOST, api_key: token },
    });
    await world.hub.refresh();
    await world.app.stop();
  }
  const all = logs.all().join('\n');
  for (const secret of ['s3cr3t-wrong-key', 'test-api-key-0123456789abcdef']) {
    assert.ok(!all.includes(secret), secret);
  }
});
