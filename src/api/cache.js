const store = new Map();

function now() { return Date.now(); }

function get(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.expiresAt && hit.expiresAt < now()) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

function set(key, value, ttlMs = 60_000) {
  store.set(key, { value, expiresAt: ttlMs ? now() + ttlMs : null });
  return value;
}

function wrap(key, ttlMs, fn) {
  const hit = get(key);
  if (hit) return Promise.resolve(hit);
  return Promise.resolve(fn()).then((val) => set(key, val, ttlMs));
}

module.exports = { get, set, wrap };
