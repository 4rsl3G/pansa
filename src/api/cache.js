const { LRUCache } = require("lru-cache");

const cache = new LRUCache({
  max: 500,
  ttl: 1000 * 60 * 5
});

function get(key) {
  return cache.get(key);
}

function set(key, value, ttlMs) {
  cache.set(key, value, { ttl: ttlMs });
}

async function wrap(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const val = await fn();
  cache.set(key, val, { ttl: ttlMs });
  return val;
}

module.exports = { get, set, wrap };
