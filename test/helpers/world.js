// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys (a real GladysIntegration on an
// in-memory transport), the integration wired on it by registerHandlers, and
// a fake Miniflux.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { MemoryStore } from '../../src/store.js';
import { HOST, NOW, TOKEN, createMiniflux, settle } from './fakeMiniflux.js';

export const FAST_TIMINGS = { widgetGap: 0, requestTimeout: 200, feedRefreshTimeout: 200 };

export async function createWorld({
  server = createMiniflux(),
  config = { url: HOST, api_key: TOKEN },
  devices = [],
  connect = true,
  store = new MemoryStore(),
  clock = { now: NOW },
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    fetch: server.fetch,
    timings: FAST_TIMINGS,
    now: () => clock.now,
    store,
  });
  if (connect) {
    await gladys.connect();
    await settle(20);
  }
  return { gladys, app, hub: app.hub, server, store, clock, fake: gladys.fake };
}

// The Miniflux user of the fixtures, and the ids of its devices.
export const USER = 1;
export const mainDevice = `ext:test-integration:miniflux:${USER}`;
export const mainFeature = (key) => `${mainDevice}:${key}`;
export const categoryDevice = (id) => `ext:test-integration:category:${USER}_${id}`;

/** Add every discovered device to Gladys, as the user would. */
export async function createAll(fake) {
  for (const device of fake.discoveredDevices) {
    await fake.deviceCreated(device);
  }
  await settle();
}
