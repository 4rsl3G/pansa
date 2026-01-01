const express = require("express");
const router = express.Router();

const langMiddleware = require("../middleware/lang");
const shortmax = require("../api/shortmax");
const cache = require("../api/cache");

router.use(langMiddleware);

const k = (...parts) => parts.map(String).join("|");

// -------------------- CACHED FETCHERS --------------------

// Languages: 12 jam
const getLangsCached = () =>
  cache.wrap(k("langs"), 1000 * 60 * 60 * 12, async () => {
    const payload = await shortmax.getLanguages();
    return payload.data || [];
  });

// Home: 2 menit per lang
const getHomeCached = (lang) =>
  cache.wrap(k("home", lang), 1000 * 60 * 2, async () => {
    const payload = await shortmax.getHome(lang);
    return payload.data || [];
  });

// Search: 1 menit per lang+q
const getSearchCached = (lang, q) =>
  cache.wrap(k("search", lang, q), 1000 * 60 * 1, async () => {
    const payload = await shortmax.search(q, lang);
    return payload.data || [];
  });

// Episodes: 10 menit per lang+code
const getEpisodesCached = (lang, code) =>
  cache.wrap(k("eps", lang, code), 1000 * 60 * 10, async () => {
    const payload = await shortmax.getEpisodes(code, lang);
    return payload.data || [];
  });

// Play: TTL ikut payload.ttl / expires_in (clamp 5s..10m)
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

// -------------------- DEBUG (optional) --------------------
router.get("/debug/env", (req, res) => {
  res.json({
    baseURL: process.env.SHORTMAX_API_BASE,
    tokenPresent: Boolean(process.env.SHORTMAX_TOKEN),
    nodeEnv: process.env.NODE_ENV
  });
});

router.get("/debug/home", async (req, res) => {
  try {
    const lang = (req.query.lang || res.locals.lang || "en").toString();
    const payload = await shortmax.getHome(lang);
    res.json({
      ok: true,
      lang,
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

// -------------------- ROUTES --------------------

// HOME (lang default en via middleware)
router.get("/", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();

  let langs = [];
  let rows = [];

  // Fetch phase
  try {
    langs = await getLangsCached();
    rows = await getHomeCached(lang);
  } catch (e) {
    console.error("HOME FETCH ERROR:", {
      status: e?.response?.status,
      msg: e?.message,
      data: e?.response?.data,
      code: e?.code,
      lang
    });
    return res.status(500).send("API fetch error on home");
  }

  // Render phase (biar error EJS kebaca)
  try {
    return res.render("home", { pageTitle: "Home", langs, rows });
  } catch (e) {
    console.error("EJS RENDER ERROR (home):", e?.stack || e);
    return res.status(500).send(`
      <h1>EJS Render Error (home.ejs)</h1>
      <pre>${(e && (e.stack || e.message)) || "unknown error"}</pre>
    `);
  }
});

// SEARCH
router.get("/search", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();

  try {
    const langs = await getLangsCached();
    const q = (req.query.q || "").toString().trim();
    const items = q ? await getSearchCached(lang, q) : [];

    res.render("search", {
      pageTitle: "Search",
      langs,
      q,
      items
    });
  } catch (e) {
    console.error("SEARCH ERROR:", {
      status: e?.response?.status,
      msg: e?.message,
      data: e?.response?.data,
      code: e?.code,
      lang
    });
    res.status(500).send("API error on search");
  }
});

// TITLE DETAIL
router.get("/t/:code", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();

  try {
    const langs = await getLangsCached();
    const code = req.params.code;

    // best-effort detail dari home cache
    const home = await getHomeCached(lang);
    const title = (home || []).find((x) => String(x.code) === String(code)) || null;

    const episodes = await getEpisodesCached(lang, code);

    res.render("title", {
      pageTitle: title?.name || "Title",
      langs,
      title,
      code,
      episodes
    });
  } catch (e) {
    console.error("TITLE ERROR:", {
      status: e?.response?.status,
      msg: e?.message,
      data: e?.response?.data,
      code: e?.code,
      lang
    });
    res.status(500).send("API error on title");
  }
});

// WATCH
router.get("/watch/:code/:ep", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();

  try {
    const langs = await getLangsCached();

    const { code, ep } = req.params;

    const payload = await getPlayCached(lang, code, ep);

    // cover + name dari query buat Continue Watching
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
    console.error("WATCH ERROR:", {
      status: e?.response?.status,
      msg: e?.message,
      data: e?.response?.data,
      code: e?.code,
      lang
    });
    res.status(500).send("API error on play");
  }
});

module.exports = router;
