const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');

const UUID_NAMESPACE = '0a7b3c2e-8c2b-4e3d-9e0a-2f6e3b2e1a11';

async function uploadFile(ctx, { file }) {
  if (!file) {
    const err = new Error('No file uploaded');
    err.status = 400;
    throw err;
  }

  const original = file.originalname;
  const mimetype = file.mimetype;
  const size = file.size;
  const buffer = file.buffer;
  const currentDate = new Date().toISOString().split('T')[0];
  const rawFilename = path.basename(file.filename || original);
  const filename = `${currentDate}-${rawFilename}`;

  // Deduplicate uploads by content hash (same file uploaded multiple times).
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const id = uuidv5(`file:${contentHash}`, UUID_NAMESPACE);
  const existing = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (existing) {
    return { ...ctx.itemRowToApi(existing), duplicate: true };
  }

  const text = await ctx.extractText(buffer, mimetype);

  const { result, tokens, prompt } = await ctx.classify(text || original, original);

  const pillar = ctx.PILLARS.find((p) => p.id === result.pillarId) || ctx.PILLARS[0];
  const topic = pillar.topics.find((t) => t.id === result.topicId) || pillar.topics[0];

  let driveFileId = null;
  let driveUrl = null;
  const pillarFolder = `${pillar.id} - ${pillar.name_pt}`;
  const topicFolder = `${topic.id} - ${topic.name}`;
  
  if (ctx.driveEnabled) {
    try {
      const uploaded = await ctx.drive.upload(buffer, filename, mimetype, [pillarFolder, topicFolder]);
      driveFileId = uploaded.id;
      driveUrl = uploaded.url;
    } catch (errPrimary) {
      throw errPrimary;
    }
  } else {
    fs.writeFileSync(path.join(ctx.UPLOAD_DIR, filename), buffer);
  }

  const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

  await ctx.db
    .prepare(
      `
      INSERT INTO items
        (id, filename, original, mimetype, size, text, summary, tags, metadataJson,
         pillarId, pillarName, topicId, topicName, confidence, rationale,
         driveFileId, driveUrl, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'classified')
    `
    )
    .run(
      id,
      filename,
      original,
      mimetype,
      size,
      String(text || '').slice(0, 5000),
      result.summary,
      JSON.stringify(result.tags || []),
      JSON.stringify({ contentHash }),
      dbTaxonomy.pillarId,
      dbTaxonomy.pillarName,
      dbTaxonomy.topicId,
      dbTaxonomy.topicName,
      result.confidence,
      result.rationale,
      driveFileId,
      driveUrl
    );

  await ctx.db
    .prepare(
      `
      INSERT INTO classification_log (id, itemId, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);

  const item = await ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return ctx.itemRowToApi(item);
}

module.exports = { uploadFile };
