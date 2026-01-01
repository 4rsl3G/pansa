module.exports = function langMiddleware(req, res, next) {
  const fromQuery = req.query.lang;
  const fromCookie = req.cookies.lang;
  const lang = (fromQuery || fromCookie || "en").toString();

  if (fromQuery && fromQuery !== fromCookie) {
    res.cookie("lang", lang, { httpOnly: false, sameSite: "lax" });
  }

  res.locals.lang = lang;
  res.locals.q = req.query.q || "";
  next();
};
