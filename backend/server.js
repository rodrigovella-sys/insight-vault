// backend/server.js — Insight Vault MVP v2.2
require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const OpenAI   = require("openai");
const { google } = require("googleapis");
const axios    = require("axios");
const initSqlJs = require("sql.js");
const pdfParse  = require("pdf-parse");

const app = express();
app.use(express.json());
app.use(cors());

// ── Uploads folder ─────────────────────────
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── SQL.js database ────────────────────────
const DB_PATH = path.join(__dirname, "vault.db");
let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS items (
      id          TEXT PRIMARY KEY,
      filename    TEXT,
      original    TEXT,
      mimetype    TEXT,
      size        INTEGER,
      text        TEXT,
      summary     TEXT,
      tags        TEXT,
      pillar_id   TEXT,
      pillar_name TEXT,
      topic_id    TEXT,
      topic_name  TEXT,
      confidence  REAL,
      rationale   TEXT,
      status      TEXT DEFAULT 'pending',
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS classification_log (
      id          TEXT PRIMARY KEY,
      item_id     TEXT,
      prompt      TEXT,
      response    TEXT,
      model       TEXT,
      tokens      INTEGER,
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);
  saveDB();
  console.log("Database ready.");
}

function saveDB() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  saveDB();
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── OpenAI ─────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── YouTube API ────────────────────────────
const youtube = google.youtube({ version: "v3", auth: process.env.YOUTUBE_API_KEY });

// ── Multer ─────────────────────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = [".pdf",".txt",".md",".png",".jpg",".jpeg",".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ── Taxonomy ───────────────────────────────
const PILLARS = [
  { id:"P1", name_en:"Personal Development & Effectiveness", name_pt:"Desenvolvimento Pessoal & Eficácia",
    topics:["Habits & Discipline","Learning Systems","Deep Work","Growth Mindset","Time Management","Resilience"] },
  { id:"P2", name_en:"Health, Wellbeing & Spirituality", name_pt:"Saúde, Bem-estar e Espiritualidade",
    topics:["Physical Health","Mental Health","Nutrition","Sleep","Spirituality","Meditation","Emotional Intelligence"] },
  { id:"P3", name_en:"Attitude & Image", name_pt:"Atitude e Imagem",
    topics:["Personal Branding","Public Image","Social Media","Creativity","Authenticity"] },
  { id:"P4", name_en:"Relationships, Communication & Sales", name_pt:"Relacionamentos, Comunicação e Vendas",
    topics:["Communication","Active Listening","Networking","Sales","Negotiation","Storytelling","Empathy"] },
  { id:"P5", name_en:"Leadership, Strategy & Culture", name_pt:"Liderança, Estratégia & Cultura",
    topics:["Leadership","Team Management","Strategy","Decision Making","Culture","Delegation"] },
  { id:"P6", name_en:"Business, Money & Wealth", name_pt:"Business, Money & Wealth",
    topics:["Finance","Investments","Entrepreneurship","Capital Allocation","Risk Management"] },
  { id:"P7", name_en:"Values, Character & Integrity", name_pt:"Valores, Caráter e Integridade",
    topics:["Ethics","Integrity","Courage","Character","Principles","Humility","Service"] },
  { id:"P8", name_en:"Family & Legacy", name_pt:"Família & Legado",
    topics:["Family","Legacy","Parenting","Emotional Presence","Traditions","Life Model"] },
];

const taxonomyText = PILLARS.map(p =>
  `${p.id}: ${p.name_en}\n  Topics: ${p.topics.join(", ")}`
).join("\n");

// ── AI Classification ──────────────────────
async function classifyWithAI(text, filename) {
  const systemPrompt = `You are a knowledge classification engine for Insight Vault.
You MUST respond with valid JSON only — no explanation, no markdown, no extra text.

Taxonomy of 8 pillars:
${taxonomyText}

Return exactly this JSON structure:
{
  "summary": "2-3 sentence summary in the language of the content",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "pillar_id": "P1",
  "pillar_name": "Pillar name in English",
  "topic_id": "T_slug",
  "topic_name": "Most relevant topic name",
  "confidence": 0.92,
  "rationale": "One sentence explaining why this pillar was chosen",
  "suggest_new_topic": null
}

Rules:
- tags: 3-7 lowercase keywords
- confidence: 0.0 to 1.0
- suggest_new_topic: only if content does not fit existing topics; otherwise null
- pillar_id must be one of: P1, P2, P3, P4, P5, P6, P7, P8`;

  const userPrompt = `Filename: ${filename}\n\nContent:\n${text.slice(0, 4000)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content;
  const result = JSON.parse(raw);
  return {
    result,
    logData: {
      prompt: userPrompt,
      response: raw,
      model: response.model,
      tokens: response.usage?.total_tokens ?? 0,
    },
  };
}

// ── Text extraction (TXT, MD, PDF) ─────────
async function extractText(filePath, originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if ([".txt", ".md"].includes(ext)) {
    return fs.readFileSync(filePath, "utf8");
  }
  if (ext === ".pdf") {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      return data.text || "[PDF sem texto extraível]";
    } catch (e) {
      return `[Erro ao ler PDF: ${e.message}]`;
    }
  }
  return `[Arquivo ${originalname} — extração pendente]`;
}

// ── YouTube helpers ────────────────────────
function extractYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

async function getYouTubeCaptions(videoId) {
  try {
    const captionsResponse = await youtube.captions.list({
      part: "snippet",
      videoId: videoId,
    });

    if (!captionsResponse.data.items || captionsResponse.data.items.length === 0) {
      throw new Error("No captions available for this video");
    }

    // Prefer Portuguese, then English, then any available
    let caption = captionsResponse.data.items.find(c => c.snippet.language === "pt") ||
                  captionsResponse.data.items.find(c => c.snippet.language === "en") ||
                  captionsResponse.data.items[0];

    // Note: Downloading actual caption text requires additional OAuth
    // For now, we'll use video description + title as fallback
    const videoResponse = await youtube.videos.list({
      part: "snippet",
      id: videoId,
    });

    if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
      throw new Error("Video not found");
    }

    const video = videoResponse.data.items[0].snippet;
    return `Title: ${video.title}\n\nDescription: ${video.description}`;
  } catch (err) {
    throw new Error(`YouTube API error: ${err.message}`);
  }
}

function parseItem(row) {
  if (!row) return null;
  return { ...row, tags: row.tags ? JSON.parse(row.tags) : [] };
}

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════

// ── Health ─────────────────────────────────
app.get("/health", (_, res) => {
  const row = dbGet("SELECT COUNT(*) as n FROM items");
  res.json({
    status: "ok",
    version: "2.2.0",
    items: row ? row.n : 0,
    openai: !!process.env.OPENAI_API_KEY,
    youtube: !!process.env.YOUTUBE_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ── Pillars ────────────────────────────────
app.get("/pillars", (_, res) => res.json(PILLARS));

// ── Topics ─────────────────────────────────
app.get("/topics", (req, res) => {
  const pillar = (req.query.pillar || "").trim();
  if (!pillar) return res.status(400).json({ error: "Missing ?pillar=P1" });
  const p = PILLARS.find(x => x.id === pillar);
  if (!p) return res.status(404).json({ error: "Pillar not found" });
  const topics = p.topics.map((t, i) => ({
    id: `${pillar}-T${i + 1}`, pillar, name_en: t, name_pt: t,
  }));
  res.json(topics);
});

// ── Items by topic ─────────────────────────
app.get("/items", (req, res) => {
  const topic = (req.query.topic || "").trim();
  if (!topic) return res.status(400).json({ error: "Missing ?topic=T1" });
  const rows = dbAll("SELECT * FROM items WHERE topic_id = ? ORDER BY created_at DESC", [topic]);
  res.json(rows.map(parseItem));
});

// ── Upload + Classify ──────────────────────
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received." });

  const id = uuidv4();
  const { filename, originalname, mimetype, size, path: filePath } = req.file;
  const text = await extractText(filePath, originalname);

  dbRun(
    `INSERT INTO items (id, filename, original, mimetype, size, text, status)
     VALUES (?, ?, ?, ?, ?, ?, 'classifying')`,
    [id, filename, originalname, mimetype, size, text]
  );

  if (!process.env.OPENAI_API_KEY) {
    dbRun("UPDATE items SET status='needs_api_key' WHERE id=?", [id]);
    return res.status(202).json({ id, status: "needs_api_key",
      message: "Set OPENAI_API_KEY to enable classification." });
  }

  try {
    const { result, logData } = await classifyWithAI(text, originalname);
    dbRun(
      `UPDATE items SET summary=?, tags=?, pillar_id=?, pillar_name=?,
       topic_id=?, topic_name=?, confidence=?, rationale=?,
       status='classified', updated_at=datetime('now') WHERE id=?`,
      [result.summary, JSON.stringify(result.tags), result.pillar_id, result.pillar_name,
       result.topic_id, result.topic_name, result.confidence, result.rationale, id]
    );
    dbRun(
      `INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens]
    );
    const item = dbGet("SELECT * FROM items WHERE id=?", [id]);
    res.json({ success: true, item: parseItem(item) });
  } catch (err) {
    console.error("Upload error:", err.message);
    dbRun("UPDATE items SET status='error', rationale=? WHERE id=?", [err.message, id]);
    res.status(500).json({ error: "AI classification failed.", detail: err.message, id });
  }
});

// ── YouTube ────────────────────────────────
app.post("/youtube", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing url." });

  const videoId = extractYouTubeId(url);
  if (!videoId) return res.status(400).json({ error: "Invalid YouTube URL." });

  if (!process.env.YOUTUBE_API_KEY) {
    return res.status(400).json({ error: "YOUTUBE_API_KEY not configured." });
  }

  try {
    const text = await getYouTubeCaptions(videoId);

    const id = uuidv4();
    dbRun(
      `INSERT INTO items (id, filename, original, mimetype, size, text, status)
       VALUES (?, ?, ?, ?, ?, ?, 'classifying')`,
      [id, `yt_${videoId}`, url, "video/youtube", text.length, text]
    );

    if (!process.env.OPENAI_API_KEY) {
      dbRun("UPDATE items SET status='needs_api_key' WHERE id=?", [id]);
      return res.status(202).json({ id, status: "needs_api_key" });
    }

    const { result, logData } = await classifyWithAI(text, `YouTube: ${url}`);
    dbRun(
      `UPDATE items SET summary=?, tags=?, pillar_id=?, pillar_name=?,
       topic_id=?, topic_name=?, confidence=?, rationale=?,
       status='classified', updated_at=datetime('now') WHERE id=?`,
      [result.summary, JSON.stringify(result.tags), result.pillar_id, result.pillar_name,
       result.topic_id, result.topic_name, result.confidence, result.rationale, id]
    );
    dbRun(
      `INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens]
    );
    const item = dbGet("SELECT * FROM items WHERE id=?", [id]);
    res.json({ success: true, item: parseItem(item) });
  } catch (err) {
    console.error("YouTube error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Confirm classification ─────────────────
app.patch("/items/:id/confirm", (req, res) => {
  const { id } = req.params;
  const { pillar_id, pillar_name, topic_id, topic_name, tags, summary } = req.body;
  const item = dbGet("SELECT * FROM items WHERE id=?", [id]);
  if (!item) return res.status(404).json({ error: "Item not found." });

  dbRun(
    `UPDATE items SET
       pillar_id=COALESCE(?,pillar_id),   pillar_name=COALESCE(?,pillar_name),
       topic_id=COALESCE(?,topic_id),     topic_name=COALESCE(?,topic_name),
       tags=COALESCE(?,tags),             summary=COALESCE(?,summary),
       status='confirmed', updated_at=datetime('now')
     WHERE id=?`,
    [pillar_id||null, pillar_name||null, topic_id||null, topic_name||null,
     tags ? JSON.stringify(tags) : null, summary||null, id]
  );
  const updated = dbGet("SELECT * FROM items WHERE id=?", [id]);
  res.json({ success: true, item: parseItem(updated) });
});

// ── Vault (list all) ───────────────────────
app.get("/vault", (req, res) => {
  const { pillar, status, limit = 50, offset = 0 } = req.query;
  let query = "SELECT * FROM items WHERE 1=1";
  const params = [];
  if (pillar) { query += " AND pillar_id=?"; params.push(pillar); }
  if (status) { query += " AND status=?";    params.push(status); }
  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));
  const rows = dbAll(query, params);
  const total = dbGet("SELECT COUNT(*) as n FROM items");
  res.json({ total: total ? total.n : 0, items: rows.map(parseItem) });
});

// ── Single item ────────────────────────────
app.get("/items/:id", (req, res) => {
  const item = dbGet("SELECT * FROM items WHERE id=?", [req.params.id]);
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json(parseItem(item));
});

// ── Logs ───────────────────────────────────
app.get("/logs", (_, res) => {
  const logs = dbAll("SELECT * FROM classification_log ORDER BY created_at DESC LIMIT 100");
  res.json(logs);
});

// ── Static uploads ─────────────────────────
app.use("/uploads", express.static(UPLOAD_DIR));

// ── Start ──────────────────────────────────
const PORT = process.env.PORT || 3000;
initDB().then(() => {
  app.listen(PORT, () => console.log(`Insight Vault API v2.2 running on port ${PORT}`));
});
