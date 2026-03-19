// backend/data/import-xlsx.js
// Usage:
//   node data/import-xlsx.js "path/to/file.xlsx" [--sheet "Biblioteca Consolidada"] [--all-sheets] [--truncate]
//
// Default behavior imports only the consolidated sheet to avoid duplicates.

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const XLSX = require('xlsx');
const { v5: uuidv5 } = require('uuid');
const postgres = require('../dbpostgres');
const { PILLARS } = require('../taxonomy');

const args = process.argv.slice(2);
const getArgValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const inputPath = args.find((a) => !a.startsWith('--'));
if (!inputPath) {
  console.error('Usage: node data/import-xlsx.js "path/to/file.xlsx" [--sheet "Biblioteca Consolidada"] [--all-sheets] [--truncate]');
  process.exit(1);
}

const options = {
  sheet: getArgValue('--sheet') || 'Biblioteca Consolidada',
  allSheets: args.includes('--all-sheets'),
  truncate: args.includes('--truncate'),
};

const filePath = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const stripDiacritics = (value) => {
  const s = String(value ?? '');
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

const normalizeKey = (value) => {
  return stripDiacritics(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
};

const normalizeText = (value) => {
  return stripDiacritics(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
};

const HEADER_KEY_MAP = new Map([
  ['valorhabilidade', 'skillValue'],
  ['falachave', 'keyQuote'],
  ['uso', 'useCase'],
  ['tipo', 'mediaType'],
  ['linkyoutube', 'youtubeUrl'],
  ['minutos', 'timeRange'],
  ['minuto', 'timeRange'],
  ['impacto', 'impact'],
  ['contexto', 'contextText'],
  ['statusdolinkdiretobusca', 'linkStatus'],
  ['relevancia15', 'relevance'],
  ['timestampexatohhmmss', 'exactTimestamp'],
  ['seloaab', 'seal'],
  ['statusdotimestampprecisoestimadopendente', 'timestampStatus'],
  ['rankingporvalor', 'valueRank'],
  ['rankingpormidia', 'mediaRank'],
  ['curadoriapropriaai', 'curation'],
  ['playlist', 'playlist'],
  ['thumbnail', 'thumbnail'],
  ['videoid', 'videoId'],
  ['macropilar', 'macroPillar'],
  ['subcategoria', 'subcategory'],
  ['livrodeorigem', 'sourceBook'],
  ['autor', 'author'],
  ['secaocapitulokindle', 'kindleSectionChapter'],
  ['paginakindle', 'kindlePage'],
  ['posicaolockindle', 'kindleLocation'],
  ['arquivodeorigem', 'sourceArtifact'],
  ['subtemaoriginal', 'originalSubtheme'],
]);

const headerToKey = (header) => {
  const normalized = normalizeKey(header);
  // Special-case some common variants.
  if (normalized.startsWith('linkyoutube')) return 'youtubeUrl';
  if (normalized.startsWith('minutos')) return 'timeRange';
  return HEADER_KEY_MAP.get(normalized) || null;
};

const toIntOrNull = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  const s = String(value).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
};

const toTextOrNull = (value) => {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s ? s : null;
};

const takeFirstNonEmptyRow = (rows) => {
  for (const row of rows) {
    if (Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')) return row;
  }
  return [];
};

const guessHeaderRowIndex = (rows) => {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')) return i;
  }
  return 0;
};

const pillarById = new Map(PILLARS.map((p) => [String(p.id).trim(), p]));
const topicById = new Map(
  PILLARS.flatMap((p) => (p.topics || []).map((t) => [String(t.id).trim(), { ...t, pillar_id: p.id }]))
);

const getPillarNameEn = (pillarId) => {
  const p = pillarById.get(String(pillarId || '').trim());
  return p?.name_en || null;
};

const getTopicName = (topicId) => {
  const t = topicById.get(String(topicId || '').trim());
  return t?.name || null;
};

const pillarNameIndex = new Map();
const topicNameIndex = new Map();

for (const pillar of PILLARS) {
  if (pillar.name_pt) pillarNameIndex.set(normalizeText(pillar.name_pt), pillar.id);
  if (pillar.name_en) pillarNameIndex.set(normalizeText(pillar.name_en), pillar.id);
  for (const topic of pillar.topics || []) {
    topicNameIndex.set(normalizeText(topic.name), topic.id);
  }
}

const tokenizeValue = (value, { allowUnderscoreSplit } = { allowUnderscoreSplit: false }) => {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  const candidates = new Set([raw]);

  // IMPORTANT:
  // - Do not split on '&' or ',' because many official pillar/topic names use them.
  // - Only split on '_' which is used to express composite categories in some sheets.
  if (allowUnderscoreSplit && raw.includes('_')) {
    raw
      .split(/\s*_\s*/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => candidates.add(s));
  }

  return [...candidates];
};

const collectTaxonomyMatchesFromText = (value, { allowUnderscoreSplit } = { allowUnderscoreSplit: false }) => {
  const matches = { pillarIds: new Set(), topicIds: new Set() };
  for (const token of tokenizeValue(value, { allowUnderscoreSplit })) {
    const raw = String(token).trim();
    if (!raw) continue;

    if (pillarById.has(raw)) matches.pillarIds.add(raw);
    if (topicById.has(raw)) matches.topicIds.add(raw);

    const n = normalizeText(raw);
    const pid = pillarNameIndex.get(n);
    const tid = topicNameIndex.get(n);
    if (pid) matches.pillarIds.add(pid);
    if (tid) matches.topicIds.add(tid);
  }
  return matches;
};

const inferClassification = (rowObj, sheetName) => {
  const pillarCounts = new Map();
  const topicIds = new Set();

  // Pillar inference: macro/pillar fields only.
  for (const f of [rowObj.macroPillar, rowObj.skillValue]) {
    const { pillarIds } = collectTaxonomyMatchesFromText(f);
    for (const pid of pillarIds) pillarCounts.set(pid, (pillarCounts.get(pid) || 0) + 1);
  }

  // Topic inference: primarily from Subtema Original/Subcategoria.
  for (const f of [rowObj.originalSubtheme, rowObj.subcategory]) {
    const { topicIds: tIds } = collectTaxonomyMatchesFromText(f);
    for (const tid of tIds) topicIds.add(tid);
  }

  // Composite categories sometimes use '_' to chain multiple concepts.
  // Only then do we attempt to split and match topics.
  {
    const { topicIds: tIds } = collectTaxonomyMatchesFromText(rowObj.skillValue, { allowUnderscoreSplit: true });
    for (const tid of tIds) topicIds.add(tid);
  }

  // If importing many sheets, the sheet name itself can often be a pillar/topic name.
  {
    const { pillarIds, topicIds: tIds } = collectTaxonomyMatchesFromText(sheetName);
    for (const pid of pillarIds) pillarCounts.set(pid, (pillarCounts.get(pid) || 0) + 1);
    for (const tid of tIds) topicIds.add(tid);
  }

  // Derive pillar from topics if needed.
  if (pillarCounts.size === 0 && topicIds.size) {
    const topicPillars = new Set([...topicIds].map((tid) => topicById.get(tid)?.pillar_id).filter(Boolean));
    if (topicPillars.size === 1) {
      const only = [...topicPillars][0];
      pillarCounts.set(only, 1);
    }
  }

  let pillarId = null;
  if (pillarCounts.size) {
    const [best] = [...pillarCounts.entries()].sort((a, b) => b[1] - a[1]);
    pillarId = best?.[0] || null;
  }

  const topicIdList = [...topicIds];
  const primaryTopicId = topicIdList.length === 1 ? topicIdList[0] : null;

  return { pillarId, topicIds: topicIdList, primaryTopicId };
};

const buildTagsJson = (rowObj) => {
  const tagCandidates = [
    rowObj.useCase,
    rowObj.mediaType,
    rowObj.impact,
    rowObj.seal,
    rowObj.curation,
    rowObj.originalSubtheme,
  ]
    .map((v) => String(v ?? '').trim())
    .filter(Boolean);

  const tags = [...new Set(tagCandidates)];
  return JSON.stringify(tags);
};

const buildMetadataJson = ({ rowObj, sheetName, sourceRow, sourceFile }) => {
  // Keep this generic: source + full normalized row data.
  // Keys are in English (as mapped by HEADER_KEY_MAP).
  const data = {};
  for (const [k, v] of Object.entries(rowObj || {})) {
    const text = toTextOrNull(v);
    if (text !== null) data[k] = text;
  }

  return JSON.stringify({
    sourceType: 'xlsx',
    sourceFile,
    sourceSheet: sheetName,
    sourceRow,
    data,
  });
};

// Load environment variables from local files for development.
// Priority: backend/.env.local -> backend/.env.development -> backend/.env
for (const envPath of [path.join(__dirname, '..', '.env.local'), path.join(__dirname, '..', '.env.development'), path.join(__dirname, '..', '.env')]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
    break;
  }
}

const workbook = XLSX.readFile(filePath, { cellDates: true });

const sheetsToImport = options.allSheets
  ? workbook.SheetNames
  : workbook.SheetNames.includes(options.sheet)
      ? [options.sheet]
      : [];

if (!sheetsToImport.length) {
  console.error(`Sheet not found: ${options.sheet}`);
  console.error(`Available sheets (${workbook.SheetNames.length}): ${workbook.SheetNames.join(' | ')}`);
  process.exit(1);
}

const UPSERT_ITEM_SQL = `
  INSERT INTO items (
    id,
    filename,
    original,
    mimetype,
    size,
    text,
    summary,
    tags,
    metadataJson,
    skillValue,
    keyQuote,
    useCase,
    mediaType,
    youtubeUrl,
    timeRange,
    impact,
    contextText,
    linkStatus,
    relevance,
    exactTimestamp,
    seal,
    timestampStatus,
    valueRank,
    mediaRank,
    curation,
    playlist,
    thumbnail,
    videoId,
    macroPillar,
    subcategory,
    sourceBook,
    author,
    kindleSectionChapter,
    kindlePage,
    kindleLocation,
    sourceArtifact,
    originalSubtheme,
    pillarId,
    pillarName,
    topicId,
    topicName,
    status
  ) VALUES (
    @id,
    @filename,
    @original,
    @mimetype,
    @size,
    @text,
    @summary,
    @tags,
    @metadataJson,
    @skillValue,
    @keyQuote,
    @useCase,
    @mediaType,
    @youtubeUrl,
    @timeRange,
    @impact,
    @contextText,
    @linkStatus,
    @relevance,
    @exactTimestamp,
    @seal,
    @timestampStatus,
    @valueRank,
    @mediaRank,
    @curation,
    @playlist,
    @thumbnail,
    @videoId,
    @macroPillar,
    @subcategory,
    @sourceBook,
    @author,
    @kindleSectionChapter,
    @kindlePage,
    @kindleLocation,
    @sourceArtifact,
    @originalSubtheme,
    @pillarId,
    @pillarName,
    @topicId,
    @topicName,
    @status
  )
  ON CONFLICT(id) DO UPDATE SET
    filename             = excluded.filename,
    original             = excluded.original,
    mimetype             = excluded.mimetype,
    size                 = excluded.size,
    text                 = excluded.text,
    summary              = excluded.summary,
    tags                 = excluded.tags,
    metadataJson         = excluded.metadataJson,
    skillValue           = excluded.skillValue,
    keyQuote             = excluded.keyQuote,
    useCase              = excluded.useCase,
    mediaType            = excluded.mediaType,
    youtubeUrl           = excluded.youtubeUrl,
    timeRange            = excluded.timeRange,
    impact               = excluded.impact,
    contextText          = excluded.contextText,
    linkStatus           = excluded.linkStatus,
    relevance            = excluded.relevance,
    exactTimestamp       = excluded.exactTimestamp,
    seal                 = excluded.seal,
    timestampStatus      = excluded.timestampStatus,
    valueRank            = excluded.valueRank,
    mediaRank            = excluded.mediaRank,
    curation             = excluded.curation,
    playlist             = excluded.playlist,
    thumbnail            = excluded.thumbnail,
    videoId              = excluded.videoId,
    macroPillar          = excluded.macroPillar,
    subcategory          = excluded.subcategory,
    sourceBook           = excluded.sourceBook,
    author               = excluded.author,
    kindleSectionChapter = excluded.kindleSectionChapter,
    kindlePage           = excluded.kindlePage,
    kindleLocation       = excluded.kindleLocation,
    sourceArtifact       = excluded.sourceArtifact,
    originalSubtheme     = excluded.originalSubtheme,
    pillarId             = excluded.pillarId,
    pillarName           = excluded.pillarName,
    topicId              = excluded.topicId,
    topicName            = excluded.topicName,
    status               = excluded.status,
    updatedAt            = now()
`;

const DELETE_ITEM_TOPICS_SQL = 'DELETE FROM itemTopics WHERE itemId = ?';
const INSERT_ITEM_TOPIC_SQL =
  'INSERT INTO itemTopics (itemId, topicId) VALUES (?, ?) ON CONFLICT (itemId, topicId) DO NOTHING';

let totalImported = 0;
let totalLinkedTopics = 0;

const importSheet = async (db, sheetName) => {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

  const headerIndex = guessHeaderRowIndex(rows);
  const headerRow = takeFirstNonEmptyRow(rows.slice(headerIndex, headerIndex + 1));
  const headers = (headerRow || []).map((h, idx) => {
    const v = String(h ?? '').trim();
    return v || `__col_${idx + 1}`;
  });

  const colKeys = headers.map((h) => headerToKey(h));
  const dataRows = rows.slice(headerIndex + 1);

  const tx = db.transaction(async (txDb) => {
    const upsertItem = txDb.prepare(UPSERT_ITEM_SQL);
    const deleteItemTopics = txDb.prepare(DELETE_ITEM_TOPICS_SQL);
    const insertItemTopic = txDb.prepare(INSERT_ITEM_TOPIC_SQL);

    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i];
      if (!Array.isArray(r)) continue;

      const rowObj = {};
      for (let c = 0; c < colKeys.length; c++) {
        const key = colKeys[c];
        if (!key) continue;
        rowObj[key] = r[c];
      }

      const hasContent =
        String(rowObj.keyQuote ?? '').trim() ||
        String(rowObj.youtubeUrl ?? '').trim() ||
        String(rowObj.contextText ?? '').trim();
      if (!hasContent) continue;

      const sourceRow = headerIndex + 2 + i; // 1-based row number in the sheet
      const id = uuidv5(`${path.basename(filePath)}|${sheetName}|${sourceRow}`, uuidv5.URL);

      const { pillarId, topicIds, primaryTopicId } = inferClassification(rowObj, sheetName);

      const keyQuote = toTextOrNull(rowObj.keyQuote);
      const contextText = toTextOrNull(rowObj.contextText);
      const filename = `xlsx_${sheetName}_${sourceRow}`;

      await upsertItem.run({
        id,
        filename,
        original: keyQuote,
        mimetype: 'text/narrative',
        size: 0,
        text: keyQuote,
        summary: contextText,
        tags: buildTagsJson(rowObj),
        metadataJson: buildMetadataJson({
          rowObj,
          sheetName,
          sourceRow,
          sourceFile: path.basename(filePath),
        }),
        skillValue: toTextOrNull(rowObj.skillValue),
        keyQuote,
        useCase: toTextOrNull(rowObj.useCase),
        mediaType: toTextOrNull(rowObj.mediaType),
        youtubeUrl: toTextOrNull(rowObj.youtubeUrl),
        timeRange: toTextOrNull(rowObj.timeRange),
        impact: toTextOrNull(rowObj.impact),
        contextText,
        linkStatus: toTextOrNull(rowObj.linkStatus),
        relevance: toIntOrNull(rowObj.relevance),
        exactTimestamp: toTextOrNull(rowObj.exactTimestamp),
        seal: toTextOrNull(rowObj.seal),
        timestampStatus: toTextOrNull(rowObj.timestampStatus),
        valueRank: toIntOrNull(rowObj.valueRank),
        mediaRank: toIntOrNull(rowObj.mediaRank),
        curation: toTextOrNull(rowObj.curation),
        playlist: toTextOrNull(rowObj.playlist),
        thumbnail: toTextOrNull(rowObj.thumbnail),
        videoId: toTextOrNull(rowObj.videoId),
        macroPillar: toTextOrNull(rowObj.macroPillar),
        subcategory: toTextOrNull(rowObj.subcategory),
        sourceBook: toTextOrNull(rowObj.sourceBook),
        author: toTextOrNull(rowObj.author),
        kindleSectionChapter: toTextOrNull(rowObj.kindleSectionChapter),
        kindlePage: toTextOrNull(rowObj.kindlePage),
        kindleLocation: toTextOrNull(rowObj.kindleLocation),
        sourceArtifact: toTextOrNull(rowObj.sourceArtifact),
        originalSubtheme: toTextOrNull(rowObj.originalSubtheme),
        pillarId,
        pillarName: getPillarNameEn(pillarId),
        topicId: primaryTopicId,
        topicName: getTopicName(primaryTopicId),
        status: 'confirmed',
      });

      await deleteItemTopics.run(id);
      for (const tid of topicIds) {
        await insertItemTopic.run(id, tid);
        totalLinkedTopics++;
      }

      totalImported++;
    }
  });

  await tx();

  console.log(`Imported sheet: ${sheetName}`);
};

async function main() {
  await postgres.init();
  const db = postgres.db;

  if (options.truncate) {
    await db.exec(`
      DELETE FROM itemTopics
      WHERE itemId IN (
        SELECT id FROM items
        WHERE metadataJson is not null
          AND metadataJson <> ''
          AND (metadataJson::jsonb->>'sourceType') = 'xlsx'
      )
    `);

    await db.exec(
      "DELETE FROM items WHERE metadataJson is not null AND metadataJson <> '' AND (metadataJson::jsonb->>'sourceType') = 'xlsx'"
    );
  }

  for (const sheetName of sheetsToImport) {
    await importSheet(db, sheetName);
  }

  const totalInDb =
    (await db
      .prepare(
        "SELECT COUNT(*) AS c FROM items WHERE metadataJson is not null AND metadataJson <> '' AND (metadataJson::jsonb->>'sourceType') = 'xlsx'"
      )
      .get())?.c || 0;

  console.log('---');
  console.log(`Imported entries (this run): ${totalImported}`);
  console.log(`Linked topic rows (this run): ${totalLinkedTopics}`);
  console.log(`Total XLSX items in DB: ${totalInDb}`);
}

main().catch((err) => {
  console.error('[import-xlsx] failed:', err);
  process.exit(1);
});
