# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Miniflux in Gladys, over its REST API and an API key: a **Miniflux** device
  (unread entries, feeds in error) and one device per category (its unread
  entries).
- **New entry** scene trigger, filtered by category, feed or a keyword of the
  title, with the title, link, feed and entry id for the actions.
- **Feed in error** scene trigger, with the feed and the error message.
- Scene actions: mark a category (or everything) as read, mark entries as read,
  refresh the feeds, read the newest unread titles for a message.
- **Miniflux** dashboard widget: unread count, newest unread entries, Refresh
  and Mark as read buttons.
- Texts and documentation in English, French, German and Spanish.
