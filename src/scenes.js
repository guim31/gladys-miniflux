// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`): mark a category (or everything)
// as read, mark the entries a trigger announced as read, ask Miniflux to
// refresh its feeds, and read the newest unread titles to send them in a
// message or speak them.
// -----------------------------------------------------------------------------

// The text output of "Read the unread entries": one line per entry.
export const lines = (entries) =>
  entries.map((entry) => (entry.feed ? `${entry.title} — ${entry.feed}` : entry.title));

export const SCENE_ACTIONS = {
  async mark_category_read(hub, { fields = {} }) {
    const done = await hub.markRead(fields.category);
    return { count: done.count, category: done.category };
  },
  async mark_entries_read(hub, { fields = {} }) {
    const done = await hub.markEntries(fields.entry_ids);
    return { count: done.count };
  },
  async refresh_feeds(hub, { fields = {} }) {
    const done = await hub.refreshFeeds(fields.category);
    return { count: done.count };
  },
  async read_unread(hub, { fields = {} }) {
    const { entries, total } = await hub.readUnread({
      category: fields.category,
      count: fields.count,
      markRead: fields.mark_read,
    });
    return {
      count: entries.length,
      unread: total,
      titles: lines(entries).join('\n').slice(0, 10_000),
      latest_title: entries[0]?.title ?? '',
      latest_url: entries[0]?.url ?? '',
      latest_feed: entries[0]?.feed ?? '',
    };
  },
};
