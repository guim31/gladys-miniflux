// -----------------------------------------------------------------------------
// Miniflux -> Gladys devices:
// - one "Miniflux" device per user (`miniflux:<user id>`, the owner of the
//   API key): unread entries, feeds in error;
// - one device per category (`category:<user id>_<category id>`): its unread
//   entries. Every category is offered in Discovery; the user adds the ones
//   they care about.
// Everything is read only: entries are marked as read through the scene
// actions and the widget buttons, never through a device feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
} from '@gladysassistant/integration-sdk';
import { NAMES, pick } from './texts.js';

export const MINIFLUX_TYPE = 'miniflux';
export const CATEGORY_TYPE = 'category';
// Gladys keeps every discovered device in its list: a server with hundreds
// of categories offers the first ones only.
export const MAX_CATEGORIES = 100;

const MAX_COUNT = 10_000_000;

export const minifluxIds = (gladys, userId) => gladys.externalIds(MINIFLUX_TYPE, String(userId));
export const categoryIds = (gladys, userId, categoryId) =>
  gladys.externalIds(CATEGORY_TYPE, `${userId}_${categoryId}`);

const counter = (name, externalId) => ({
  name,
  external_id: externalId,
  category: CAT.COUNTER_SENSOR,
  type: TYPE.SENSOR.INTEGER,
  read_only: true,
  has_feedback: false,
  min: 0,
  max: MAX_COUNT,
  keep_history: true,
});

/**
 * @param {object} gladys
 * @param {{ id: number, name: string }} user
 * @param {string} language
 * @param {string} url Miniflux base URL (a device param, shown in Gladys)
 */
export function buildMinifluxDevice(gladys, user, language, url) {
  const names = pick(NAMES, language);
  const ids = minifluxIds(gladys, user.id);
  return {
    name: 'Miniflux',
    external_id: ids.device,
    model: 'Miniflux',
    should_poll: false,
    features: [
      counter(names.unread, ids.feature('unread')),
      counter(names.errors, ids.feature('errors')),
    ],
    params: [
      { name: 'MINIFLUX_URL', value: url },
      { name: 'MINIFLUX_USER', value: user.name.slice(0, 100) },
    ],
  };
}

/**
 * @param {object} gladys
 * @param {number} userId
 * @param {{ id: number, name: string }} category
 * @param {string} language
 */
export function buildCategoryDevice(gladys, userId, category, language) {
  const ids = categoryIds(gladys, userId, category.id);
  return {
    name: category.name.slice(0, 100),
    external_id: ids.device,
    model: 'Miniflux category',
    should_poll: false,
    features: [counter(pick(NAMES, language).unread, ids.feature('unread'))],
    params: [{ name: 'MINIFLUX_CATEGORY_ID', value: String(category.id) }],
  };
}

/** @param {{ unread: number, errors: number }} counters */
export function buildMinifluxStates(gladys, userId, counters) {
  const ids = minifluxIds(gladys, userId);
  return ['unread', 'errors'].map((key) => ({
    device_feature_external_id: ids.feature(key),
    state: counters[key],
  }));
}

export function buildCategoryStates(gladys, userId, category) {
  return [
    {
      device_feature_external_id: categoryIds(gladys, userId, category.id).feature('unread'),
      state: category.unread,
    },
  ];
}

/**
 * `ext:...:miniflux:<user>` -> { kind: 'miniflux', user }, and
 * `ext:...:category:<user>_<id>` -> { kind: 'category', user, categoryId };
 * null when not ours.
 */
export function parseExternalId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const kind of [MINIFLUX_TYPE, CATEGORY_TYPE]) {
    const prefix = gladys.externalId(`${kind}:`);
    if (!externalId.startsWith(prefix)) {
      continue;
    }
    const id = externalId.slice(prefix.length).split(':')[0];
    if (kind === MINIFLUX_TYPE) {
      const user = Number(id);
      return id !== '' && Number.isInteger(user) ? { kind, user } : null;
    }
    const [user, categoryId] = id.split('_').map(Number);
    if (!Number.isInteger(user) || !Number.isInteger(categoryId) || id.split('_').length !== 2) {
      return null;
    }
    return { kind, user, categoryId };
  }
  return null;
}
