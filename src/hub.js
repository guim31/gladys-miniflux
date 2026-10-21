// -----------------------------------------------------------------------------
// The hub: the link to one Miniflux account and everything Gladys sees of it
// — the devices, their states, the connection status, the scene events, and
// the entries marked as read from scenes and from the widget.
//
// Miniflux pushes nothing: the container reads it every `refresh_minutes`
// (5 by default) on its own timer (should_poll: false). A read is four small
// requests: the categories, the feeds (with their parsing errors), the unread
// counters per feed, and the entries that arrived since the previous read
// (`after_entry_id`). The user is read once.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  MAX_CATEGORIES,
  buildCategoryDevice,
  buildCategoryStates,
  buildMinifluxDevice,
  buildMinifluxStates,
  categoryIds,
  minifluxIds,
  parseExternalId,
} from './devices.js';
import { MinifluxClient, MinifluxError } from './miniflux/client.js';
import {
  inError,
  matchKeyword,
  parseIds,
  summarizeEntry,
  summarizeFeed,
} from './miniflux/model.js';
import { MemoryStore } from './store.js';
import { STATUS_TEXT, TEST_TEXT, commandMessage } from './texts.js';

const logger = createLogger({ name: 'miniflux-hub' });

export const WIDGET_KEY = 'unread';
export const TRIGGERS = { entry: 'new_entry', feedError: 'feed_error' };

export const DEFAULT_TIMINGS = {
  // requestWidgetRefresh is dropped by the core beyond one call per 10 s.
  widgetGap: 10_500,
  // An unchanged value is sent again before Gladys calls it stale (48 h).
  heartbeat: 6 * 3_600_000,
  requestTimeout: 15_000,
  // How long the entries read for a widget are reused.
  widgetCache: 60_000,
  // "Refresh the feeds" only queues them in Miniflux: read it again after that.
  afterRefresh: 30_000,
};

// The entries asked since the previous read: past that many (an import, a
// long outage), the oldest are recorded as seen without being announced.
export const NEW_PAGE = 50;
// Past that many events in one read, the rest is recorded as seen without firing.
export const MAX_EVENTS_PER_READ = 10;
// Reads after which an event Gladys keeps refusing is given up.
export const MAX_TRIES = 3;
export const MAX_READ = 10;

/** An Error carrying a coded, multi-language message. */
export class CommandError extends Error {
  constructor(code, language, values) {
    const messages = commandMessage(code, values);
    super(messages[language] ?? messages.en);
    this.code = code;
    this.messages = messages;
  }
}

const linkOf = (config) => JSON.stringify([config.url, config.token]);
const ints = (list) => (Array.isArray(list) ? list.filter(Number.isInteger) : []);

export class Hub {
  constructor({ gladys, fetch, timings, now = Date.now, store }) {
    this.gladys = gladys;
    this.fetch = fetch;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.store = store ?? new MemoryStore();
    this.config = {
      url: null,
      urlInvalid: false,
      token: '',
      refreshMinutes: 5,
      keywords: [],
      language: 'fr',
    };
    this.client = null;
    /** the owner of the API key: { id, name } */
    this.user = null;
    /** [{ id, name, unread }] */
    this.categories = [];
    /** [{ id, title, site, categoryId, category, errorCount, error, unread }] */
    this.feeds = [];
    /** { unread, errors, feeds } */
    this.counters = null;
    /** null (fine), or the kind of the last failure */
    this.failure = null;
    this.announced = false;
    this.lastStatus = '';
    /** what the triggers already saw: { user, lastId, feeds, errors } */
    this.seen = null;
    /** event id -> reads at which Gladys refused it */
    this.retries = new Map();
    this.eventFailing = false;
    this.devicesFailing = false;
    this.publishFailing = false;
    this.widgetLists = new Map();
    this.configuring = Promise.resolve();
    this.refreshTimer = null;
    this.laterTimer = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this.widgetRefreshAt = 0;
    this.widgetTimer = null;
    this.stopped = false;
  }

  get language() {
    return this.config.language;
  }

  get loaded() {
    return this.counters !== null;
  }

  async start(config) {
    const saved = await this.store.load();
    // A damaged file is a new baseline, not a crash on every read.
    this.seen =
      Number.isInteger(saved.user) && Number.isInteger(saved.lastId) && saved.lastId >= 0
        ? {
            user: saved.user,
            lastId: saved.lastId,
            feeds: ints(saved.feeds),
            errors: ints(saved.errors),
          }
        : null;
    await this.reconfigure(config);
  }

  /** One configuration change at a time: a second one waits for the first. */
  reconfigure(config) {
    const run = this.configuring.then(() => this.#reconfigure(config));
    this.configuring = run.catch(() => {});
    return run;
  }

  async #reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const linkChanged = linkOf(previous) !== linkOf(config) || !this.client;
    if (linkChanged || previous.refreshMinutes !== config.refreshMinutes) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (linkChanged) {
      this.client = null;
      this.user = null;
      this.categories = [];
      this.feeds = [];
      this.counters = null;
      this.failure = null;
      this.announced = false;
      this.widgetLists.clear();
      if (config.url && config.token) {
        this.client = new MinifluxClient({
          url: config.url,
          token: config.token,
          fetch: this.fetch,
          timeout: this.timings.requestTimeout,
        });
      }
    }
    if (this.client && !this.refreshTimer) {
      this.refreshTimer = setInterval(
        () => this.refresh().catch((err) => logger.error('Read failed', err)),
        config.refreshMinutes * 60_000,
      );
      this.refreshTimer.unref?.();
    }
    if (linkChanged) {
      await this.refresh();
    } else {
      // Language, keywords or interval only: same data, new names and texts.
      this.gladys.forgetPublishedStates?.();
      this.widgetLists.clear();
      await this.#update();
    }
    await this.updateConnectionStatus();
  }

  /** Gladys reconnected (it may have restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.lastStatus = '';
    await this.reconfigure(config);
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.laterTimer);
    clearTimeout(this.widgetTimer);
    this.refreshTimer = null;
    await this.store.flush();
  }

  // --- Reading Miniflux -----------------------------------------------------

  /** Read Miniflux (one read at a time; a request during it runs once after). */
  refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        try {
          await this.#refreshOnce();
        } catch (err) {
          // Never ends the loop: a read queued meanwhile (new address) still runs.
          logger.error('Read failed', err);
        }
      } while (this.refreshAgain && !this.stopped);
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** A read a little later (after "Refresh the feeds"), once. */
  refreshLater(delay = this.timings.afterRefresh) {
    clearTimeout(this.laterTimer);
    this.laterTimer = setTimeout(() => {
      this.laterTimer = null;
      if (!this.stopped) {
        this.refresh().catch(() => {});
      }
    }, delay);
    this.laterTimer.unref?.();
  }

  async #refreshOnce() {
    const client = this.client;
    if (this.stopped) {
      return;
    }
    if (!client) {
      await this.publishDevices();
      return;
    }
    let user;
    let categories;
    let feeds;
    let unreads;
    let recent;
    try {
      user = this.user ?? (await client.me());
      const known = this.seen?.user === user.id ? this.seen : null;
      [categories, feeds, unreads, recent] = await Promise.all([
        client.categories(),
        client.feeds(),
        client.unreadCounters(),
        // The first read only needs the newest id: the baseline.
        known
          ? client.entries({ afterId: known.lastId, limit: NEW_PAGE })
          : client.entries({ limit: 1 }),
      ]);
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.#fail(err);
      await this.updateConnectionStatus();
      return;
    }
    if (client !== this.client || this.stopped) {
      return;
    }
    this.user = { id: user.id, name: user.username || user.name || String(user.id) };
    const unreadOf = (id) => {
      const n = Number(unreads[String(id)]);
      return Number.isInteger(n) && n > 0 ? n : 0;
    };
    this.feeds = feeds
      .filter((f) => Number.isInteger(f?.id))
      .map((f) => ({ ...summarizeFeed(f), unread: unreadOf(f.id) }));
    this.categories = categories
      .filter((c) => Number.isInteger(c?.id))
      .map((c) => ({
        id: c.id,
        name: (typeof c.title === 'string' && c.title.trim()) || String(c.id),
        unread: this.feeds.filter((f) => f.categoryId === c.id).reduce((s, f) => s + f.unread, 0),
      }));
    this.counters = {
      unread: this.feeds.reduce((sum, f) => sum + f.unread, 0),
      errors: this.feeds.filter(inError).length,
      feeds: this.feeds.length,
    };
    this.widgetLists.clear();
    this.#recover();
    await this.#update();
    if (client !== this.client || this.stopped || !this.user) {
      return; // the configuration changed meanwhile
    }
    await this.#announce(recent);
    await this.updateConnectionStatus();
  }

  /** Devices, states and widget from the last read. */
  async #update() {
    await this.publishDevices();
    await this.publishStates();
    this.refreshWidget();
  }

  #fail(err) {
    const kind = err instanceof MinifluxError ? err.kind : 'unreachable';
    if (this.failure === null) {
      logger.warn(`Miniflux: ${err.message}`);
    } else {
      logger.debug(`Miniflux still failing: ${err.message}`);
    }
    this.failure = kind;
    if (kind === 'unauthorized' || kind === 'invalid' || kind === 'not_found') {
      // Another key may belong to another user.
      this.user = null;
    }
  }

  #recover() {
    const { unread, feeds } = this.counters;
    if (this.failure !== null) {
      logger.info(`Miniflux answers again (${feeds} feeds, ${unread} unread)`);
    } else if (!this.announced) {
      logger.info(`Connected to Miniflux (${feeds} feeds, ${unread} unread)`);
    }
    this.announced = true;
    this.failure = null;
  }

  // --- Scene events ---------------------------------------------------------

  /**
   * Fire the entries that arrived since the last read, and the feeds that
   * fell in error. The first read of a Miniflux user is a silent baseline:
   * installing the integration announces nothing already there. Neither are
   * the entries of a feed added since the previous read (its backlog).
   * @param {{ total: number, entries: object[] }} recent
   */
  async #announce(recent) {
    const userId = this.user.id;
    const known = this.seen?.user === userId ? this.seen : null;
    const feedIds = this.feeds.map((f) => f.id);
    const errorsNow = this.feeds.filter(inError).map((f) => f.id);
    const ids = recent.entries.map((e) => e.id).filter(Number.isInteger);
    let lastId = Math.max(known?.lastId ?? 0, ...ids);
    let errors = errorsNow;
    if (known) {
      const knownFeeds = new Set(known.feeds);
      const entries = recent.entries
        .filter((e) => Number.isInteger(e?.id) && e.id > known.lastId)
        .sort((a, b) => a.id - b.id)
        .map(summarizeEntry);
      const fresh = entries.filter((e) => e.status === 'unread' && knownFeeds.has(e.feedId));
      if (recent.total > NEW_PAGE || fresh.length > MAX_EVENTS_PER_READ) {
        logger.info(
          `${Math.max(recent.total, fresh.length)} new entries at once: ${MAX_EVENTS_PER_READ} announced at most`,
        );
      }
      // The newest ones: the oldest of a burst are the least worth a message.
      for (const entry of fresh.slice(-MAX_EVENTS_PER_READ)) {
        const outcome = await this.#fire(
          TRIGGERS.entry,
          `entry:${entry.id}`,
          this.#entryData(entry),
        );
        if (outcome === 'retry') {
          lastId = entry.id - 1;
          break;
        }
      }
      const failing = [];
      const before = new Set(known.errors);
      for (const feed of this.feeds.filter((f) => inError(f) && !before.has(f.id))) {
        if (!knownFeeds.has(feed.id)) {
          continue; // a feed added already broken: the user just saw the error
        }
        const outcome = await this.#fire(
          TRIGGERS.feedError,
          `feed:${feed.id}`,
          this.#feedData(feed),
        );
        if (outcome === 'retry') {
          failing.push(feed.id);
        }
      }
      // A refused event is fired again at the next read.
      errors = errorsNow.filter((id) => !failing.includes(id));
    }
    const next = { user: userId, lastId, feeds: feedIds, errors };
    if (JSON.stringify(next) !== JSON.stringify(this.seen)) {
      this.seen = next;
      await this.store.save(next);
    }
  }

  /** @returns {Promise<'sent' | 'retry' | 'dropped'>} */
  async #fire(key, id, data) {
    logger.debug(`${key}: ${id}`);
    try {
      await this.gladys.publishSceneEvent(key, data);
      if (this.eventFailing) {
        logger.info('Scene events accepted again');
      }
      this.eventFailing = false;
      this.retries.delete(id);
      return 'sent';
    } catch (err) {
      if (this.eventFailing) {
        logger.debug(`Cannot fire ${key}: ${err.message}`);
      } else {
        logger.warn(`Cannot fire ${key}: ${err.message}`);
      }
      this.eventFailing = true;
      // A refusal for good (4xx but 429) is not retried: it would be refused
      // at every read. Otherwise (Gladys restarting), it is fired again at the
      // next read, up to MAX_TRIES reads.
      const status = err?.status;
      const final = Number.isInteger(status) && status >= 400 && status < 500 && status !== 429;
      const tries = (this.retries.get(id) ?? 0) + 1;
      if (!final && tries < MAX_TRIES) {
        this.retries.set(id, tries);
        return 'retry';
      }
      this.retries.delete(id);
      if (!final) {
        logger.warn(`${key} ${id} given up: Gladys refused it ${tries} times`);
      }
      return 'dropped';
    }
  }

  #categoryDevice(categoryId) {
    return Number.isInteger(categoryId)
      ? categoryIds(this.gladys, this.user.id, categoryId).device
      : '';
  }

  #entryData(entry) {
    const feed = this.feeds.find((f) => f.id === entry.feedId);
    const categoryId = feed?.categoryId ?? entry.categoryId;
    return {
      // The filters of the trigger: the category device, as picked in the
      // editor; the feed title; the first keyword of the configuration found.
      category: this.#categoryDevice(categoryId),
      feed: feed?.title ?? entry.feed,
      keyword: matchKeyword(entry.title, this.config.keywords),
      title: entry.title,
      url: entry.url.slice(0, 1000),
      category_name: feed?.category ?? entry.category,
      author: entry.author,
      published: entry.published,
      entry_id: entry.id,
    };
  }

  #feedData(feed) {
    return {
      category: this.#categoryDevice(feed.categoryId),
      feed: feed.title,
      category_name: feed.category,
      error: feed.error,
      error_count: feed.errorCount,
      site: feed.site,
      feed_id: feed.id,
    };
  }

  // --- Devices and states ---------------------------------------------------

  #isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  buildDevices() {
    if (!this.user || !this.counters) {
      return [];
    }
    return [
      buildMinifluxDevice(this.gladys, this.user, this.language, this.config.url ?? ''),
      ...this.categories
        .slice(0, MAX_CATEGORIES)
        .map((c) => buildCategoryDevice(this.gladys, this.user.id, c, this.language)),
    ];
  }

  async publishDevices() {
    if (this.stopped) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(this.buildDevices());
    } catch (err) {
      if (this.devicesFailing) {
        logger.debug(`Cannot publish the devices: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the devices: ${err.message}`);
      }
      this.devicesFailing = true;
      return;
    }
    this.devicesFailing = false;
  }

  /**
   * The states of the devices the user added (Gladys drops the others).
   * @param {string} [justCreated] the external id of a device just added
   */
  async publishStates(justCreated) {
    if (!this.user || !this.counters || this.stopped) {
      return;
    }
    const created = (id) => id === justCreated || this.#isCreated(id);
    const userId = this.user.id;
    const states = [];
    if (created(minifluxIds(this.gladys, userId).device)) {
      states.push(...buildMinifluxStates(this.gladys, userId, this.counters));
    }
    for (const category of this.categories.slice(0, MAX_CATEGORIES)) {
      if (created(categoryIds(this.gladys, userId, category.id).device)) {
        states.push(...buildCategoryStates(this.gladys, userId, category));
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeat });
    } catch (err) {
      if (this.publishFailing) {
        logger.debug(`Cannot publish the states: ${err.message}`);
      } else {
        logger.warn(`Cannot publish the states: ${err.message}`);
      }
      this.publishFailing = true;
      return;
    }
    if (this.publishFailing) {
      logger.info('States published again');
    }
    this.publishFailing = false;
  }

  #ours(device) {
    const parsed = parseExternalId(this.gladys, device?.external_id);
    return parsed !== null && parsed.user === this.user?.id;
  }

  /** The user added a device: states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.#ours(device)) {
      return;
    }
    this.gladys.forgetPublishedStates?.(device.external_id);
    await this.publishStates(device.external_id);
    this.refreshWidget();
  }

  /** onPoll (the devices are not polled: the container reads on its timer). */
  async poll(device) {
    if (this.#ours(device)) {
      await this.publishStates(device.external_id);
    }
  }

  // --- Widget ---------------------------------------------------------------

  /** Nudge the open dashboards, with a trailing call inside the core's 10 s gap. */
  refreshWidget() {
    if (this.stopped) {
      return;
    }
    const wait = this.widgetRefreshAt + this.timings.widgetGap - this.now();
    if (wait <= 0) {
      this.widgetRefreshAt = this.now();
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
      return;
    }
    if (!this.widgetTimer) {
      this.widgetTimer = setTimeout(() => {
        this.widgetTimer = null;
        this.refreshWidget();
      }, wait);
      this.widgetTimer.unref?.();
    }
  }

  /**
   * What a device picked in a widget setting or a scene field designates:
   * undefined (nothing picked, or the Miniflux device: everything), a
   * category of the last read, or null (not ours, or a category gone).
   */
  scopeOf(externalId) {
    if (externalId === undefined || externalId === null || externalId === '') {
      return undefined;
    }
    const parsed = parseExternalId(this.gladys, externalId);
    if (!parsed || parsed.user !== this.user?.id) {
      return null;
    }
    if (parsed.kind === 'miniflux') {
      return undefined;
    }
    return this.categories.find((c) => c.id === parsed.categoryId) ?? null;
  }

  /**
   * The newest unread entries, of every category or of one, read on demand
   * and reused a minute. Null when Miniflux cannot be read.
   * @param {{ id: number } | undefined} category
   */
  async widgetEntries(category, count) {
    if (!this.loaded || this.failure !== null) {
      return null;
    }
    const key = category?.id ?? 'all';
    const cached = this.widgetLists.get(key);
    if (cached && this.now() - cached.at < this.timings.widgetCache) {
      return cached.entries.slice(0, count);
    }
    const client = this.client;
    try {
      const page = await client.entries({
        status: 'unread',
        categoryId: category?.id,
        order: 'published_at',
        limit: count,
      });
      const entries = page.entries.map(summarizeEntry);
      if (client === this.client) {
        this.widgetLists.set(key, { at: this.now(), entries });
      }
      return entries;
    } catch (err) {
      logger.debug(`Widget list not read: ${err.message}`);
      return null;
    }
  }

  // --- Connection status ----------------------------------------------------

  statusKey() {
    if (this.config.urlInvalid) {
      return 'invalid';
    }
    if (!this.config.url) {
      return 'none';
    }
    if (!this.config.token) {
      return 'token';
    }
    if (this.failure) {
      return (
        {
          unauthorized: 'unauthorized',
          invalid: 'invalid_answer',
          not_found: 'invalid_answer',
          http: 'error',
          rejected: 'error',
        }[this.failure] ?? 'unreachable'
      );
    }
    return null;
  }

  statusMessage() {
    const key = this.statusKey();
    return key ? this.#statusOf(key) : null;
  }

  #statusOf(key) {
    return Object.fromEntries(
      Object.entries(STATUS_TEXT).map(([language, table]) => [language, table[key]]),
    );
  }

  async updateConnectionStatus() {
    if (this.stopped) {
      return;
    }
    // Nothing to say before the first answer or failure.
    if (this.client && !this.loaded && this.failure === null) {
      return;
    }
    const message = this.statusMessage();
    const connected = Boolean(this.client) && this.loaded && this.failure === null;
    const fingerprint = JSON.stringify({ connected, message });
    if (fingerprint === this.lastStatus) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message ?? undefined);
      // Recorded once Gladys took it: a failed call is sent again next time.
      this.lastStatus = fingerprint;
    } catch (err) {
      logger.warn(`Cannot set the connection status: ${err.message}`);
    }
  }

  // --- Actions --------------------------------------------------------------

  /** "Test the connection": a fresh read, then its outcome. */
  async testReport() {
    if (!this.client) {
      return this.statusMessage();
    }
    await this.refresh();
    const message = this.statusMessage();
    if (message) {
      return message;
    }
    if (!this.loaded || !this.user) {
      // The configuration changed during the test: nothing read yet.
      return this.#statusOf('unreachable');
    }
    const { unread, feeds, errors } = this.counters;
    return Object.fromEntries(
      Object.entries(TEST_TEXT).map(([language, render]) => [
        language,
        render(this.user.name, unread, feeds, errors),
      ]),
    );
  }

  /** The client and the user, or a coded error (not configured, never read). */
  async #ready() {
    const client = this.client;
    if (!client) {
      throw new CommandError('unreachable', this.language);
    }
    if (!this.user) {
      await this.refresh();
    }
    if (!this.user || client !== this.client) {
      throw this.#commandError(new MinifluxError(this.failure ?? 'unreachable', ''), 'read');
    }
    return client;
  }

  /** A device picked in a scene or a widget -> undefined (all) or a category. */
  #scopeOrFail(externalId) {
    const scope = this.scopeOf(externalId);
    if (scope === null) {
      throw new CommandError('category', this.language);
    }
    return scope;
  }

  /**
   * Mark every unread entry of a category (or of the whole account) as read.
   * @param {unknown} target the external id of a device of the integration
   * @returns {Promise<{ count: number, category: string }>}
   */
  async markRead(target) {
    const client = await this.#ready();
    const scope = this.#scopeOrFail(target);
    const count = scope ? scope.unread : this.counters.unread;
    try {
      if (scope) {
        await client.markCategoryRead(scope.id);
      } else {
        await client.markAllRead(this.user.id);
      }
    } catch (err) {
      if (err instanceof MinifluxError && err.kind === 'not_found') {
        throw new CommandError('category', this.language);
      }
      throw this.#commandError(err, 'http');
    }
    logger.info(`Marked as read: ${scope ? 'a category' : 'everything'} (${count} entries)`);
    await this.refresh();
    return { count, category: scope?.name ?? '' };
  }

  /**
   * @param {unknown} raw entry ids, "12" or "12, 13"
   * @returns {Promise<{ count: number }>}
   */
  async markEntries(raw) {
    const ids = parseIds(raw);
    if (!ids) {
      throw new CommandError('ids', this.language);
    }
    const client = await this.#ready();
    try {
      await client.markEntriesRead(ids);
    } catch (err) {
      throw this.#commandError(err, 'http');
    }
    logger.info(`Marked as read: ${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}`);
    await this.refresh();
    return { count: ids.length };
  }

  /** "Refresh the feeds": queued in Miniflux, read again a little later. */
  async refreshFeeds() {
    const client = await this.#ready();
    try {
      await client.refreshFeeds();
    } catch (err) {
      throw this.#commandError(err, 'http');
    }
    logger.info('Feed refresh asked');
    this.refreshLater();
  }

  /**
   * The newest unread entries, of every category or of one, read now.
   * @param {{ category?: unknown, count?: unknown, markRead?: unknown }} request
   * @returns {Promise<{ entries: object[], total: number }>}
   */
  async readUnread({ category, count, markRead }) {
    const client = await this.#ready();
    const scope = this.#scopeOrFail(category);
    const wanted = Math.min(Math.max(Math.round(Number(count)) || 5, 1), MAX_READ);
    let page;
    try {
      page = await client.entries({
        status: 'unread',
        categoryId: scope?.id,
        order: 'published_at',
        limit: wanted,
      });
    } catch (err) {
      throw this.#commandError(err, 'read');
    }
    const entries = page.entries.map(summarizeEntry);
    if ((markRead === true || markRead === 'true') && entries.length > 0) {
      try {
        await client.markEntriesRead(entries.map((e) => e.id));
      } catch (err) {
        throw this.#commandError(err, 'http');
      }
      logger.info(`Read and marked as read: ${entries.length} entries`);
      await this.refresh();
    }
    return { entries, total: page.total };
  }

  #commandError(err, fallback) {
    if (err instanceof CommandError) {
      return err;
    }
    const kind = err instanceof MinifluxError ? err.kind : 'unreachable';
    const detail = err.message.replace(/^[^:]*: /, '');
    if (kind === 'unauthorized') {
      return new CommandError('unauthorized', this.language);
    }
    if (kind === 'timeout' && fallback === 'http') {
      // The request may have reached Miniflux: the change may be done.
      return new CommandError('timeout', this.language);
    }
    if (kind === 'unreachable' || kind === 'timeout') {
      return new CommandError('unreachable', this.language);
    }
    return new CommandError(fallback, this.language, { detail });
  }
}
