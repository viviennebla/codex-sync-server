// Comments are user-written messages. All other events are automatic system updates.
// Keep this projection client-side so the original feed remains available for
// rider bubbles and achievement toasts, regardless of the visible filter.
export function filterEventFeed(events, filter = "all") {
  const rows = Array.isArray(events) ? events : [];
  if (filter === "user") return rows.filter((event) => event?.kind === "comment");
  if (filter === "system") return rows.filter((event) => event?.kind !== "comment");
  return rows;
}
