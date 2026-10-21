# Miniflux for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for
[Miniflux](https://miniflux.app), the minimalist feed reader: unread counts per
category, a trigger on every new entry and on a feed that breaks, entries
marked as read from scenes, and the newest unread entries on the dashboard.

Tested against a real Miniflux 2.3.4 (the official Docker image) with test
feeds; not yet on a real Gladys installation: feedback welcome.

## Features

- **Devices**: a **Miniflux** device (unread entries, feeds in error) and one
  device per category (its unread entries), with history.
- **Scene triggers**: _New entry_ (filters: category, feed, keyword of the
  title; title, link, feed, category, author, entry id passed on) and _Feed in
  error_ (feed, error message).
- **Scene actions**: mark a category or everything as read, mark entries as
  read (the entry id of the trigger), refresh the feeds, read the newest unread
  titles (for a message), optionally marking them as read.
- **Dashboard widget**: unread count, feeds in error, the six newest unread
  entries, _Refresh_ and _Mark as read_ (with a confirmation) buttons; for all
  categories or one.
- English, French, German and Spanish.

### Compared with gladys-rss

[gladys-rss](https://github.com/LM1LC3N7/gladys-rss) reads RSS and Atom feeds
directly, without any account: perfect to follow a few feeds. This
integration follows **your Miniflux reader** instead: what you already read on
your phone or your computer is read in Gladys too, the counters are your real
unread pile, and Gladys can mark entries as read. Use gladys-rss without a
reader, this one if you use Miniflux.

## Requirements

- Gladys Assistant 5.1 or later.
- Miniflux 2, self-hosted or the hosted `reader.miniflux.app`, reachable from
  the Gladys machine, and an API key (Miniflux → Settings → API Keys).

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-miniflux`.
2. In the **Configuration** tab, enter the address of Miniflux (for example
   `192.168.1.50:8080`) and the API key, then **Test the connection**.
3. Add the devices you want from the **Discovery** tab.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

Miniflux pushes nothing: the container reads it every 5 minutes by default (1
to 60) with four small requests of the REST API v1 (`X-Auth-Token`):
`/categories`, `/feeds` (with their parsing errors), `/feeds/counters` and
`/entries?after_entry_id=` (the entries since the previous read; ids only
grow). The devices are published with `should_poll: false`; only changed
states are sent to Gladys. The ids the triggers need are kept in
`/data/miniflux-state.json`, so a restart announces nothing twice.

## Limitations

- One Miniflux user, the owner of the API key.
- The triggers fire at the next read, not instantly; at most ten new entries
  per read; nothing at the first read, nor for the backlog of a feed just
  added.
- Feeds, starred entries and the reading history are not managed from Gladys.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and a fake Miniflux answering with
bodies recorded on a real Miniflux 2.3.4 (`test/fixtures/miniflux/`).

## Credits

- [Miniflux](https://github.com/miniflux/v2), by Frédéric Guillot and
  contributors (Apache-2.0): this integration only talks to its REST API and
  contains none of its code.
- The cover shows the Miniflux logo, from the
  [miniflux/logo](https://github.com/miniflux/logo) repository, under the
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) license.
- The style of the "New entry" trigger and of the widget follows
  [gladys-rss](https://github.com/LM1LC3N7/gladys-rss) by LM1LC3N7.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Miniflux
project.

## License

Apache-2.0, see [LICENSE](LICENSE).
