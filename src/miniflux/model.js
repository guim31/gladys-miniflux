// -----------------------------------------------------------------------------
// Miniflux answers -> the small, bounded objects the rest of the code uses.
// Pure functions. Nothing here keeps a feed URL: it may carry a private token
// (`?key=...`), and the embedded feed of an entry carries its credentials.
// -----------------------------------------------------------------------------

const str = (value, max = 1000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** The text of an HTML fragment: tags dropped, common entities decoded, spaces folded. */
export function plainText(html, max = 2000) {
  if (typeof html !== 'string') {
    return '';
  }
  return html
    .slice(0, 50_000)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
      if (code[0] === '#') {
        const n =
          code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return Number.isInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ';
      }
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** The site address of a feed, without query string (it may hold a token). */
export function siteOf(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return '';
  }
}

/**
 * @param {object} raw an entry of `GET /v1/entries`
 */
export function summarizeEntry(raw) {
  const feed = raw?.feed ?? {};
  return {
    id: raw.id,
    title: str(raw.title) || str(raw.url) || '…',
    url: /^https?:\/\//i.test(raw.url ?? '') ? str(raw.url, 2000) : '',
    status: str(raw.status, 20),
    feedId: Number.isInteger(raw.feed_id) ? raw.feed_id : feed.id,
    feed: str(feed.title, 200),
    categoryId: feed.category?.id,
    category: str(feed.category?.title, 200),
    author: str(raw.author, 200),
    published: str(raw.published_at, 40),
    starred: raw.starred === true,
    summary: plainText(raw.content, 1000),
  };
}

/**
 * @param {object} raw a feed of `GET /v1/feeds`
 */
export function summarizeFeed(raw) {
  const errors = Number.isInteger(raw.parsing_error_count) ? raw.parsing_error_count : 0;
  return {
    id: raw.id,
    title: str(raw.title, 200) || siteOf(raw.site_url) || String(raw.id),
    site: siteOf(raw.site_url),
    categoryId: raw.category?.id,
    category: str(raw.category?.title, 200),
    disabled: raw.disabled === true,
    errorCount: errors,
    error: errors > 0 ? str(raw.parsing_error_message, 300) : '',
  };
}

/** A feed Miniflux failed to read (a disabled feed is not read at all). */
export const inError = (feed) => feed.errorCount > 0 && !feed.disabled;

/** The first keyword found in a title (case and accents ignored), or ''. */
export function matchKeyword(title, keywords) {
  const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const haystack = fold(title);
  return keywords.find((keyword) => haystack.includes(fold(keyword))) ?? '';
}

/** Entry ids typed in a scene ("12", "12, 13", "{{triggerEvent.data.entry_id}}" resolved). */
export function parseIds(raw) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw : '';
  const ids = text
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (ids.length === 0 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    return null;
  }
  return [...new Set(ids)].slice(0, 100);
}
