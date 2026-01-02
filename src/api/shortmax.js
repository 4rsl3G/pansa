/**
 * shortmax.js
 * Full updated client:
 * - Supports API v1 endpoints: /api/v1/...
 * - Adds proxy play endpoint: /proxy/play/:code (sesuai contoh curl)
 * - Keeps retry logic
 */

const axios = require("axios");

// Base root: https://sapimu.au/shortmax
const baseRoot = process.env.SHORTMAX_API_BASE || "https://sapimu.au/shortmax";
const token = process.env.SHORTMAX_TOKEN;

function createClient(baseURL) {
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
}

// API v1 client: https://sapimu.au/shortmax/api/v1
const apiV1 = createClient(`${baseRoot}/api/v1`);

// Proxy client: https://sapimu.au/shortmax/proxy
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
        status >= 500;

      if (!retryable) break;

      // simple linear backoff
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }

  throw lastErr;
}

/**
 * API v1 endpoints
 */
const getLanguages = () =>
  withRetry(() => apiV1.get("/languages")).then((r) => r.data);

const getHome = (lang) =>
  withRetry(() => apiV1.get("/home", { params: { lang } })).then((r) => r.data);

const search = (q, lang) =>
  withRetry(() => apiV1.get("/search", { params: { q, lang } })).then((r) => r.data);

const getEpisodes = (code, lang) =>
  withRetry(() =>
    apiV1.get(`/episodes/${encodeURIComponent(code)}`, { params: { lang } })
  ).then((r) => r.data);

// ✅ play selalu fresh di server routes /api/play refresh
const getPlay = (code, ep, lang) =>
  withRetry(() =>
    apiV1.get(`/play/${encodeURIComponent(code)}`, { params: { lang, ep } })
  ).then((r) => r.data);

/**
 * NEW: Proxy endpoint (sesuai curl)
 * GET https://sapimu.au/shortmax/proxy/play/:code?lang=en&ep=1
 */
const getProxyPlay = (code, ep, lang) =>
  withRetry(() =>
    proxyApi.get(`/play/${encodeURIComponent(code)}`, { params: { lang, ep } })
  ).then((r) => r.data);

module.exports = {
  getLanguages,
  getHome,
  search,
  getEpisodes,
  getPlay,
  getProxyPlay
};
