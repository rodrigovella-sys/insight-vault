const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

async function uploadFile(ctx, { file }) {
  if (!file) {
    const err = new Error('No file uploaded');
    err.status = 400;
    throw err;
  }

  const id = uuidv4();
  const original = file.originalname;
  const mimetype = file.mimetype;
  const size = file.size;
  const buffer = file.buffer;
  const ext = path.extname(original).toLowerCase();
  const filename = `${id}${ext}`;

  const text = await ctx.extractText(buffer, mimetype);

  const { result, tokens, prompt } = await ctx.classify(text || original, original);

  const pillar = ctx.PILLARS.find((p) => p.id === result.pillarId) || ctx.PILLARS[0];
  const topic = pillar.topics.find((t) => t.id === result.topicId) || pillar.topics[0];

  let driveFileId = null;
  let driveUrl = null;
  const pillarFolder = `${pillar.id} - ${pillar.name_pt}`;
  const topicFolder = `${topic.id} - ${topic.name}`;

  if (ctx.driveEnabled) {
    const uploaded = await ctx.drive.upload(buffer, filename, mimetype, [pillarFolder, topicFolder]);
    driveFileId = uploaded.id;
    driveUrl = uploaded.url;
  } else {
    fs.writeFileSync(path.join(ctx.UPLOAD_DIR, filename), buffer);
  }

  const dbTaxonomy = ctx.apiItemToDbClassification(pillar, topic);

  ctx.db
    .prepare(
      `
      INSERT INTO items
        (id, filename, original, mimetype, size, text, summary, tags,
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
      dbTaxonomy.pillarId,
      dbTaxonomy.pillarName,
      dbTaxonomy.topicId,
      dbTaxonomy.topicName,
      result.confidence,
      result.rationale,
      driveFileId,
      driveUrl
    );

  ctx.db
    .prepare(
      `
      INSERT INTO classification_log (id, itemId, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(uuidv4(), id, prompt, JSON.stringify(result), 'gpt-4o-mini', tokens);

  const item = ctx.db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  return ctx.itemRowToApi(item);
}

module.exports = { uploadFile };
