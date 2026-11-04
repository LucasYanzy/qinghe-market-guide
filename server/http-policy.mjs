export function installHttpPolicy(app, { trustProxy = 0, publicOrigin, secureCookie = false } = {}) {
  app.disable("x-powered-by");
  // A fixed hop count avoids trusting arbitrary client-provided proxy headers.
  app.set("trust proxy", trustProxy);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    });
    if (secureCookie) res.set("Strict-Transport-Security", "max-age=31536000");
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.get("origin");
    let allowed = !origin;
    if (origin) {
      try {
        const parsed = new URL(origin);
        allowed = /^https?:$/.test(parsed.protocol) && parsed.origin === (publicOrigin ?? `${req.protocol}://${req.get("host")}`);
      } catch {
        allowed = false;
      }
    }
    if (req.get("sec-fetch-site") === "cross-site" || !allowed)
      return res.status(403).json({ error: "请从本站提交请求。" });
    next();
  });
}
