# Miniflux

Connect Gladys to [Miniflux](https://miniflux.app), the minimalist feed reader:
follow your unread counts per category, react when a new entry arrives or when
a feed stops working, mark entries as read from your scenes, and see the
newest unread entries on the dashboard. The integration follows the state of
your reader (read / unread, the same on all your devices), not the feeds
themselves.

Tested against a real Miniflux 2.3.4 (the official Docker image) with test
feeds. Feedback welcome on the Gladys forum.

## Prerequisites

- Gladys Assistant 5.1 or later.
- Miniflux 2, self-hosted (port 8080 by default, or behind a reverse proxy) or
  the hosted service at `reader.miniflux.app`, reachable from the Gladys
  machine.
- An API key: in Miniflux, open **Settings → API Keys** and create one. The
  integration sees the feeds of the user who owns the key.

## Configuration

1. Open the **Configuration** tab of the integration.
2. In **Miniflux address**, enter the address of the server, for example
   `192.168.1.50:8080` (port 8080 when none is given), or a full address such
   as `https://rss.example.org` or `https://reader.miniflux.app`.
3. Paste the **API key**.
4. Optional: **Read Miniflux every** (5 minutes by default), and **Keywords to
   watch**, separated by commas, for the keyword filter of the "New entry"
   trigger.
5. Click **Test the connection**: it shows the user, the unread entries and
   the feeds in error.
6. Open the **Discovery** tab and add the devices you want.

## Devices

- **Miniflux**: _Unread entries_ (all categories) and _Feeds in error_ (feeds
  Miniflux failed to read at its last check, disabled feeds left out).
- **One device per category** (offered for each Miniflux category): its
  _Unread entries_.

The values are read every few minutes (the setting above) and right after
every change made from Gladys. They are kept in the history, for a chart of
your unread pile.

## Dashboard widget

**Miniflux**: the number of unread entries (and of feeds in error, in red,
when there are some), the six newest unread entries (feed, date, summary,
links to the article and to Miniflux when they are https), a **Refresh**
button that asks Miniflux to check every feed, and a **Mark as read** button,
with a confirmation, for what the widget shows. Set to a category device, the
widget shows and marks that category only.

## Scene triggers

- **New entry**: an unread entry arrived in Miniflux. Filters: a category (a
  category device), a feed (its title, exactly as in Miniflux), a keyword (one
  of the keywords of the configuration, found in the title, case and accents
  ignored). Information passed on: title, link, feed, category, author,
  keyword found, publication date and entry id.
- **Feed in error**: Miniflux failed to read a feed that worked until then.
  Filter: a category. Information passed on: feed, category, error message,
  failed checks, site address, feed id.

Nothing fires at the first read after installing the integration, nor for the
entries already there when a feed is added, nor for entries already read on
another device. At most 10 entries are announced per read.

## Scene actions

- **Mark a Miniflux category as read**: every unread entry of a category; pick
  the Miniflux device to mark everything. Results: entries marked, category.
- **Mark Miniflux entries as read**: one or more entry ids, typically the
  entry id of the "New entry" trigger. Result: entries marked.
- **Refresh the Miniflux feeds**: Miniflux fetches every feed now (or those of
  a category), four at a time; the new entries are read once it is done.
  Result: feeds refreshed.
- **Read the unread Miniflux titles**: the newest unread entries (1 to 10), of
  every category or of one, optionally marked as read afterwards. Results:
  number read, unread entries in all, titles one per line ("Title — Feed"),
  title, link and feed of the newest one.

## Scene examples

- **Morning briefing**: at 7:30, _Read the unread Miniflux titles_ (category
  News, 5 entries, then mark them as read), then send a Telegram message
  with its _Titles_ result (insert it with the variable picker).
- **Watch a topic**: with `Gladys` in the keywords, _New entry_ with the
  keyword `Gladys` → send a message with the _Title_ and the _Link_ of the
  entry, then _Mark Miniflux entries as read_ with its _Entry id_.
- **Broken feed**: _Feed in error_ → send a message with the _Feed_ and the
  _Error message_.

## Troubleshooting

- **"Miniflux refused the API key"**: the key was deleted or mistyped: create
  a new one in Settings → API Keys.
- **"Miniflux does not answer"**: check the address and the port from the
  Gladys machine. Behind a reverse proxy, enter the full address, path
  included.
- **"This address does not answer like Miniflux"**: the address leads to
  another service, or to a login page (an authentication proxy in front of
  Miniflux must let `/v1/` through with the `X-Auth-Token` header).
- **No "New entry" event**: entries arrive when Miniflux checks the feeds (every
  60 minutes by default on its side), then at the next read of the
  integration. Use _Refresh the Miniflux feeds_ to speed it up.
- More details: set the `LOG_LEVEL` variable of the integration to `debug`.

## Limits

- The trigger filters only compare exact values: the feed filter is the exact
  title, the keyword filter one of the configured keywords.
- Starred entries, the reading history and the feeds themselves are not
  managed from Gladys.
- The widget links open https addresses only: an article or a Miniflux on
  plain http has no link.
- Not affiliated with Miniflux.
