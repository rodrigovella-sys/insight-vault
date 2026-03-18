// backend/context.js
// Centralizes shared dependencies and helpers so routes stay thin.

const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { google } = require('googleapis');
const pdfParse = require('pdf-parse');

const db = require('./database');
const { PILLARS } = require('./taxonomy');
const drive = require('./drive');

function itemRowToApi(row) {
  if (!row) return row;
  let tags = [];
  if (Array.isArray(row.tags)) {
    tags = row.tags;
  } else if (typeof row.tags === 'string' && row.tags.trim()) {
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }
  }
  return {
    ...row,
    tags,
  };
}

function apiItemToDbClassification(pillar, topic) {
  return {
    pillarId: pillar.id,
    pillarName: pillar.name_en,
    topicId: topic.id,
    topicName: topic.name,
  };
}

async function extractText(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      return data.text.slice(0, 15000);
    }
    if (mimetype.startsWith('text/') || mimetype === 'application/octet-stream') {
      return buffer.toString('utf8').slice(0, 15000);
    }
    return '';
  } catch {
    return '';
  }
}

function createAppContext() {
  // Upload dir (local fallback)
  const UPLOAD_DIR = path.join(__dirname, 'uploads');
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  // Drive
  const driveEnabled = drive.init();
  console.log(`[Drive] ${driveEnabled ? '✓ enabled (Google Drive)' : '✗ disabled — using local storage'}`);

  // OpenAI
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
  if (!openaiApiKey) {
    console.warn('[OpenAI] ✗ disabled — set OPENAI_API_KEY to enable classification');
  }

  // YouTube
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const youtube = youtubeApiKey ? google.youtube({ version: 'v3', auth: youtubeApiKey }) : null;
  if (!youtubeApiKey) {
    console.warn('[YouTube] ✗ disabled — set YOUTUBE_API_KEY to enable YouTube features');
  }

  async function classify(text, filename) {
    if (!openai) {
      const err = new Error('OpenAI is not configured (missing OPENAI_API_KEY)');
      err.status = 400;
      throw err;
    }

    const taxonomyText = PILLARS.map((p) =>
      `${p.id} - ${p.name_en}:\n${p.topics.map((t) => `  ${t.id}: ${t.name}`).join('\n')}`
    ).join('\n\n');

    const prompt = `You are a knowledge classification expert for a personal knowledge vault.

Classify the content below into the single most relevant pillar and topic from the taxonomy.

TAXONOMY:
${taxonomyText}

CONTENT:
Filename: ${filename}
Text: ${String(text || '').slice(0, 8000)}

    Return a valid JSON object with this exact structure:
{
  "summary": "2-3 sentence summary in the same language as the content",
  "tags": ["tag1", "tag2", "tag3"],
  "pillarId": "P1",
  "pillarName": "exact pillar name_en",
  "topicId": "P1.01",
  "topicName": "exact topic name",
  "confidence": 0.95,
  "rationale": "brief explanation why this classification was chosen"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = JSON.parse(response.choices[0].message.content);
    const result = {
      ...raw,
      pillarId: raw?.pillarId ?? raw?.pillar_id,
      pillarName: raw?.pillarName ?? raw?.pillar_name,
      topicId: raw?.topicId ?? raw?.topic_id,
      topicName: raw?.topicName ?? raw?.topic_name,
    };
    const tokens = response.usage?.total_tokens || 0;
    return { result, tokens, prompt };
  }

  return {
    db,
    PILLARS,
    drive,
    driveEnabled,
    youtube,
    UPLOAD_DIR,
    itemRowToApi,
    apiItemToDbClassification,
    extractText,
    classify,
  };
}

module.exports = { createAppContext };
