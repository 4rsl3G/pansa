const axios = require("axios");

const baseURL = process.env.SHORTMAX_API_BASE || "https://sapimu.au/shortmax/api/v1";
const token = process.env.SHORTMAX_TOKEN;

const api = axios.create({
  baseURL,
  timeout: 15000,
  headers: { Authorization: `Bearer ${token}` }
});

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
      await new Promise(r => setTimeout(r, 350 * (i + 1)));
    }
  }
  throw lastErr;
}

const getLanguages = () => withRetry(() => api.get(`/languages?`)).then(r => r.data);
const getHome = (lang) => withRetry(() => api.get(`/home?lang=${encodeURIComponent(lang)}`)).then(r => r.data);
const search = (q, lang) => withRetry(() => api.get(`/search?q=${encodeURIComponent(q)}&lang=${encodeURIComponent(lang)}`)).then(r => r.data);
const getEpisodes = (code, lang) => withRetry(() => api.get(`/episodes/${encodeURIComponent(code)}?lang=${encodeURIComponent(lang)}`)).then(r => r.data);

// ✅ play selalu fresh di server routes /api/play refresh
const getPlay = (code, ep, lang) =>
  withRetry(() =>
    api.get(`/play/${encodeURIComponent(code)}?lang=${encodeURIComponent(lang)}&ep=${encodeURIComponent(ep)}`)
  ).then(r => r.data);

module.exports = { getLanguages, getHome, search, getEpisodes, getPlay };
