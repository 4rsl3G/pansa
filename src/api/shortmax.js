/**
 * shortmax.js
 * - API v1: /api/v1/...
 * - Proxy: /proxy/play/:code
 * - Retry logic improved (includes 429)
 */

const axios = require("axios");

const baseRoot = process.env.SHORTMAX_API_BASE || "https://sapimu.au/shortmax";
const token = process.env.SHORTMAX_TOKEN;

function createClient(baseURL) {
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

const apiV1 = createClient(`${baseRoot}/api/v1`);
const proxyApi = createClient(`${baseRoot}/proxy`);

async function withRetry(fn, tries = 2) {
  let lastErr;

  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;

      const code = e?.code || "";
      const status = e?.response?.status || 0;

      const retryable =
        ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"].includes(code) ||
        status === 429 ||
        status >= 500;

      if (!retryable) break;
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }

  throw lastErr;
}

function assertToken() {
  // Optional: kalau kamu pengen strict, uncomment ini:
  // if (!token) throw new Error("SHORTMAX_TOKEN is missing");
}

/** API v1 endpoints */
const getLanguages = () => {
  assertToken();
  return withRetry(() => apiV1.get("/languages")).then((r) => r.data);
};

const getHome = (lang) => {
  assertToken();
  return withRetry(() => apiV1.get("/home", { params: { lang } })).then((r) => r.data);
};

const search = (q, lang) => {
  assertToken();
  return withRetry(() => apiV1.get("/search", { params: { q, lang } })).then((r) => r.data);
};

const getEpisodes = (code, lang) => {
  assertToken();
  return withRetry(() =>
    apiV1.get(`/episodes/${encodeURIComponent(code)}`, { params: { lang } })
  ).then((r) => r.data);
};

const getPlay = (code, ep, lang) => {
  assertToken();
  return withRetry(() =>
    apiV1.get(`/play/${encodeURIComponent(code)}`, { params: { lang, ep } })
  ).then((r) => r.data);
};

const getProxyPlay = (code, ep, lang) => {
  assertToken();
  return withRetry(() =>
    proxyApi.get(`/play/${encodeURIComponent(code)}`, { params: { lang, ep } })
  ).then((r) => r.data);
};

/**
 * Helper: prefer proxy, fallback to v1
 */
const getBestPlay = async (code, ep, lang) => {
  try {
    return await getProxyPlay(code, ep, lang);
  } catch (_) {
    return await getPlay(code, ep, lang);
  }
};

module.exports = {
  getLanguages,
  getHome,
  search,
  getEpisodes,
  getPlay,
  getProxyPlay,
  getBestPlay
};
