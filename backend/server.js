// backend/server.js - Insight Vault v3.0 - Google Drive Edition
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');
const Database  = require('better-sqlite3');
const OpenAI    = require('openai');
const { google } = require('googleapis');
const pdfParse  = require('pdf-parse');
const drive     = require('./drive');

const app = express();
app.use(express.json());
app.use(cors());

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL UPLOAD DIR (fallback when Drive is not configured)
// ─────────────────────────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE SETUP
// ─────────────────────────────────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'vault.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id            TEXT PRIMARY KEY,
    filename      TEXT,
    original      TEXT,
    mimetype      TEXT,
    size          INTEGER,
    text          TEXT,
    summary       TEXT,
    tags          TEXT,
    pillar_id     TEXT,
    pillar_name   TEXT,
    topic_id      TEXT,
    topic_name    TEXT,
    confidence    REAL,
    rationale     TEXT,
    status        TEXT DEFAULT 'pending',
    drive_file_id TEXT,
    drive_url     TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS classification_log (
    id         TEXT PRIMARY KEY,
    item_id    TEXT,
    prompt     TEXT,
    response   TEXT,
    model      TEXT,
    tokens     INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migration: add Drive columns if upgrading from v2.4
['drive_file_id TEXT', 'drive_url TEXT'].forEach(col => {
  try { db.exec(`ALTER TABLE items ADD COLUMN ${col}`); } catch (_) { /* already exists */ }
});

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE DRIVE INIT
// ─────────────────────────────────────────────────────────────────────────────
const driveEnabled = drive.init();
console.log(`[Drive] ${driveEnabled ? '✓ enabled (Google Drive)' : '✗ disabled — using local storage'}`);

// ─────────────────────────────────────────────────────────────────────────────
// OPENAI + YOUTUBE
// ─────────────────────────────────────────────────────────────────────────────
const openai  = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// MULTER — memory storage (file goes to Drive or local after)
// ─────────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const allowed = ['.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp'];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// FULL TAXONOMY — 8 Pillars, 145 Topics
// ─────────────────────────────────────────────────────────────────────────────
const PILLARS = [
  {
    id: 'P1', name_en: 'Personal Development & Effectiveness', name_pt: 'Desenvolvimento Pessoal & Eficácia',
    topics: [
      { id: 'P1.01', name: 'Desenvolvimento' },
      { id: 'P1.02', name: 'Desenvolvimento pessoal' },
      { id: 'P1.03', name: 'Melhoria contínua' },
      { id: 'P1.04', name: 'Lifelong learning' },
      { id: 'P1.05', name: 'Aprendizagem' },
      { id: 'P1.06', name: 'Conhecimento' },
      { id: 'P1.07', name: 'Proatividade' },
      { id: 'P1.08', name: 'Eficácia' },
      { id: 'P1.09', name: 'Eficiência' },
      { id: 'P1.10', name: 'Gestão de tempo' },
      { id: 'P1.11', name: 'Time management' },
      { id: 'P1.12', name: 'Disciplina' },
      { id: 'P1.13', name: 'Hábitos' },
      { id: 'P1.14', name: 'Excelência' },
      { id: 'P1.15', name: 'Organização' },
      { id: 'P1.16', name: 'Foco' },
      { id: 'P1.17', name: 'Deep work' },
      { id: 'P1.18', name: 'Resiliência' },
      { id: 'P1.19', name: 'Grit' },
      { id: 'P1.20', name: 'Persistência' },
      { id: 'P1.21', name: 'Perseverança' },
      { id: 'P1.22', name: 'Consistência' },
      { id: 'P1.23', name: 'Mentalidade de crescimento' },
      { id: 'P1.24', name: 'Growth Mindset' },
      { id: 'P1.25', name: 'Crescimento' },
      { id: 'P1.26', name: 'Performance' },
      { id: 'P1.27', name: 'Pensamento crítico' },
      { id: 'P1.28', name: 'Método científico' },
    ],
  },
  {
    id: 'P2', name_en: 'Health, Wellbeing & Spirituality', name_pt: 'Saúde, Bem-estar & Espiritualidade',
    topics: [
      { id: 'P2.01', name: 'Equilíbrio' },
      { id: 'P2.02', name: 'Saúde física' },
      { id: 'P2.03', name: 'Ginástica e treinos' },
      { id: 'P2.04', name: 'Nutrição & suplementação' },
      { id: 'P2.05', name: 'Sono' },
      { id: 'P2.06', name: 'Saúde mental' },
      { id: 'P2.07', name: 'Terapia' },
      { id: 'P2.08', name: 'Inteligência Emocional' },
      { id: 'P2.09', name: 'Autoconhecimento' },
      { id: 'P2.10', name: 'Lazer' },
      { id: 'P2.11', name: 'Hobbies' },
      { id: 'P2.12', name: 'Bem-estar' },
      { id: 'P2.13', name: 'Espiritualidade & religião' },
      { id: 'P2.14', name: 'Gestão de estresse' },
      { id: 'P2.15', name: 'Energia' },
      { id: 'P2.16', name: 'Vitalidade' },
      { id: 'P2.17', name: 'Longevidade' },
      { id: 'P2.18', name: 'Conexão' },
      { id: 'P2.19', name: 'Meditação' },
      { id: 'P2.20', name: 'Paz interior' },
      { id: 'P2.21', name: 'Escuta do coração' },
      { id: 'P2.22', name: 'Transcendência' },
      { id: 'P2.23', name: 'Consciência' },
      { id: 'P2.24', name: 'Propósito' },
      { id: 'P2.25', name: 'Sentido' },
      { id: 'P2.26', name: 'Felicidade' },
      { id: 'P2.27', name: 'Happiness' },
      { id: 'P2.28', name: 'Gratidão' },
      { id: 'P2.29', name: 'Humanidade' },
      { id: 'P2.30', name: 'Otimismo' },
      { id: 'P2.31', name: 'Vulnerabilidade' },
      { id: 'P2.32', name: 'Sabedoria' },
      { id: 'P2.33', name: 'Realização' },
    ],
  },
  {
    id: 'P3', name_en: 'Attitude & Image', name_pt: 'Atitude & Imagem',
    topics: [
      { id: 'P3.01', name: 'Atitude' },
      { id: 'P3.02', name: 'Postura' },
      { id: 'P3.03', name: 'Postura profissional' },
      { id: 'P3.04', name: 'Imagem' },
      { id: 'P3.05', name: 'Imagem pública' },
      { id: 'P3.06', name: 'Mídias sociais' },
      { id: 'P3.07', name: 'Reputação' },
      { id: 'P3.08', name: 'Vestuário' },
      { id: 'P3.09', name: 'Marca pessoal' },
      { id: 'P3.10', name: 'Identidade' },
      { id: 'P3.11', name: 'Autenticidade' },
      { id: 'P3.12', name: 'Inovação' },
      { id: 'P3.13', name: 'Flexibilidade' },
      { id: 'P3.14', name: 'Criatividade' },
    ],
  },
  {
    id: 'P4', name_en: 'Relationships, Communication & Sales', name_pt: 'Relacionamentos, Comunicação & Vendas',
    topics: [
      { id: 'P4.01', name: 'Relacionamentos' },
      { id: 'P4.02', name: 'Amizades' },
      { id: 'P4.03', name: 'Comunidades' },
      { id: 'P4.04', name: 'Networking' },
      { id: 'P4.05', name: 'Comunicação' },
      { id: 'P4.06', name: 'Comunicação não violenta' },
      { id: 'P4.07', name: 'Escuta' },
      { id: 'P4.08', name: 'Escuta ativa' },
      { id: 'P4.09', name: 'Empatia' },
      { id: 'P4.10', name: 'Rapport' },
      { id: 'P4.11', name: 'Oratória' },
      { id: 'P4.12', name: 'Influência' },
      { id: 'P4.13', name: 'Persuasão' },
      { id: 'P4.14', name: 'Negociação' },
      { id: 'P4.15', name: 'Resolução de conflitos' },
      { id: 'P4.16', name: 'Vendas' },
      { id: 'P4.17', name: 'Storytelling' },
    ],
  },
  {
    id: 'P5', name_en: 'Leadership, Strategy & Culture', name_pt: 'Liderança, Estratégia & Cultura',
    topics: [
      { id: 'P5.01', name: 'Liderança' },
      { id: 'P5.02', name: 'Gestão de pessoas' },
      { id: 'P5.03', name: 'Gestão de projetos' },
      { id: 'P5.04', name: 'Scrum' },
      { id: 'P5.05', name: 'Trabalho em equipe' },
      { id: 'P5.06', name: 'Delegação' },
      { id: 'P5.07', name: 'Cultura' },
      { id: 'P5.08', name: 'Cultura de Excelência' },
      { id: 'P5.09', name: 'Missão Visão e Valores Organizacionais' },
      { id: 'P5.10', name: 'Estratégia' },
      { id: 'P5.11', name: 'Estratégia empresarial' },
      { id: 'P5.12', name: 'Governança' },
      { id: 'P5.13', name: 'Sistemas organizacionais' },
      { id: 'P5.14', name: 'Decisão' },
      { id: 'P5.15', name: 'Decision making' },
    ],
  },
  {
    id: 'P6', name_en: 'Business, Money & Wealth', name_pt: 'Negócios, Dinheiro & Riqueza',
    topics: [
      { id: 'P6.01', name: 'Finanças' },
      { id: 'P6.02', name: 'Dinheiro' },
      { id: 'P6.03', name: 'Patrimônio' },
      { id: 'P6.04', name: 'Ativos' },
      { id: 'P6.05', name: 'Gestão financeira' },
      { id: 'P6.06', name: 'Alocação de capital' },
      { id: 'P6.07', name: 'Investimentos' },
      { id: 'P6.08', name: 'Avaliação de risco' },
      { id: 'P6.09', name: 'Empreendedorismo' },
    ],
  },
  {
    id: 'P7', name_en: 'Values, Character & Integrity', name_pt: 'Valores, Caráter & Integridade',
    topics: [
      { id: 'P7.01', name: 'Ética' },
      { id: 'P7.02', name: 'Justiça' },
      { id: 'P7.03', name: 'Moral' },
      { id: 'P7.04', name: 'Responsabilidade' },
      { id: 'P7.05', name: 'Seriedade' },
      { id: 'P7.06', name: 'Compromisso' },
      { id: 'P7.07', name: 'Honra' },
      { id: 'P7.08', name: 'Integridade' },
      { id: 'P7.09', name: 'Coragem' },
      { id: 'P7.10', name: 'Coragem Moral' },
      { id: 'P7.11', name: 'Caráter' },
      { id: 'P7.12', name: 'Virtude' },
      { id: 'P7.13', name: 'Compaixão' },
      { id: 'P7.14', name: 'Humildade' },
      { id: 'P7.15', name: 'Liberdade' },
      { id: 'P7.16', name: 'Princípios' },
      { id: 'P7.17', name: 'Valores' },
      { id: 'P7.18', name: 'Serviço' },
    ],
  },
  {
    id: 'P8', name_en: 'Family & Legacy', name_pt: 'Família & Legado',
    topics: [
      { id: 'P8.01', name: 'Família' },
      { id: 'P8.02', name: 'Legado' },
      { id: 'P8.03', name: 'Nome' },
      { id: 'P8.04', name: 'Reputação' },
      { id: 'P8.05', name: 'Paternidade' },
      { id: 'P8.06', name: 'Presença emocional' },
      { id: 'P8.07', name: 'Tradições familiares' },
      { id: 'P8.08', name: 'Modelo de vida' },
      { id: 'P8.09', name: 'Educação moral' },
      { id: 'P8.10', name: 'Experiências' },
      { id: 'P8.11', name: 'Cartas e orientações' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function extractText(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      return data.text.slice(0, 15000);
    }
    if (mimetype.startsWith('text/') || mimetype === 'application/octet-stream') {
      return buffer.toString('utf8').slice(0, 15000);
    }
    return ''; // images: classified by filename/context only
  } catch {
    return '';
  }
}

async function classify(text, filename) {
  const taxonomyText = PILLARS.map(p =>
    `${p.id} - ${p.name_en}:\n${p.topics.map(t => `  ${t.id}: ${t.name}`).join('\n')}`
  ).join('\n\n');

  const prompt = `You are a knowledge classification expert for a personal knowledge vault.

Classify the content below into the single most relevant pillar and topic from the taxonomy.

TAXONOMY:
${taxonomyText}

CONTENT:
Filename: ${filename}
Text: ${text.slice(0, 8000)}

Return a valid JSON object with this exact structure:
{
  "summary": "2-3 sentence summary in the same language as the content",
  "tags": ["tag1", "tag2", "tag3"],
  "pillar_id": "P1",
  "pillar_name": "exact pillar name_en",
  "topic_id": "P1.01",
  "topic_name": "exact topic name",
  "confidence": 0.95,
  "rationale": "brief explanation why this classification was chosen"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: prompt }],
  });

  const result = JSON.parse(response.choices[0].message.content);
  const tokens = response.usage?.total_tokens || 0;
  return { result, tokens, prompt };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({
    status: 'ok',
    version: '3.0',
    drive: driveEnabled ? 'enabled' : 'disabled',
    items: db.prepare('SELECT COUNT(*) as n FROM items').get().n,
  });
});

app.get('/pillars', (_, res) => {
  res.json(PILLARS.map(p => ({
    id: p.id,
    name_en: p.name_en,
    name_pt: p.name_pt,
    topic_count: p.topics.length,
  })));
});

app.get('/topics', (req, res) => {
  const pillar = PILLARS.find(p => p.id === req.query.pillar);
  if (!pillar) return res.status(404).json({ error: 'Pillar not found' });
  res.json(pillar.topics);
});

app.get('/vault', (req, res) => {
  const { pillar, status, search } = req.query;
  let sql    = 'SELECT * FROM items WHERE 1=1';
  const params = [];

  if (pillar) { sql += ' AND pillar_id = ?'; params.push(pillar); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (search) {
    sql += ' AND (summary LIKE ? OR tags LIKE ? OR original LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  sql += ' ORDER BY created_at DESC';

  const items = db.prepare(sql).all(...params).map(item => ({
    ...item,
    tags: item.tags ? JSON.parse(item.tags) : [],
  }));
  res.json({ items });
});

app.get('/items/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ ...item, tags: item.tags ? JSON.parse(item.tags) : [] });
});

// Serve the actual file (from Drive or local disk)
app.get('/items/:id/file', async (req, res) => {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (item.drive_file_id && driveEnabled) {
    try {
      const buffer = await drive.download(item.drive_file_id);
      res.set('Content-Type', item.mimetype || 'application/octet-stream');
      res.set('Content-Disposition', `inline; filename="${item.original}"`);
      return res.send(buffer);
    } catch (err) {
      return res.status(500).json({ error: 'Drive download failed', details: err.message });
    }
  }

  // Fallback: local file
  const localPath = path.join(UPLOAD_DIR, item.filename);
  if (fs.existsSync(localPath)) {
    res.set('Content-Type', item.mimetype || 'application/octet-stream');
    return res.sendFile(localPath);
  }

  res.status(404).json({ error: 'File not found in Drive or local storage' });
});

// POST /upload
app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const id       = uuidv4();
  const original = req.file.originalname;
  const mimetype = req.file.mimetype;
  const size     = req.file.size;
  const buffer   = req.file.buffer;
  const ext      = path.extname(original).toLowerCase();
  const filename = `${id}${ext}`;

  try {
    const text = await extractText(buffer, mimetype);

    // Store file: Drive or local
    let drive_file_id = null;
    let drive_url     = null;

    if (driveEnabled) {
      const uploaded = await drive.upload(buffer, original, mimetype);
      drive_file_id  = uploaded.id;
      drive_url      = uploaded.url;
    } else {
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
    }

    // Classify with OpenAI
    const { result, tokens, prompt } = await classify(text || original, original);

    // Validate against taxonomy (fallback to P1 first topic if invalid)
    const pillar = PILLARS.find(p => p.id === result.pillar_id) || PILLARS[0];
    const topic  = pillar.topics.find(t => t.id === result.topic_id) || pillar.topics[0];

    // Persist
    db.prepare(`
      INSERT INTO items
        (id, filename, original, mimetype, size, text, summary, tags,
         pillar_id, pillar_name, topic_id, topic_name, confidence, rationale,
         drive_file_id, drive_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
    `).run(
      id, filename, original, mimetype, size,
      text.slice(0, 5000), result.summary, JSON.stringify(result.tags || []),
      pillar.id, pillar.name_en, topic.id, topic.name,
      result.confidence, result.rationale,
      drive_file_id, drive_url
    );

    db.prepare(`
      INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    const parsed = { ...item, tags: JSON.parse(item.tags || '[]') };
    res.status(201).json({ item: parsed });

  } catch (err) {
    console.error('[upload] error:', err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// POST /youtube
app.post('/youtube', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) return res.status(400).json({ error: 'Invalid YouTube URL' });
  const videoId = match[1];

  try {
    const ytRes = await youtube.videos.list({ part: ['snippet'], id: [videoId] });
    const video = ytRes.data.items?.[0];
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const { title, description, channelTitle } = video.snippet;
    const text = `Title: ${title}\nChannel: ${channelTitle}\n\n${description}`;

    const { result, tokens, prompt } = await classify(text, title);
    const pillar = PILLARS.find(p => p.id === result.pillar_id) || PILLARS[0];
    const topic  = pillar.topics.find(t => t.id === result.topic_id) || pillar.topics[0];

    const id = uuidv4();
    db.prepare(`
      INSERT INTO items
        (id, filename, original, mimetype, size, text, summary, tags,
         pillar_id, pillar_name, topic_id, topic_name, confidence, rationale, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
    `).run(
      id, `yt_${videoId}`, title, 'video/youtube', 0,
      text.slice(0, 5000), result.summary, JSON.stringify(result.tags || []),
      pillar.id, pillar.name_en, topic.id, topic.name,
      result.confidence, result.rationale
    );

    db.prepare(`
      INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    const parsed = { ...item, tags: JSON.parse(item.tags || '[]') };
    res.status(201).json({ item: parsed });

  } catch (err) {
    console.error('[youtube] error:', err);
    res.status(500).json({ error: 'YouTube classification failed', details: err.message });
  }
});

// POST /youtube/playlist
app.post('/youtube/playlist', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const match = url.match(/[?&]list=([A-Za-z0-9_-]+)/);
  if (!match) return res.status(400).json({ error: 'Invalid playlist URL' });
  const playlistId = match[1];

  try {
    const items = [];
    let pageToken;

    do {
      const ytRes = await youtube.playlistItems.list({
        part: ['snippet'], playlistId, maxResults: 50, pageToken,
      });
      items.push(...(ytRes.data.items || []));
      pageToken = ytRes.data.nextPageToken;
    } while (pageToken);

    res.json({ message: `Processing ${items.length} videos...`, total: items.length });

    (async () => {
      for (const item of items) {
        try {
          const videoId = item.snippet.resourceId.videoId;
          const title   = item.snippet.title;
          const desc    = item.snippet.description || '';
          const text    = `Title: ${title}\n\n${desc}`;

          const { result, tokens, prompt } = await classify(text, title);
          const pillar = PILLARS.find(p => p.id === result.pillar_id) || PILLARS[0];
          const topic  = pillar.topics.find(t => t.id === result.topic_id) || pillar.topics[0];

          const id = uuidv4();
          db.prepare(`
            INSERT OR IGNORE INTO items
              (id, filename, original, mimetype, size, text, summary, tags,
               pillar_id, pillar_name, topic_id, topic_name, confidence, rationale, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
          `).run(
            id, `yt_${videoId}`, title, 'video/youtube', 0,
            text.slice(0, 5000), result.summary, JSON.stringify(result.tags || []),
            pillar.id, pillar.name_en, topic.id, topic.name,
            result.confidence, result.rationale
          );

          db.prepare(`
            INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);

        } catch (e) {
          console.error(`[playlist] skip "${item.snippet.title}":`, e.message);
        }
      }
      console.log('[playlist] done processing');
    })();

  } catch (err) {
    console.error('[playlist] error:', err);
    res.status(500).json({ error: 'Playlist failed', details: err.message });
  }
});

// PATCH /items/:id/confirm
app.patch('/items/:id/confirm', (req, res) => {
  const result = db.prepare(`
    UPDATE items SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?
  `).run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// PATCH /items/:id/reclassify
app.patch('/items/:id/reclassify', (req, res) => {
  const { pillar_id, topic_id } = req.body;

  const pillar = PILLARS.find(p => p.id === pillar_id);
  if (!pillar) return res.status(400).json({ error: 'Invalid pillar_id' });

  const topic = pillar.topics.find(t => t.id === topic_id);
  if (!topic) return res.status(400).json({ error: 'Invalid topic_id' });

  const result = db.prepare(`
    UPDATE items
    SET pillar_id = ?, pillar_name = ?, topic_id = ?, topic_name = ?,
        status = 'confirmed', updated_at = datetime('now')
    WHERE id = ?
  `).run(pillar.id, pillar.name_en, topic.id, topic.name, req.params.id);

  if (!result.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Insight Vault v3.0] listening on port ${PORT}`);
  console.log(`[Drive] ${driveEnabled
    ? '✓ Google Drive storage active'
    : '✗ Local storage active (set GOOGLE_SERVICE_ACCOUNT_KEY + GOOGLE_DRIVE_FOLDER_ID to enable Drive)'
  }`);
});
