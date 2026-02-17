// backend/server.js — Insight Vault MVP
// ─────────────────────────────────────────
// Stack: Express · Multer · OpenAI · SQLite
// ─────────────────────────────────────────

require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const { v4: uuidv4 } = require("uuid");
const Database = require("better-sqlite3");
const OpenAI   = require("openai");

const app = express();
app.use(express.json());
app.use(cors());

// ─── Uploads folder ───────────────────────
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── SQLite ───────────────────────────────
const db = new Database(path.join(__dirname, "vault.db"));

db.exec(`
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

  CREATE TABLE IF NOT EXISTS classification_log (
    id          TEXT PRIMARY KEY,
    item_id     TEXT,
    prompt      TEXT,
    response    TEXT,
    model       TEXT,
    tokens      INTEGER,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS taxonomy_history (
    id          TEXT PRIMARY KEY,
    action      TEXT,
    pillar_id   TEXT,
    topic_id    TEXT,
    detail      TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ─── OpenAI ───────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Multer (disk storage) ─────────────────
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename:    (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_, file, cb) => {
    const allowed = [".pdf", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// ─── Taxonomy ─────────────────────────────
const PILLARS = [
  { id: "P1", name_en: "Personal Development & Effectiveness", name_pt: "Desenvolvimento Pessoal & Eficácia",
    topics: ["Habits & Discipline","Learning Systems","Deep Work","Growth Mindset","Time Management","Resilience"] },
  { id: "P2", name_en: "Health, Wellbeing & Spirituality",     name_pt: "Saúde, Bem-estar e Espiritualidade",
    topics: ["Physical Health","Mental Health","Nutrition","Sleep","Spirituality","Meditation","Emotional Intelligence"] },
  { id: "P3", name_en: "Attitude & Image",                     name_pt: "Atitude e Imagem",
    topics: ["Personal Branding","Public Image","Social Media","Creativity","Authenticity"] },
  { id: "P4", name_en: "Relationships, Communication & Sales", name_pt: "Relacionamentos, Comunicação e Vendas",
    topics: ["Communication","Active Listening","Networking","Sales","Negotiation","Storytelling","Empathy"] },
  { id: "P5", name_en: "Leadership, Strategy & Culture",       name_pt: "Liderança, Estratégia & Cultura",
    topics: ["Leadership","Team Management","Strategy","Decision Making","Organizational Culture","Delegation"] },
  { id: "P6", name_en: "Business, Money & Wealth",             name_pt: "Business, Money & Wealth",
    topics: ["Finance","Investments","Entrepreneurship","Capital Allocation","Risk Management","Wealth Building"] },
  { id: "P7", name_en: "Values, Character & Integrity",        name_pt: "Valores, Caráter e Integridade",
    topics: ["Ethics","Integrity","Courage","Character","Principles","Humility","Service"] },
  { id: "P8", name_en: "Family & Legacy",                      name_pt: "Família & Legado",
    topics: ["Family","Legacy","Parenting","Emotional Presence","Traditions","Life Model"] },
];

const taxonomyText = PILLARS.map(p =>
  `${p.id}: ${p.name_en} / ${p.name_pt}\n  Topics: ${p.topics.join(", ")}`
).join("\n");

// ─── AI Classification ────────────────────
async function classifyWithAI(text, filename) {
  const systemPrompt = `You are a knowledge classification engine for Insight Vault.
You MUST respond with valid JSON only — no explanation, no markdown, no extra text.

Taxonomy of 8 pillars:
${taxonomyText}

Classify the given content and return exactly this JSON structure:
{
  "summary": "2-3 sentence summary in the language of the content",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "pillar_id": "P1",
  "pillar_name": "Pillar name in English",
  "topic_id": "T_slug",
  "topic_name": "Most relevant topic name",
  "confidence": 0.92,
  "rationale": "One sentence explaining why this pillar was chosen",
  "suggest_new_topic": null
}

Rules:
- tags: 3–7 lowercase keywords relevant to the content
- confidence: 0.0 to 1.0
- suggest_new_topic: only if content doesn't fit existing topics; otherwise null
- pillar_id must be one of: P1, P2, P3, P4, P5, P6, P7, P8`;

  const userPrompt = `Filename: ${filename}\n\nContent:\n${text.slice(0, 4000)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system",  content: systemPrompt },
      { role: "user",    content: userPrompt },
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

// ─── Text extraction (simple) ──────────────
function extractText(filePath, mimetype, originalname) {
  // For text files: read directly
  const ext = path.extname(originalname).toLowerCase();
  if ([".txt", ".md"].includes(ext)) {
    return fs.readFileSync(filePath, "utf8");
  }
  // PDF / images: return a placeholder (extend later with pdf-parse / tesseract)
  return `[File: ${originalname}] — binary content, extraction pending.`;
}

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════

// ─── Health ───────────────────────────────
app.get("/health", (_, res) => {
  const itemCount = db.prepare("SELECT COUNT(*) as n FROM items").get().n;
  res.json({
    status: "ok",
    version: "2.0.0",
    items: itemCount,
    openai: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ─── Taxonomy ─────────────────────────────
app.get("/pillars", (_, res) => res.json(PILLARS));

app.get("/topics", (req, res) => {
  const pillar = (req.query.pillar || "").trim();
  if (!pillar) return res.status(400).json({ error: "Missing ?pillar=P1" });
  const p = PILLARS.find(x => x.id === pillar);
  if (!p) return res.status(404).json({ error: "Pillar not found" });
  const topics = p.topics.map((t, i) => ({
    id:      `${pillar}-T${i + 1}`,
    pillar:  pillar,
    name_en: t,
    name_pt: t,
  }));
  res.json(topics);
});

app.get("/items", (req, res) => {
  const topic = (req.query.topic || "").trim();
  if (!topic) return res.status(400).json({ error: "Missing ?topic=T1" });
  const rows = db.prepare("SELECT * FROM items WHERE topic_id = ? ORDER BY created_at DESC").all(topic);
  res.json(rows.map(parseItem));
});

// ─── Upload + Classify ────────────────────
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file received." });

  const id = uuidv4();
  const { filename, originalname, mimetype, size, path: filePath } = req.file;

  // 1. Extract text
  const text = extractText(filePath, mimetype, originalname);

  // 2. Insert as pending
  db.prepare(`
    INSERT INTO items (id, filename, original, mimetype, size, text, status)
    VALUES (?, ?, ?, ?, ?, ?, 'classifying')
  `).run(id, filename, originalname, mimetype, size, text);

  // 3. Classify with AI
  if (!process.env.OPENAI_API_KEY) {
    db.prepare("UPDATE items SET status='needs_api_key' WHERE id=?").run(id);
    return res.status(202).json({
      id,
      status: "needs_api_key",
      message: "Set OPENAI_API_KEY environment variable to enable AI classification.",
    });
  }

  try {
    const { result, logData } = await classifyWithAI(text, originalname);

    // 4. Update item with classification
    db.prepare(`
      UPDATE items SET
        summary    = ?,
        tags       = ?,
        pillar_id  = ?,
        pillar_name= ?,
        topic_id   = ?,
        topic_name = ?,
        confidence = ?,
        rationale  = ?,
        status     = 'classified',
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      result.summary,
      JSON.stringify(result.tags),
      result.pillar_id,
      result.pillar_name,
      result.topic_id,
      result.topic_name,
      result.confidence,
      result.rationale,
      id
    );

    // 5. Audit log
    db.prepare(`
      INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens);

    const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
    res.json({ success: true, item: parseItem(item) });

  } catch (err) {
    console.error("AI classification error:", err.message);
    db.prepare("UPDATE items SET status='error', rationale=? WHERE id=?")
      .run(err.message, id);
    res.status(500).json({ error: "AI classification failed.", detail: err.message, id });
  }
});

// ─── Confirm / Edit classification ────────
app.patch("/items/:id/confirm", (req, res) => {
  const { id } = req.params;
  const { pillar_id, pillar_name, topic_id, topic_name, tags, summary } = req.body;

  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  if (!item) return res.status(404).json({ error: "Item not found." });

  db.prepare(`
    UPDATE items SET
      pillar_id  = COALESCE(?, pillar_id),
      pillar_name= COALESCE(?, pillar_name),
      topic_id   = COALESCE(?, topic_id),
      topic_name = COALESCE(?, topic_name),
      tags       = COALESCE(?, tags),
      summary    = COALESCE(?, summary),
      status     = 'confirmed',
      updated_at = datetime('now')
    WHERE id = ?
  `).run(pillar_id, pillar_name, topic_id, topic_name,
         tags ? JSON.stringify(tags) : null, summary, id);

  const updated = db.prepare("SELECT * FROM items WHERE id = ?").get(id);
  res.json({ success: true, item: parseItem(updated) });
});

// ─── List all items ────────────────────────
app.get("/vault", (req, res) => {
  const { pillar, status, limit = 50, offset = 0 } = req.query;
  let query = "SELECT * FROM items WHERE 1=1";
  const params = [];

  if (pillar) { query += " AND pillar_id = ?"; params.push(pillar); }
  if (status) { query += " AND status = ?";    params.push(status); }

  query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
  params.push(Number(limit), Number(offset));

  const rows = db.prepare(query).all(...params);
  const total = db.prepare("SELECT COUNT(*) as n FROM items").get().n;
  res.json({ total, items: rows.map(parseItem) });
});

// ─── Get single item ───────────────────────
app.get("/items/:id", (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ error: "Item not found." });
  res.json(parseItem(item));
});

// ─── Classification audit log ──────────────
app.get("/logs", (_, res) => {
  const logs = db.prepare("SELECT * FROM classification_log ORDER BY created_at DESC LIMIT 100").all();
  res.json(logs);
});

// ─── Serve static uploads ──────────────────
app.use("/uploads", express.static(UPLOAD_DIR));

// ─── Helper ───────────────────────────────
function parseItem(row) {
  if (!row) return null;
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  };
}

// ─── Start ────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🔐 Insight Vault API v2 running on port ${PORT}`));
