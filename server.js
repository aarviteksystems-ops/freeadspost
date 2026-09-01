import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const WEBHOOK_URL = () => String(process.env.GOOGLE_SHEET_WEBHOOK_URL || "").trim();
const TOKEN_SECRET = () => String(process.env.FREEADSPOST_TOKEN_SECRET || "").trim();

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createToken(userId) {
  const secret = TOKEN_SECRET();
  if (!secret) throw new Error("FREEADSPOST_TOKEN_SECRET is not configured");
  const payload = base64url(JSON.stringify({ sub: userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
  const signature = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
  return `fap.${payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const secret = TOKEN_SECRET();
    if (!secret || !token?.startsWith("fap.")) return null;
    const [, payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = base64url(crypto.createHmac("sha256", secret).update(payload).digest());
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.sub || !data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function gas(action, payload = {}) {
  const url = WEBHOOK_URL();
  if (!url) throw new Error("GOOGLE_SHEET_WEBHOOK_URL is not configured");
  const response = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { error: text || "Invalid response from storage service" }; }
  if (!response.ok || data.status === "error") {
    const err = new Error(data.error || data.message || `Storage service returned ${response.status}`);
    err.status = Number(data.code) || response.status || 502;
    throw err;
  }
  return data;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email || "",
    phone: user.phone || "",
    companyName: user.companyName || "",
    availabilityStatus: user.availabilityStatus || "away",
    lastActiveAt: user.lastActiveAt || null,
  };
}

function authUser(req) {
  const token = getToken(req);
  const verified = verifyToken(token);
  return verified?.sub || null;
}

app.get("/api/health", async (_req, res) => {
  try {
    const data = await gas("health");
    res.json({ ok: true, storage: data.storage || "google-sheets" });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, phone, companyName, password } = req.body || {};
    if (!name || !email || !phone || !password) return res.status(400).json({ error: "Name, email, phone and password are required" });
    const data = await gas("register", { name, email, phone, companyName: companyName || "", password });
    const token = createToken(data.user.id);
    res.status(201).json({ token, user: publicUser(data.user) });
  } catch (e) { res.status(e.status === 409 ? 409 : 500).json({ error: e.message }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const data = await gas("login", { email, password });
    res.json({ token: createToken(data.user.id), user: publicUser(data.user) });
  } catch (e) { res.status(e.status === 401 ? 401 : 500).json({ error: e.message }); }
});

app.use("/api", async (req, res, next) => {
  if (!["POST", "DELETE"].includes(req.method)) return next();
  const path = req.path;
  if (!["/activity", "/availability", "/logout", "/ads"].includes(path) && !(path.startsWith("/ads/") && req.method === "DELETE")) return next();
  const userId = authUser(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  req.userId = userId;
  next();
});

app.post("/api/activity", async (req, res) => {
  try { const data = await gas("activity", { userId: req.userId }); res.json({ user: publicUser(data.user) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/availability", async (req, res) => {
  try { const data = await gas("availability", { userId: req.userId, available: !!req.body?.available }); res.json({ user: publicUser(data.user) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/logout", async (req, res) => {
  try { await gas("logout", { userId: req.userId }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/ads", async (_req, res) => {
  try { const data = await gas("getAds"); res.json(data.ads || []); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/ads/:id", async (req, res) => {
  try {
    const data = await gas("getAd", { id: req.params.id, viewerUserId: authUser(req) || "" });
    res.json(data.ad);
  } catch (e) { res.status(e.status === 404 ? 404 : 500).json({ error: e.message }); }
});

app.post("/api/ads", async (req, res) => {
  try {
    const { title, category, condition, description, price, priceType, city, state, image, images } = req.body || {};
    if (!title || !category || !description || !city) return res.status(400).json({ error: "Title, category, description and city are required" });
    const data = await gas("createAd", { userId: req.userId, title, category, condition, description, price, priceType, city, state, image, images });
    res.status(201).json(data.ad);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/my-ads", async (req, res) => {
  const userId = authUser(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  try { const data = await gas("myAds", { userId }); res.json(data.ads || []); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/ads/:id", async (req, res) => {
  try { const data = await gas("deleteAd", { userId: req.userId, id: req.params.id }); res.json({ message: data.message || "Ad deleted successfully" }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;

if (process.env.VERCEL !== "1") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`FreeAdsPost API running at http://localhost:${PORT}`));
}
