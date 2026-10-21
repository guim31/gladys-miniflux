// -----------------------------------------------------------------------------
// The "Miniflux" dashboard widget: the unread count (and the feeds in error),
// the newest unread entries, a "Refresh" button and a "Mark as read" button
// (with a confirmation). Set to a category device, the widget shows and marks
// that category only.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { CommandError, WIDGET_KEY } from './hub.js';
import { DONE_TEXT, NAMES, each, pick } from './texts.js';

export const MAX_ITEMS = 6;
export const ACTIONS = { read: 'mark_read', refresh: 'refresh' };

export const TEXT = {
  read: { en: 'Mark as read', fr: 'Marquer lu', de: 'Als gelesen', es: 'Marcar leído' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  open: {
    en: 'Read the article',
    fr: "Lire l'article",
    de: 'Artikel lesen',
    es: 'Leer el artículo',
  },
  open_miniflux: {
    en: 'Open in Miniflux',
    fr: 'Ouvrir dans Miniflux',
    de: 'In Miniflux öffnen',
    es: 'Abrir en Miniflux',
  },
  starred: { en: 'Starred', fr: 'Favori', de: 'Favorit', es: 'Favorito' },
  empty: {
    en: 'Nothing left to read.',
    fr: 'Plus rien à lire.',
    de: 'Nichts mehr zu lesen.',
    es: 'No queda nada por leer.',
  },
  unavailable: {
    en: 'Miniflux does not answer right now.',
    fr: 'Miniflux ne répond pas pour le moment.',
    de: 'Miniflux antwortet gerade nicht.',
    es: 'Miniflux no responde en este momento.',
  },
  waiting: {
    en: 'Waiting for Miniflux: check the configuration of the integration.',
    fr: "En attente de Miniflux : vérifiez la configuration de l'intégration.",
    de: 'Warte auf Miniflux: Prüfe die Konfiguration der Integration.',
    es: 'Esperando a Miniflux: compruebe la configuración de la integración.',
  },
};

const cut = (text, max) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const https = (url) => typeof url === 'string' && /^https:\/\//i.test(url) && url.length <= 2000;

function shortDate(iso, language) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleDateString(
    { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'en-GB',
    { day: 'numeric', month: 'short' },
  );
}

/** One row of the list. */
export function entryItem(entry, language, baseUrl) {
  const item = {
    title: cut(entry.title, 60),
    subtitle: cut(
      [entry.feed, shortDate(entry.published, language)].filter(Boolean).join(' · '),
      60,
    ),
  };
  if (entry.starred) {
    item.badge = { text: pick(TEXT.starred, language), color: WIDGET_COLORS.WARNING };
  }
  if (entry.summary) {
    item.description = cut(entry.summary, 600);
  }
  const links = [];
  // The links of a card must be https: an http article or Miniflux is left out.
  if (https(entry.url)) {
    links.push({ url: entry.url, label: pick(TEXT.open, language) });
  }
  if (https(baseUrl) && entry.id) {
    links.push({
      url: `${baseUrl}/unread/entry/${entry.id}`,
      label: pick(TEXT.open_miniflux, language),
    });
  }
  if (links.length > 0) {
    item.links = links;
  }
  return item;
}

export async function buildContent(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.loaded) {
    return {
      ttl_seconds: 60,
      components: [{ type: 'text', variant: 'body', text: pick(TEXT.waiting, language) }],
    };
  }
  const names = pick(NAMES, language);
  const scope = hub.scopeOf(settings?.category);
  // A category gone from Miniflux shows the whole account, without the
  // "Mark as read" button (it would not mark what the widget shows).
  const category = scope ?? undefined;
  const components = [
    {
      type: 'value',
      label: cut(category ? category.name : names.unread, 24),
      value: category ? category.unread : hub.counters.unread,
      icon: 'inbox',
    },
  ];
  const errors = category
    ? hub.feeds.filter((f) => f.categoryId === category.id && f.errorCount > 0 && !f.disabled)
        .length
    : hub.counters.errors;
  if (errors > 0) {
    components.push({
      type: 'value',
      label: names.errors,
      value: errors,
      icon: 'alert-triangle',
      color: WIDGET_COLORS.DANGER,
    });
  }
  const entries = await hub.widgetEntries(category, MAX_ITEMS);
  if (entries === null) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.unavailable, language) });
  } else if (entries.length === 0) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.empty, language) });
  } else {
    components.push({
      type: 'card-list',
      display: 'list',
      items: entries.map((e) => entryItem(e, language, hub.config.url ?? '')),
    });
  }
  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.refresh },
  });
  if (scope !== null && (category ? category.unread : hub.counters.unread) > 0) {
    components.push({
      type: 'button',
      label: pick(TEXT.read, language),
      icon: 'check-circle',
      style: 'secondary',
      action: { key: ACTIONS.read, confirm: true },
    });
  }
  // The hub nudges the widget after every read and every change.
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey, settings }) {
  const language = hub.language;
  try {
    if (actionKey === ACTIONS.refresh) {
      await hub.refreshFeeds();
      return { message: each(DONE_TEXT, 'refresh') };
    }
    if (actionKey === ACTIONS.read) {
      // The category set in the widget (an error when it is gone), or everything.
      await hub.markRead(settings?.category);
      return { message: each(DONE_TEXT, 'read') };
    }
  } catch (err) {
    if (err instanceof CommandError) {
      throw new Error(pick(err.messages, language), { cause: err });
    }
    throw err;
  }
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    get: (hub, request) => buildContent(hub, request),
    action,
  },
};
