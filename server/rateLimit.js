// Minimal in-memory sliding-window limiter, good enough for a single-instance
// deployment behind Coolify. Keyed by an arbitrary string (usually IP).
function createLimiter({ windowMs, max }) {
  const hits = new Map();

  function check(key) {
    const now = Date.now();
    const bucket = hits.get(key) || [];
    const fresh = bucket.filter((t) => now - t < windowMs);
    fresh.push(now);
    hits.set(key, fresh);
    return fresh.length <= max;
  }

  // periodic cleanup so the map doesn't grow forever
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of hits.entries()) {
      const fresh = bucket.filter((t) => now - t < windowMs);
      if (fresh.length === 0) hits.delete(key);
      else hits.set(key, fresh);
    }
  }, windowMs).unref();

  return { check };
}

module.exports = { createLimiter };
