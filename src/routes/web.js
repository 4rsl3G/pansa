const express = require("express");
const router = express.Router();

const langMiddleware = require("../middleware/lang");
const shortmax = require("../api/shortmax");
const cache = require("../api/cache");

router.use(langMiddleware);

const k = (...parts) => parts.map(String).join("|");

const getLangsCached = () =>
  cache.wrap(k("langs"), 1000 * 60 * 60 * 12, async () => {
    const payload = await shortmax.getLanguages();
    return payload?.data || [];
  });

const getHomeCached = (lang) =>
  cache.wrap(k("home", lang), 1000 * 60 * 2, async () => {
    const payload = await shortmax.getHome(lang);
    return payload?.data || [];
  });

const getSearchCached = (lang, q) =>
  cache.wrap(k("search", lang, q), 1000 * 60, async () => {
    const payload = await shortmax.search(q, lang);
    return payload?.data || [];
  });

const getEpisodesCached = (lang, code) =>
  cache.wrap(k("eps", lang, code), 1000 * 60 * 10, async () => {
    const payload = await shortmax.getEpisodes(code, lang);
    return payload?.data || [];
  });

async function getPlayCached(lang, code, ep) {
  const key = k("play", lang, code, ep);
  const hit = cache.get(key);
  if (hit) return hit;

  const payload = await shortmax.getPlay(code, ep, lang);
  const ttlSeconds = Number(payload?.ttl || payload?.data?.expires_in || 30);
  const ttlMs = Math.max(5000, Math.min(ttlSeconds * 1000, 1000 * 60 * 10));

  cache.set(key, payload.data, ttlMs);
  return payload.data;
}

function logApiError(scope, e, extra = {}) {
  console.error(`[${scope}]`, {
    status: e?.response?.status || null,
    msg: e?.message || null,
    code: e?.code || null,
    data: e?.response?.data || null,
    ...extra
  });
}

router.get("/", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();
  let langs = [];
  let rows = [];

  try {
    langs = await getLangsCached();
    rows = await getHomeCached(lang);
  } catch (e) {
    logApiError("HOME_FETCH", e, { lang });
    return res.status(500).send("API fetch error on home");
  }

  try {
    return res.render("home", { pageTitle: "Home", langs, rows });
  } catch (e) {
    console.error("EJS_RENDER_HOME:", e?.stack || e);
    return res.status(500).send("Home render error");
  }
});

router.get("/search", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();
  const q = (req.query.q || "").toString().trim();

  try {
    const langs = await getLangsCached();
    const items = q ? await getSearchCached(lang, q) : [];
    return res.render("search", { pageTitle: "Search", langs, q, items });
  } catch (e) {
    logApiError("SEARCH", e, { lang, q });
    return res.status(500).send("API error on search");
  }
});

router.get("/t/:code", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();
  const code = req.params.code;

  try {
    const langs = await getLangsCached();
    const home = await getHomeCached(lang);
    const title = (Array.isArray(home) ? home : []).find((x) => String(x.code) === String(code)) || null;
    const episodes = await getEpisodesCached(lang, code);

    return res.render("title", {
      pageTitle: title?.name || "Title",
      langs,
      title,
      code,
      episodes
    });
  } catch (e) {
    logApiError("TITLE", e, { lang, code });
    return res.status(500).send("API error on title");
  }
});

router.get("/watch/:code/:ep", async (req, res) => {
  const lang = (res.locals.lang || "en").toString();
  const { code, ep } = req.params;

  try {
    const langs = await getLangsCached();
    const payload = await getPlayCached(lang, code, ep);

    const cover = (req.query.cover || "").toString();
    const tname = (req.query.name || "").toString();

    return res.render("watch", {
      pageTitle: `${payload?.name || "Watch"} • EP ${ep}`,
      langs,
      code,
      ep: Number(ep),
      payload,
      cover,
      tname
    });
  } catch (e) {
    logApiError("WATCH", e, { lang, code, ep });
    return res.status(500).send("API error on play");
  }
});

module.exports = router;
