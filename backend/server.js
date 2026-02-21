// backend/server.js — Insight Vault v2.4 — Full Taxonomy (better-sqlite3)
require(“dotenv”).config();
const express  = require(“express”);
const cors     = require(“cors”);
const multer   = require(“multer”);
const path     = require(“path”);
const fs       = require(“fs”);
const { v4: uuidv4 } = require(“uuid”);
const Database = require(“better-sqlite3”);
const OpenAI   = require(“openai”);
const { google } = require(“googleapis”);
const pdfParse  = require(“pdf-parse”);

const app = express();
app.use(express.json());
app.use(cors());

const UPLOAD_DIR = path.join(__dirname, “uploads”);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(__dirname, “vault.db”));

db.exec(`CREATE TABLE IF NOT EXISTS items ( id TEXT PRIMARY KEY, filename TEXT, original TEXT, mimetype TEXT, size INTEGER, text TEXT, summary TEXT, tags TEXT, pillar_id TEXT, pillar_name TEXT, topic_id TEXT, topic_name TEXT, confidence REAL, rationale TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')) ); CREATE TABLE IF NOT EXISTS classification_log ( id TEXT PRIMARY KEY, item_id TEXT, prompt TEXT, response TEXT, model TEXT, tokens INTEGER, created_at TEXT DEFAULT (datetime('now')) );`);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const youtube = google.youtube({ version: “v3”, auth: process.env.YOUTUBE_API_KEY });

const storage = multer.diskStorage({
destination: (*, __, cb) => cb(null, UPLOAD_DIR),
filename:    (*, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
storage,
limits: { fileSize: 20 * 1024 * 1024 },
fileFilter: (_, file, cb) => {
const allowed = [”.pdf”,”.txt”,”.md”,”.png”,”.jpg”,”.jpeg”,”.webp”];
cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
},
});

// ══════════════════════════════════════════
// FULL TAXONOMY — 8 Pillars with ALL Topics
// ══════════════════════════════════════════
const PILLARS = [
{
id: “P1”,
name_en: “Personal Development & Effectiveness”,
name_pt: “Desenvolvimento Pessoal & Eficácia”,
topics: [
“Desenvolvimento”, “Desenvolvimento pessoal”, “Melhoria contínua”, “Lifelong learning”,
“Aprendizagem”, “Conhecimento”, “Proatividade”, “Eficácia”, “Eficiência”,
“Gestão de tempo”, “Time management”, “Disciplina”, “Hábitos”, “Excelência”,
“Organização”, “Foco”, “Deep work”, “Resiliência”, “Grit”, “Persistência”,
“Perseverança”, “Consistência”, “Mentalidade de crescimento”, “Growth Mindset”,
“Crescimento”, “Performance”, “Pensamento crítico”, “Método científico”
]
},
{
id: “P2”,
name_en: “Health, Wellbeing & Spirituality”,
name_pt: “Saúde, Bem-estar e Espiritualidade”,
topics: [
“Equilíbrio”, “Saúde física”, “Ginástica e treinos”, “Nutrição & suplementação”,
“Sono”, “Saúde mental”, “Terapia”, “Inteligência Emocional”, “Autoconhecimento”,
“Lazer”, “Hobbies”, “Bem-estar”, “Espiritualidade & religião”, “Gestão de estresse”,
“Energia”, “Vitalidade”, “Longevidade”, “Conexão”, “Meditação”, “Paz interior”,
“Escuta do coração”, “Transcendência”, “Consciência”, “Propósito”, “Sentido”,
“Felicidade”, “Happiness”, “Gratidão”, “Humanidade”, “Otimismo”, “Vulnerabilidade”,
“Sabedoria”, “Realização”
]
},
{
id: “P3”,
name_en: “Attitude & Image”,
name_pt: “Atitude e Imagem”,
topics: [
“Atitude”, “Postura”, “Postura profissional”, “Imagem”, “Imagem pública”,
“Mídias sociais”, “Reputação”, “Vestuário”, “Marca pessoal”, “Identidade”,
“Autenticidade”, “Inovação”, “Flexibilidade”, “Criatividade”
]
},
{
id: “P4”,
name_en: “Relationships, Communication & Sales”,
name_pt: “Relacionamentos, Comunicação e Vendas”,
topics: [
“Relacionamentos”, “Amizades”, “Comunidades”, “Networking”, “Comunicação”,
“Comunicação não violenta”, “Escuta”, “Escuta ativa”, “Empatia”, “Rapport”,
“Oratória”, “Influência”, “Persuasão”, “Negociação”, “Resolução de conflitos”,
“Vendas”, “Storytelling”
]
},
{
id: “P5”,
name_en: “Leadership, Strategy & Culture”,
name_pt: “Liderança, Estratégia & Cultura”,
topics: [
“Liderança”, “Gestão de pessoas”, “Gestão de projetos”, “Scrum”,
“Trabalho em equipe”, “Delegação”, “Cultura”, “Cultura de Excelência”,
“Missão, Visão e Valores Organizacionais”, “Estratégia”, “Estratégia empresarial”,
“Governança”, “Sistemas organizacionais”, “Decisão”, “Decision making”
]
},
{
id: “P6”,
name_en: “Business, Money & Wealth”,
name_pt: “Business, Money & Wealth”,
topics: [
“Finanças”, “Dinheiro”, “Patrimônio”, “Ativos”, “Gestão financeira”,
“Alocação de capital”, “Investimentos”, “Avaliação de risco”, “Empreendedorismo”
]
},
{
id: “P7”,
name_en: “Values, Character & Integrity”,
name_pt: “Valores, Caráter e Integridade”,
topics: [
“Ética”, “Justiça”, “Moral”, “Responsabilidade”, “Seriedade”, “Compromisso”,
“Honra”, “Integridade”, “Coragem”, “Coragem Moral”, “Caráter”, “Virtude”,
“Compaixão”, “Humildade”, “Liberdade”, “Princípios”, “Valores”, “Serviço”
]
},
{
id: “P8”,
name_en: “Family & Legacy”,
name_pt: “Família & Legado”,
topics: [
“Família”, “Legado”, “Nome”, “Reputação”, “Paternidade”, “Presença emocional”,
“Tradições familiares”, “Modelo de vida”, “Educação moral”, “Experiências”,
“Cartas e orientações”
]
}
];

const taxonomyText = PILLARS.map(p =>
`${p.id}: ${p.name_en}\n  Topics: ${p.topics.join(", ")}`
).join(”\n”);

async function classifyWithAI(text, filename) {
const systemPrompt = `You are a knowledge classification engine for Insight Vault.
You MUST respond with valid JSON only — no explanation, no markdown, no extra text.

Taxonomy of 8 pillars:
${taxonomyText}

Return exactly this JSON structure:
{
“summary”: “2-3 sentence summary in the language of the content”,
“tags”: [“tag1”,“tag2”,“tag3”,“tag4”,“tag5”],
“pillar_id”: “P1”,
“pillar_name”: “Pillar name in English”,
“topic_id”: “T_slug”,
“topic_name”: “Most relevant topic name”,
“confidence”: 0.92,
“rationale”: “One sentence explaining why this pillar was chosen”,
“suggest_new_topic”: null
}

Rules:

- tags: 3-7 lowercase keywords
- confidence: 0.0 to 1.0
- suggest_new_topic: only if content does not fit existing topics; otherwise null
- pillar_id must be one of: P1, P2, P3, P4, P5, P6, P7, P8`;
  
  const userPrompt = `Filename: ${filename}\n\nContent:\n${text.slice(0, 4000)}`;
  
  const response = await openai.chat.completions.create({
  model: “gpt-4o-mini”,
  messages: [
  { role: “system”, content: systemPrompt },
  { role: “user”,   content: userPrompt },
  ],
  temperature: 0.2,
  response_format: { type: “json_object” },
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

async function extractText(filePath, originalname) {
const ext = path.extname(originalname).toLowerCase();
if ([”.txt”, “.md”].includes(ext)) {
return fs.readFileSync(filePath, “utf8”);
}
if (ext === “.pdf”) {
try {
const dataBuffer = fs.readFileSync(filePath);
const data = await pdfParse(dataBuffer);
return data.text || “[PDF sem texto extraível]”;
} catch (e) {
return `[Erro ao ler PDF: ${e.message}]`;
}
}
return `[Arquivo ${originalname} — extração pendente]`;
}

function extractYouTubeId(url) {
const match = url.match(/(?:youtube.com/watch?v=|youtu.be/|youtube.com/embed/)([^&\n?#]+)/);
return match ? match[1] : null;
}

function extractPlaylistId(url) {
const match = url.match(/[?&]list=([^&]+)/);
return match ? match[1] : null;
}

async function getYouTubeCaptions(videoId) {
try {
const videoResponse = await youtube.videos.list({ part: “snippet”, id: videoId });
if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
throw new Error(“Video not found”);
}
const video = videoResponse.data.items[0].snippet;
return `Title: ${video.title}\n\nDescription: ${video.description}`;
} catch (err) {
throw new Error(`YouTube API error: ${err.message}`);
}
}

async function getPlaylistVideos(playlistId) {
const videos = [];
let pageToken = null;
try {
do {
const response = await youtube.playlistItems.list({
part: “snippet”, playlistId: playlistId, maxResults: 50, pageToken: pageToken,
});
if (!response.data.items) break;
for (const item of response.data.items) {
videos.push({
videoId: item.snippet.resourceId.videoId,
title: item.snippet.title,
description: item.snippet.description,
url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
});
}
pageToken = response.data.nextPageToken;
} while (pageToken);
return videos;
} catch (err) {
throw new Error(`Playlist API error: ${err.message}`);
}
}

function parseItem(row) {
if (!row) return null;
return { …row, tags: row.tags ? JSON.parse(row.tags) : [] };
}

// ══════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════

app.get(”/health”, (_, res) => {
const result = db.prepare(“SELECT COUNT(*) as n FROM items”).get();
res.json({
status: “ok”, version: “2.4.0”, items: result.n,
openai: !!process.env.OPENAI_API_KEY,
youtube: !!process.env.YOUTUBE_API_KEY,
timestamp: new Date().toISOString(),
});
});

app.get(”/pillars”, (_, res) => res.json(PILLARS));

app.get(”/topics”, (req, res) => {
const pillar = (req.query.pillar || “”).trim();
if (!pillar) return res.status(400).json({ error: “Missing ?pillar=P1” });
const p = PILLARS.find(x => x.id === pillar);
if (!p) return res.status(404).json({ error: “Pillar not found” });
const topics = p.topics.map((t, i) => ({ id: `${pillar}-T${i + 1}`, pillar, name_en: t, name_pt: t }));
res.json(topics);
});

app.get(”/items”, (req, res) => {
const topic = (req.query.topic || “”).trim();
if (!topic) return res.status(400).json({ error: “Missing ?topic=T1” });
const rows = db.prepare(“SELECT * FROM items WHERE topic_id = ? ORDER BY created_at DESC”).all(topic);
res.json(rows.map(parseItem));
});

app.post(”/upload”, upload.single(“file”), async (req, res) => {
if (!req.file) return res.status(400).json({ error: “No file received.” });
const id = uuidv4();
const { filename, originalname, mimetype, size, path: filePath } = req.file;
const text = await extractText(filePath, originalname);
db.prepare(`INSERT INTO items (id, filename, original, mimetype, size, text, status) VALUES (?, ?, ?, ?, ?, ?, 'classifying')`)
.run(id, filename, originalname, mimetype, size, text);
if (!process.env.OPENAI_API_KEY) {
db.prepare(“UPDATE items SET status=‘needs_api_key’ WHERE id=?”).run(id);
return res.status(202).json({ id, status: “needs_api_key”, message: “Set OPENAI_API_KEY to enable classification.” });
}
try {
const { result, logData } = await classifyWithAI(text, originalname);
db.prepare(`UPDATE items SET summary=?, tags=?, pillar_id=?, pillar_name=?, topic_id=?, topic_name=?, confidence=?, rationale=?, status='classified', updated_at=datetime('now') WHERE id=?`)
.run(result.summary, JSON.stringify(result.tags), result.pillar_id, result.pillar_name, result.topic_id, result.topic_name, result.confidence, result.rationale, id);
db.prepare(`INSERT INTO classification_log (id, item_id, prompt, response, model, tokens) VALUES (?, ?, ?, ?, ?, ?)`)
.run(uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens);
const item = db.prepare(“SELECT * FROM items WHERE id=?”).get(id);
res.json({ success: true, item: parseItem(item) });
} catch (err) {
console.error(“Upload error:”, err.message);
db.prepare(“UPDATE items SET status=‘error’, rationale=? WHERE id=?”).run(err.message, id);
res.status(500).json({ error: “AI classification failed.”, detail: err.message, id });
}
});

app.post(”/youtube”, async (req, res) => {
const { url } = req.body;
if (!url) return res.status(400).json({ error: “Missing url.” });
const videoId = extractYouTubeId(url);
if (!videoId) return res.status(400).json({ error: “Invalid YouTube URL.” });
if (!process.env.YOUTUBE_API_KEY) return res.status(400).json({ error: “YOUTUBE_API_KEY not configured.” });
try {
const text = await getYouTubeCaptions(videoId);
const id = uuidv4();
db.prepare(`INSERT INTO items (id, filename, original, mimetype, size, text, status) VALUES (?, ?, ?, ?, ?, ?, 'classifying')`)
.run(id, `yt_${videoId}`, url, “video/youtube”, text.length, text);
if (!process.env.OPENAI_API_KEY) {
db.prepare(“UPDATE items SET status=‘needs_api_key’ WHERE id=?”).run(id);
return res.status(202).json({ id, status: “needs_api_key” });
}
const { result, logData } = await classifyWithAI(text, `YouTube: ${url}`);
db.prepare(`UPDATE items SET summary=?, tags=?, pillar_id=?, pillar_name=?, topic_id=?, topic_name=?, confidence=?, rationale=?, status='classified', updated_at=datetime('now') WHERE id=?`)
.run(result.summary, JSON.stringify(result.tags), result.pillar_id, result.pillar_name, result.topic_id, result.topic_name, result.confidence, result.rationale, id);
db.prepare(`INSERT INTO classification_log (id, item_id, prompt, response, model, tokens) VALUES (?, ?, ?, ?, ?, ?)`)
.run(uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens);
const item = db.prepare(“SELECT * FROM items WHERE id=?”).get(id);
res.json({ success: true, item: parseItem(item) });
} catch (err) {
console.error(“YouTube error:”, err.message);
res.status(500).json({ error: err.message });
}
});

app.post(”/youtube/playlist”, async (req, res) => {
const { url } = req.body;
if (!url) return res.status(400).json({ error: “Missing url.” });
const playlistId = extractPlaylistId(url);
if (!playlistId) return res.status(400).json({ error: “Invalid playlist URL.” });
if (!process.env.YOUTUBE_API_KEY || !process.env.OPENAI_API_KEY) {
return res.status(400).json({ error: “API keys not configured.” });
}
try {
const videos = await getPlaylistVideos(playlistId);
const results = [];
for (const video of videos) {
const text = `Title: ${video.title}\n\nDescription: ${video.description}`;
const id = uuidv4();
db.prepare(`INSERT INTO items (id, filename, original, mimetype, size, text, status) VALUES (?, ?, ?, ?, ?, ?, 'classifying')`)
.run(id, `yt_${video.videoId}`, video.url, “video/youtube”, text.length, text);
try {
const { result, logData } = await classifyWithAI(text, video.title);
db.prepare(`UPDATE items SET summary=?, tags=?, pillar_id=?, pillar_name=?, topic_id=?, topic_name=?, confidence=?, rationale=?, status='classified', updated_at=datetime('now') WHERE id=?`)
.run(result.summary, JSON.stringify(result.tags), result.pillar_id, result.pillar_name, result.topic_id, result.topic_name, result.confidence, result.rationale, id);
db.prepare(`INSERT INTO classification_log (id, item_id, prompt, response, model, tokens) VALUES (?, ?, ?, ?, ?, ?)`)
.run(uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens);
results.push({ success: true, video: video.title, id });
} catch (err) {
db.prepare(“UPDATE items SET status=‘error’, rationale=? WHERE id=?”).run(err.message, id);
results.push({ success: false, video: video.title, error: err.message });
}
}
res.json({ success: true, total: videos.length, imported: results.filter(r => r.success).length, results });
} catch (err) {
console.error(“Playlist error:”, err.message);
res.status(500).json({ error: err.message });
}
});

app.patch(”/items/:id/reclassify”, (req, res) => {
const { id } = req.params;
const { pillar_id, topic_name } = req.body;
if (!pillar_id || !topic_name) {
return res.status(400).json({ error: “Missing pillar_id or topic_name” });
}
const pillar = PILLARS.find(p => p.id === pillar_id);
if (!pillar) return res.status(404).json({ error: “Pillar not found” });
if (!pillar.topics.includes(topic_name)) {
return res.status(400).json({ error: “Topic not found in pillar” });
}
const item = db.prepare(“SELECT * FROM items WHERE id=?”).get(id);
if (!item) return res.status(404).json({ error: “Item not found” });
db.prepare(`UPDATE items SET pillar_id=?, pillar_name=?, topic_name=?, status='confirmed', updated_at=datetime('now') WHERE id=?`)
.run(pillar_id, pillar.name_en, topic_name, id);
const updated = db.prepare(“SELECT * FROM items WHERE id=?”).get(id);
res.json({ success: true, item: parseItem(updated) });
});

app.patch(”/items/:id/confirm”, (req, res) => {
const { id } = req.params;
const { pillar_id, pillar_name, topic_id, topic_name, tags, summary } = req.body;
const item = db.prepare(“SELECT * FROM items WHERE id=?”).get(id);
if (!item) return res.status(404).json({ error: “Item not found.” });
db.prepare(`UPDATE items SET pillar_id=COALESCE(?,pillar_id), pillar_name=COALESCE(?,pillar_name), topic_id=COALESCE(?,topic_id), topic_name=COALESCE(?,topic_name), tags=COALESCE(?,tags), summary=COALESCE(?,summary), status='confirmed', updated_at=datetime('now') WHERE id=?`)
.run(pillar_id||null, pillar_name||null, topic_id||null, topic_name||null, tags ? JSON.stringify(tags) : null, summary||null, id);
const updated = db.prepare(“SELECT * FROM items WHERE id=?”).get(id);
res.json({ success: true, item: parseItem(updated) });
});

app.get(”/vault”, (req, res) => {
const { pillar, status, limit = 50, offset = 0 } = req.query;
let query = “SELECT * FROM items WHERE 1=1”;
const params = [];
if (pillar) { query += “ AND pillar_id=?”; params.push(pillar); }
if (status) { query += “ AND status=?”;    params.push(status); }
query += “ ORDER BY created_at DESC LIMIT ? OFFSET ?”;
params.push(Number(limit), Number(offset));
const rows = db.prepare(query).all(…params);
const total = db.prepare(“SELECT COUNT(*) as n FROM items”).get();
res.json({ total: total.n, items: rows.map(parseItem) });
});

app.get(”/items/:id”, (req, res) => {
const item = db.prepare(“SELECT * FROM items WHERE id=?”).get(req.params.id);
if (!item) return res.status(404).json({ error: “Item not found.” });
res.json(parseItem(item));
});

app.get(”/logs”, (_, res) => {
const logs = db.prepare(“SELECT * FROM classification_log ORDER BY created_at DESC LIMIT 100”).all();
res.json(logs);
});

app.use(”/uploads”, express.static(UPLOAD_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Insight Vault API v2.4 running on port ${PORT}`));
