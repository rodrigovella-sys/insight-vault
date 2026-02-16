// backend/server.js
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());

// Libera CORS (ok para dev). Depois podemos restringir ao domínio do frontend.
app.use(cors());

// --------------------
// Mock data (por enquanto)
// --------------------
const PILLARS = [
  { id: "P1", name_en: "Personal Growth", name_pt: "Crescimento Pessoal" },
  { id: "P2", name_en: "Health & Spirituality", name_pt: "Saúde & Espiritualidade" },
  { id: "P3", name_en: "Identity & Positioning", name_pt: "Identidade & Posicionamento" },
  { id: "P4", name_en: "Relationships & Communication", name_pt: "Relacionamentos & Comunicação" },
  { id: "P5", name_en: "Leadership & Culture", name_pt: "Liderança & Cultura" },
  { id: "P6", name_en: "Business & Wealth", name_pt: "Negócios & Riqueza" },
  { id: "P7", name_en: "Values & Character", name_pt: "Valores & Caráter" },
  { id: "P8", name_en: "Family & Legacy", name_pt: "Família & Legado" },
];

const TOPICS = [
  // P1
  { id: "T1", pillar: "P1", name_en: "Habits & Discipline", name_pt: "Hábitos & Disciplina" },
  { id: "T2", pillar: "P1", name_en: "Learning Systems", name_pt: "Sistemas de Aprendizado" },

  // P2
  { id: "T3", pillar: "P2", name_en: "Meditation", name_pt: "Meditação" },
  { id: "T4", pillar: "P2", name_en: "Health Protocols", name_pt: "Protocolos de Saúde" },
];

const ITEMS = [
  // T1
  { id: "I1", topic: "T1", title_en: "Rule of Five", title_pt: "Regra dos Cinco", body_en: "Do 5 things daily.", body_pt: "Faça 5 coisas diariamente." },
  { id: "I2", topic: "T1", title_en: "Atomic Habits", title_pt: "Hábitos Atômicos", body_en: "Small habits compound.", body_pt: "Pequenos hábitos se acumulam." },

  // T3
  { id: "I3", topic: "T3", title_en: "Breath Practice", title_pt: "Prática de Respiração", body_en: "4-7-8 breathing.", body_pt: "Respiração 4-7-8." },
];

// --------------------
// Routes
// --------------------
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/pillars", (req, res) => res.json(PILLARS));

app.get("/topics", (req, res) => {
  const pillar = (req.query.pillar || "").toString().trim();
  if (!pillar) return res.status(400).json({ error: "Missing query param: pillar" });
  const topics = TOPICS.filter(t => t.pillar === pillar);
  return res.json(topics);
});

app.get("/items", (req, res) => {
  const topic = (req.query.topic || "").toString().trim();
  if (!topic) return res.status(400).json({ error: "Missing query param: topic" });
  const items = ITEMS.filter(i => i.topic === topic);
  return res.json(items);
});

// --------------------
// Start
// --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API running on port ${PORT}`));
