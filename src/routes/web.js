const express = require("express");
const router = express.Router();

const langMiddleware = require("../middleware/lang");
const shortmax = require("../api/shortmax");
const cache = require("../api/cache");

router.use(langMiddleware);

const k = (...parts) => parts.map(String).join("|");

// LANG: 12 jam
const getLangsCached = () =>
  cache.wrap(k("langs"), 1000 * 60 * 60 * 12, async () => {
    const payload = await shortmax.getLanguages();
    return payload.data || [];
  });

// HOME: 2 menit per lang
const getHomeCached = (lang) =>
  cache.wrap(k("home", lang), 1000 * 60 * 2, async () => {
    const payload = await shortmax.getHome(lang);
    return payload.data || [];
  });

// SEARCH: 1 menit
const getSearchCached = (lang, q) =>
  cache.wrap(k("search", lang, q), 1000 * 60 * 1, async () => {
    const payload = await shortmax.search(q, lang);
    return payload.data || [];
  });

// EPISODES: 10 menit
const getEpisodesCached = (lang, code) =>
  cache.wrap(k("eps", lang, code), 1000 * 60 * 10, async () => {
    const payload = await shortmax.getEpisodes(code, lang);
    return payload.data || [];
  });

// PLAY: TTL ikut expires_in/ttl (clamp)
async function getPlayCached(lang, code, ep) {
  const key = k("play", lang, code, ep);
  const hit = cache.get(key);
  if (hit) return hit;

  const payload = await shortmax.getPlay(code, ep, lang);
  const ttlSeconds = Number(payload.ttl || payload?.data?.expires_in || 30);
  const ttlMs = Math.max(5000, Math.min(ttlSeconds * 1000, 1000 * 60 * 10));
  cache.set(key, payload.data, ttlMs);
  return payload.data;
}

// HOME
router.get("/", async (req, res) => {
  try {
    const langs = await getLangsCached();
    const rows = await getHomeCached(res.locals.lang);

    res.render("home", { pageTitle: "Home", langs, rows });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).send("API error on home");
  }
});

// SEARCH
router.get("/search", async (req, res) => {
  try {
    const langs = await getLangsCached();
    const q = (req.query.q || "").toString().trim();
    const items = q ? await getSearchCached(res.locals.lang, q) : [];
    res.render("search", { pageTitle: "Search", langs, q, items });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).send("API error on search");
  }
});

// TITLE
router.get("/t/:code", async (req, res) => {
  try {
    const langs = await getLangsCached();
    const code = req.params.code;

    const home = await getHomeCached(res.locals.lang);
    const title = (home || []).find((x) => String(x.code) === String(code)) || null;

    const episodes = await getEpisodesCached(res.locals.lang, code);

    res.render("title", {
      pageTitle: title?.name || "Title",
      langs,
      title,
      code,
      episodes
    });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).send("API error on title");
  }
});

// WATCH (cover+name dari query untuk Continue Watching)
router.get("/watch/:code/:ep", async (req, res) => {
  try {
    const langs = await getLangsCached();
    const { code, ep } = req.params;
    const payload = await getPlayCached(res.locals.lang, code, ep);

    const cover = (req.query.cover || "").toString();
    const tname = (req.query.name || "").toString();

    res.render("watch", {
      pageTitle: `${payload?.name || "Watch"} • EP ${ep}`,
      langs,
      code,
      ep: Number(ep),
      payload,
      cover,
      tname
    });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).send("API error on play");
  }
});

router.get("/debug/langs", async (req, res) => {
  try {
    const payload = await shortmax.getLanguages();
    res.json({
      ok: true,
      count: payload?.data?.length ?? 0,
      cached: payload?.cached,
      ttl: payload?.ttl
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      status: e?.response?.status || null,
      msg: e?.message || null,
      data: e?.response?.data || null,
      code: e?.code || null
    });
  }
});

module.exports = router;
