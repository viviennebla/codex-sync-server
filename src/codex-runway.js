const DEFAULT_BASE_URL = "https://didcodexreset.com/openapi/v1";
const DEFAULT_SITE_URL = "https://didcodexreset.com/zh/";
const DEFAULT_CACHE_MS = 15 * 60 * 1000;
const RECENT_COMPLETED_MS = 24 * 60 * 60 * 1000;

function trimText(value, max = 220) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  return {
    id: String(record.id || ""),
    kind: record.kind || null,
    reset_type: record.resetType || null,
    announced_at: record.announcedAt || null,
    effective_at: record.effectiveAt || null,
    completed_at: record.completedAt || null,
    text: trimText(record.text),
    confidence: Number.isFinite(Number(record.confidence))
      ? Number(record.confidence)
      : null,
    scope: {
      plans: Array.isArray(record.scope?.plans) ? record.scope.plans : [],
      windows: Array.isArray(record.scope?.windows) ? record.scope.windows : [],
    },
    schedule_state: record.scheduleState || null,
    schedule_window: record.scheduleWindow
      ? {
          start_at: record.scheduleWindow.startAt || null,
          end_at: record.scheduleWindow.endAt || null,
        }
      : null,
    source_url: typeof record.source?.url === "string" ? record.source.url : null,
    source_handle: record.source?.handle || null,
  };
}

function recentCompletedRecord(record, nowMs) {
  if (!record || record.kind !== "reset_completed") return null;
  const occurredAt = Date.parse(record.effective_at || record.completed_at || "");
  if (!Number.isFinite(occurredAt)) return null;
  const ageMs = nowMs - occurredAt;
  return ageMs >= 0 && ageMs <= RECENT_COMPLETED_MS ? record : null;
}

export function createCodexRunwayReader(options = {}) {
  const fetchFn = options.fetch || globalThis.fetch;
  const now = options.now || (() => Date.now());
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const siteUrl = options.siteUrl || DEFAULT_SITE_URL;
  const cacheMs = Number(options.cacheMs || DEFAULT_CACHE_MS);
  let cached = null;
  let expiresAt = 0;
  let inflight = null;

  async function fetchLatest(kind = null) {
    const url = baseUrl + "/records/latest" + (kind ? "?kind=" + encodeURIComponent(kind) : "");
    const response = await fetchFn(url, {
      headers: { "user-agent": "denglema-codex-runway/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error("CodexRunway HTTP " + response.status);
    const payload = await response.json();
    if (!payload?.ok) throw new Error(payload?.error || "CodexRunway invalid response");
    return { record: normalizeRecord(payload.data), meta: payload.meta || null };
  }

  async function refresh() {
    const [signal, completed] = await Promise.all([
      fetchLatest(),
      fetchLatest("reset_completed"),
    ]);
    const currentNow = now();
    const value = {
      ok: true,
      source: "CodexRunway",
      site_url: siteUrl,
      fetched_at: new Date(currentNow).toISOString(),
      generated_at: signal.meta?.generatedAt || completed.meta?.generatedAt || null,
      latest_signal: signal.record,
      latest_completed: recentCompletedRecord(completed.record, currentNow),
    };
    cached = value;
    expiresAt = currentNow + cacheMs;
    return { ...value, cache: "refresh" };
  }

  return async function readCodexRunwayStatus() {
    if (cached && now() < expiresAt) return { ...cached, cache: "hit" };
    if (inflight) return inflight;
    inflight = refresh()
      .catch((error) => {
        if (cached) {
          return { ...cached, cache: "stale", warning: error?.message || String(error) };
        }
        throw error;
      })
      .finally(() => { inflight = null; });
    return inflight;
  };
}
