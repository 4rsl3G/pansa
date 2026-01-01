const axios = require("axios");

const api = axios.create({
  baseURL: process.env.SHORTMAX_API_BASE,
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${process.env.SHORTMAX_TOKEN}`
  }
});

function normalizeLang(lang) {
  return (lang || "en").toString().trim();
}

module.exports = {
  async getLanguages() {
    const { data } = await api.get(`/languages?`);
    return data;
  },

  async getHome(lang) {
    const { data } = await api.get(`/home?lang=${encodeURIComponent(normalizeLang(lang))}`);
    return data;
  },

  async search(q, lang) {
    const { data } = await api.get(
      `/search?q=${encodeURIComponent(q || "")}&lang=${encodeURIComponent(normalizeLang(lang))}`
    );
    return data;
  },

  async getEpisodes(code, lang) {
    const { data } = await api.get(
      `/episodes/${encodeURIComponent(code)}?lang=${encodeURIComponent(normalizeLang(lang))}`
    );
    return data;
  },

  async getPlay(code, ep, lang) {
    const { data } = await api.get(
      `/play/${encodeURIComponent(code)}?lang=${encodeURIComponent(normalizeLang(lang))}&ep=${encodeURIComponent(ep)}`
    );
    return data;
  }
};
