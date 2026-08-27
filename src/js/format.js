/* ============================================================
   format.js — derived display values.

   Uptime and auto-decayed caffeine are computed locally in each page
   from `stream.startedAt`. Nothing ticks over the bus: the clock is a
   function of a timestamp, so every source agrees without traffic.
   ============================================================ */

/** ms -> "HH:MM:SS" */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total   = Math.floor(ms / 1000);
  const hours   = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

/** seconds -> "MM:SS" (countdown display) */
export function formatClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Session uptime, or null when the stream has not been started. */
export function uptimeMs(stream, now = Date.now()) {
  if (!stream?.startedAt) return null;
  return Math.max(0, now - stream.startedAt);
}

/**
 * Caffeine %, honouring the §01 note that it decays over the session.
 * With autoDecay off this is just the operator's number.
 */
export function caffeinePercent(caffeine, stream, now = Date.now()) {
  const base = clamp(Number(caffeine?.percent) || 0, 0, 100);
  if (!caffeine?.autoDecay || !stream?.startedAt) return Math.round(base);
  const hours = (now - stream.startedAt) / 3_600_000;
  const rate  = Number(caffeine.decayPerHour) || 0;
  return Math.round(clamp(base - hours * rate, 0, 100));
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

/** Goal progress as a 0-100 percentage. */
export function goalPercent(goal) {
  const target = Number(goal?.target) || 0;
  if (target <= 0) return 0;
  return clamp((Number(goal?.current) || 0) / target * 100, 0, 100);
}

/** "214 / 250" or "$68 / $120" */
export function goalReadout(goal) {
  const prefix = goal?.prefix ?? '';
  return `${prefix}${goal?.current ?? 0} / ${prefix}${goal?.target ?? 0}`;
}

/** Escape text destined for innerHTML. Chat is operator-supplied, but a
    live chat provider will one day feed this the open internet. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
