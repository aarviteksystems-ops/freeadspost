import express from "express";
import cors from "cors";
import crypto from "crypto";

try {
  process.loadEnvFile?.();
} catch {
  // Ignore error if .env file is not present
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const WEBHOOK_URL = () => String(process.env.GOOGLE_SHEET_WEBHOOK_URL || "").trim();
const DEFAULT_SECRET = "freeadspost-default-session-token-secret-key-2026-v1";
const TOKEN_SECRET = () => {
  const envSecret = String(process.env.FREEADSPOST_TOKEN_SECRET || "").trim();
  return envSecret || DEFAULT_SECRET;
};

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function createToken(userId) {
  const secret = TOKEN_SECRET();
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
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.sub || !data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

function getToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || (typeof req.get === "function" ? req.get("authorization") : "") || "";
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
  try {
    data = JSON.parse(text);
  } catch {
    const errMatch = text.match(/<div[^>]*>([^<]*(?:Script function not found|Exception|Error)[^<]*)<\/div>/i) || text.match(/<title>([^<]*)<\/title>/i);
    const cleanErr = errMatch ? errMatch[1].trim() : "Invalid response from storage service. Check your Google Apps Script deployment.";
    const err = new Error(cleanErr);
    err.status = 502;
    throw err;
  }
  if (!response.ok || data.status === "error" || !data || typeof data !== "object") {
    const err = new Error(data?.error || data?.message || `Storage service returned error`);
    err.status = Number(data?.code) || (response.ok ? 500 : response.status) || 502;
    throw err;
  }
  return data;
}

function publicUser(user) {
  if (!user) return null;
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

const router = express.Router();

router.get("/health", async (_req, res) => {
  try {
    const data = await gas("health");
    res.json({ ok: true, storage: data.storage || "google-sheets" });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, companyName, password } = req.body || {};
    if (!name || !email || !phone || !password) return res.status(400).json({ error: "Name, email, phone and password are required" });
    const cleanPhone = String(phone).replace(/[^\d]/g, "");
    if (!/^\d{7,15}$/.test(cleanPhone)) return res.status(400).json({ error: "Please enter a valid phone number (7 to 15 digits)" });
    const data = await gas("register", {
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      phone: cleanPhone,
      companyName: String(companyName || "").trim(),
      password: String(password)
    });
    if (!data?.user?.id) throw new Error(data?.error || "Registration failed on storage service");
    const token = createToken(data.user.id);
    res.status(201).json({ token, user: publicUser(data.user) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    const data = await gas("login", { email, password });
    if (!data?.user?.id) throw new Error(data?.error || "Invalid email or password");
    const token = createToken(data.user.id);
    res.json({ token, user: publicUser(data.user) });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.use(async (req, res, next) => {
  if (!["POST", "DELETE"].includes(req.method)) return next();
  const path = req.path;
  if (!["/activity", "/availability", "/logout", "/ads"].includes(path) && !(path.startsWith("/ads/") && req.method === "DELETE")) return next();
  const userId = authUser(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  req.userId = userId;
  next();
});

router.post("/activity", async (req, res) => {
  try {
    const data = await gas("activity", { userId: req.userId });
    if (!data?.user) throw new Error(data?.error || "User not found on storage service");
    res.json({ user: publicUser(data.user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/availability", async (req, res) => {
  try {
    const data = await gas("availability", { userId: req.userId, available: !!req.body?.available });
    if (!data?.user) throw new Error(data?.error || "User not found on storage service");
    res.json({ user: publicUser(data.user) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/logout", async (req, res) => {
  try { await gas("logout", { userId: req.userId }); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/ads", async (_req, res) => {
  try { const data = await gas("getAds"); res.json(data.ads || []); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/ads/:id", async (req, res) => {
  try {
    const data = await gas("getAd", { id: req.params.id, viewerUserId: authUser(req) || "" });
    res.json(data.ad);
  } catch (e) { res.status(e.status === 404 ? 404 : 500).json({ error: e.message }); }
});

router.post("/ads", async (req, res) => {
  try {
    const { title, category, condition, description, price, priceType, city, state, image, images } = req.body || {};
    if (!title || !category || !description || !city) return res.status(400).json({ error: "Title, category, description and city are required" });
    const data = await gas("createAd", { userId: req.userId, title, category, condition, description, price, priceType, city, state, image, images });
    res.status(201).json(data.ad);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/my-ads", async (req, res) => {
  const userId = authUser(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });
  try { const data = await gas("myAds", { userId }); res.json(data.ads || []); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/ads/:id", async (req, res) => {
  try { const data = await gas("deleteAd", { userId: req.userId, id: req.params.id }); res.json({ message: data.message || "Ad deleted successfully" }); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

app.use("/api", router);
app.use(router);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;

import { fileURLToPath } from "url";

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun && !process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`FreeAdsPost API running at http://localhost:${PORT}`));
}
