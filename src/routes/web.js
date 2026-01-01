const express = require("express");
const router = express.Router();
const shortmax = require("../api/shortmax");
const cache = require("../api/cache");

// Middleware lang default en
router.use(require("../middleware/lang"));

const key = (...p) => p.map(String).join("|");

// Server-side cached fetchers
const getLangsCached = () =>
  cache.wrap(key("langs"), 1000 * 60 * 60 * 12, async () => {
    const r = await shortmax.getLanguages();
    return r.data || [];
  });

const getHomeCached = (lang) =>
  cache.wrap(key("home", lang), 1000 * 60 * 2, async () => {
    const r = await shortmax.getHome(lang);
    return r.data || [];
  });

const getSearchCached = (lang, q) =>
  cache.wrap(key("search", lang, q), 1000 * 60, async () => {
    const r = await shortmax.search(q, lang);
    return r.data || [];
  });

const getEpisodesCached = (lang, code) =>
  cache.wrap(key("eps", lang, code), 1000 * 60 * 10, async () => {
    const r = await shortmax.getEpisodes(code, lang);
    return r.data || [];
  });

async function getPlayCached(lang, code, ep) {
  const k = key("play", lang, code, ep);
  const hit = cache.get(k);
  if (hit) return hit;
  const r = await shortmax.getPlay(code, ep, lang);
  const ttl = Math.max(5000, Math.min((r.ttl || r.data?.expires_in || 30) * 1000, 1000 * 60 * 10));
  cache.set(k, r.data, ttl);
  return r.data;
}

// HOME
router.get("/", async (req, res) => {
  const lang = res.locals.lang || "en";
  let langs, rows;
  try {
    langs = await getLangsCached();
    rows = await getHomeCached(lang);
  } catch (e) {
    console.error("Home fetch error:", e.message);
    return res.status(500).send("API error on home fetch");
  }

  try {
    return res.render("home", {
      layout: "layouts/main",
      pageTitle: "Home",
      lang,
      langs,
      rows
    });
  } catch (e) {
    console.error("EJS render error (home):", e.stack || e);
    return res.status(500).send("Home render error");
  }
});

// SEARCH
router.get("/search", async (req, res) => {
  const lang = res.locals.lang || "en";
  const q = (req.query.q || "").toString().trim();
  let langs, items;
  try {
    langs = await getLangsCached();
    items = q ? await getSearchCached(lang, q) : [];
  } catch (e) {
    console.error("Search fetch error:", e.message);
    return res.status(500).send("API error on search fetch");
  }

  try {
    return res.render("search", {
      layout: "layouts/main",
      pageTitle: "Search",
      lang,
      langs,
      q,
      items
    });
  } catch (e) {
    console.error("EJS render error (search):", e.stack || e);
    return res.status(500).send("Search render error");
  }
});

// TITLE
router.get("/t/:code", async (req, res) => {
  const lang = res.locals.lang || "en";
  const code = req.params.code;
  let langs, home, title, episodes;
  try {
    langs = await getLangsCached();
    home = await getHomeCached(lang);
    title = (home || []).find(x => String(x.code) === String(code)) || null;
    episodes = await getEpisodesCached(lang, code);
  } catch (e) {
    console.error("Title fetch error:", e.message);
    return res.status(500).send("API error on title fetch");
  }

  try {
    return res.render("title", {
      layout: "layouts/main",
      pageTitle: title?.name || "Title",
      lang,
      langs,
      title,
      code,
      episodes
    });
  } catch (e) {
    console.error("EJS render error (title):", e.stack || e);
    return res.status(500).send("Title render error");
  }
});

// WATCH
router.get("/watch/:code/:ep", async (req, res) => {
  const lang = res.locals.lang || "en";
  const { code, ep } = req.params;
  let langs, payload;
  try {
    langs = await getLangsCached();
    payload = await getPlayCached(lang, code, ep);
  } catch (e) {
    console.error("Watch fetch error:", e.message);
    return res.status(500).send("API error on watch fetch");
  }

  try {
    return res.render("watch", {
      layout: "layouts/main",
      pageTitle: `${payload?.name || "Watch"} • EP ${ep}`,
      lang,
      langs,
      code,
      ep: Number(ep),
      payload,
      cover: (req.query.cover || "").toString(),
      tname: (req.query.name || "").toString()
    });
  } catch (e) {
    console.error("EJS render error (watch):", e.stack || e);
    return res.status(500).send("Watch render error");
  }
});

module.exports = router;
