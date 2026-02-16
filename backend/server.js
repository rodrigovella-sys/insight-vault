
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/pillars', (req, res) => {
  res.json([
    { id: "P1", name_en: "Personal Growth", name_pt: "Crescimento Pessoal" },
    { id: "P2", name_en: "Health & Spirituality", name_pt: "Saúde & Espiritualidade" },
    { id: "P3", name_en: "Identity & Positioning", name_pt: "Identidade & Posicionamento" },
    { id: "P4", name_en: "Relationships & Communication", name_pt: "Relacionamentos & Comunicação" },
    { id: "P5", name_en: "Leadership & Culture", name_pt: "Liderança & Cultura" },
    { id: "P6", name_en: "Business & Wealth", name_pt: "Negócios & Riqueza" },
    { id: "P7", name_en: "Values & Character", name_pt: "Valores & Caráter" },
    { id: "P8", name_en: "Family & Legacy", name_pt: "Família & Legado" }
  ]);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
