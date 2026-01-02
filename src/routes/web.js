const express = require("express");
const router = express.Router();

const langMiddleware = require("../middleware/lang");
const shortmax = require("../api/shortmax");
const cache = require("../api/cache");

router.use(langMiddleware);

const k = (...p) => p.map(String).join("|");

// Default prefer proxy play (bisa di override via env)
const PREFER_PROXY_PLAY = String(process.env.PREFER_PROXY_PLAY ?? "true").toLowerCase() !== "false";

function safeDecode(s) {
  try {
    return decodeURIComponent(String(s || ""));
  } catch {
    return String(s || "");
  }
}

/**
 * Helper: ambil play dari proxy (sesuai curl), fallback ke v1 kalau gagal.
 * Output: payload object (yang punya .data, .cached, .ttl, dst)
 */
async function fetchPlayPreferProxy(code, ep, lang) {
  if (PREFER_PROXY_PLAY && typeof shortmax.getProxyPlay === "function") {
    try {
      return await shortmax.getProxyPlay(code, ep, lang);
    } catch (e) {
      try {
        return await shortmax.getPlay(code, ep, lang);
      } catch (e2) {
        throw e;
      }
    }
  }
  return await shortmax.getPlay(code, ep, lang);
}

// langs cached 12h
const getLangsCached = () =>
  cache.wrap(k("langs"), 1000 * 60 * 60 * 12, async () => {
    const r = await shortmax.getLanguages();
    return r?.data || [];
  });

// home cached 2m
const getHomeCached = (lang) =>
  cache.wrap(k("home", lang), 1000 * 60 * 2, async () => {
    const r = await shortmax.getHome(lang);
    return r?.data || [];
  });

// search cached 60s
const getSearchCached = (lang, q) =>
  cache.wrap(k("search", lang, q), 1000 * 60, async () => {
    const r = await shortmax.search(q, lang);
    return r?.data || [];
  });

// episodes cached 10m
const getEpisodesCached = (lang, code) =>
  cache.wrap(k("eps", lang, code), 1000 * 60 * 10, async () => {
    const r = await shortmax.getEpisodes(code, lang);
    return r?.data || [];
  });

// ⚠️ play cache dibuat SANGAT pendek (hindari auth_key expired)
async function getPlayShortCached(lang, code, ep) {
  const key = k("play", lang, code, ep);
  const hit = cache.get(key);
  if (hit) return hit;

  const payload = await fetchPlayPreferProxy(code, ep, lang);

  // cache 20 detik aja supaya aman (simpan .data)
  cache.set(key, payload?.data, 1000 * 20);
  return payload?.data;
}

function logApi(scope, e, extra = {}) {
  console.error(`[${scope}]`, {
    status: e?.response?.status || null,
    msg: e?.message || null,
    code: e?.code || null,
    data: e?.response?.data || null,
    ...extra
  });
}

router.get("/", async (req, res) => {
  const lang = res.locals.lang || "en";
  try {
    const langs = await getLangsCached();
    const rows = await getHomeCached(lang);
    return res.render("home", { pageTitle: "Home", langs, rows });
  } catch (e) {
    logApi("HOME", e, { lang });
    return res.status(500).send("API error on home");
  }
});

router.get("/search", async (req, res) => {
  const lang = res.locals.lang || "en";
  const q = (req.query.q || "").toString().trim();
  try {
    const langs = await getLangsCached();
    const items = q ? await getSearchCached(lang, q) : [];
    return res.render("search", { pageTitle: "Search", langs, q, items });
  } catch (e) {
    logApi("SEARCH", e, { lang, q });
    return res.status(500).send("API error on search");
  }
});

router.get("/t/:code", async (req, res) => {
  const lang = res.locals.lang || "en";
  const code = req.params.code;
  try {
    const langs = await getLangsCached();
    const home = await getHomeCached(lang);
    const title =
      (Array.isArray(home) ? home : []).find((x) => String(x.code) === String(code)) || null;

    const episodes = await getEpisodesCached(lang, code);
    return res.render("title", {
      pageTitle: title?.name || "Title",
      langs,
      title,
      code,
      episodes,
      lang
    });
  } catch (e) {
    logApi("TITLE", e, { lang, code });
    return res.status(500).send("API error on title");
  }
});

// ✅ Watch page (SSR) — tidak expose video URL di HTML
router.get("/watch/:code/:ep", async (req, res) => {
  const lang = res.locals.lang || "en";
  const { code, ep } = req.params;

  try {
    const langs = await getLangsCached();

    // fetch sekali untuk dapat metadata (name/total/expires_in), tapi JANGAN kirim video url ke view
    const p = await getPlayShortCached(lang, code, ep);

    const payloadSafe = {
      id: p?.id || null,
      name: p?.name || "",
      episode: Number(p?.episode || ep),
      total: Number(p?.total || 0),
      expires: p?.expires ?? null,
      expires_in: p?.expires_in ?? null
      // video sengaja dihapus (tidak expose)
    };

    return res.render("watch", {
      pageTitle: `${payloadSafe?.name || "Watch"} • EP ${ep}`,
      langs,
      lang,
      code,
      ep: Number(ep),
      payload: payloadSafe,
      cover: safeDecode(req.query.cover),
      tname: safeDecode(req.query.name)
    });
  } catch (e) {
    logApi("WATCH", e, { lang, code, ep });
    return res.status(500).send("API error on play");
  }
});

/**
 * ✅ API endpoint untuk ambil play URL (dipanggil dari client via jQuery)
 * GET /api/play/:code/:ep?lang=en
 */
router.get("/api/play/:code/:ep", async (req, res) => {
  const lang = (req.query.lang || res.locals.lang || "en").toString();
  const { code, ep } = req.params;

  try {
    // fetch fresh (tanpa cache) untuk auth_key baru
    const payload = await fetchPlayPreferProxy(code, ep, lang);

    // optional: update cache pendek juga
    try {
      cache.set(k("play", lang, code, ep), payload?.data, 1000 * 20);
    } catch (_) {}

    return res.json({
      ok: true,
      data: payload?.data,
      cached: payload?.cached ?? false,
      ttl: payload?.ttl ?? null
    });
  } catch (e) {
    logApi("API_PLAY", e, { lang, code, ep, preferProxy: PREFER_PROXY_PLAY });
    return res.status(500).json({ ok: false, error: "Failed to load play URL" });
  }
});

module.exports = router;
