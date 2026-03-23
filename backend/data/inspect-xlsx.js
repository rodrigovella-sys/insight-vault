// backend/data/inspect-xlsx.js
// Usage:
//   node data/inspect-xlsx.js "path/to/file.xlsx"

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { PILLARS } = require('../taxonomy');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node data/inspect-xlsx.js "path/to/file.xlsx"');
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), inputPath);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const pillarById = new Map(PILLARS.map((p) => [String(p.id).trim(), p]));
const topicById = new Map(
  PILLARS.flatMap((p) => (p.topics || []).map((t) => [String(t.id).trim(), { ...t, pillar_id: p.id }]))
);

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const pillarNameIndex = new Map();
const topicNameIndex = new Map();

for (const pillar of PILLARS) {
  if (pillar.name_pt) pillarNameIndex.set(normalize(pillar.name_pt), pillar.id);
  if (pillar.name_en) pillarNameIndex.set(normalize(pillar.name_en), pillar.id);
  for (const topic of pillar.topics || []) {
    topicNameIndex.set(normalize(topic.name), topic.id);
  }
}

const workbook = XLSX.readFile(filePath, { cellDates: true });
console.log(`Workbook: ${path.basename(filePath)}`);
console.log(`Sheets (${workbook.SheetNames.length}): ${workbook.SheetNames.join(' | ')}`);

const takeFirstNonEmptyRow = (rows) => {
  for (const row of rows) {
    if (Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')) return row;
  }
  return [];
};

const guessHeaderRowIndex = (rows) => {
  // Simple heuristic: first non-empty row.
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')) return i;
  }
  return 0;
};

const analyzeRowForTaxonomy = (row) => {
  const matches = { pillar_ids: new Set(), topic_ids: new Set() };
  for (const cell of row) {
    const raw = String(cell ?? '').trim();
    if (!raw) continue;

    if (pillarById.has(raw)) matches.pillar_ids.add(raw);
    if (topicById.has(raw)) matches.topic_ids.add(raw);

    const n = normalize(raw);
    const pid = pillarNameIndex.get(n);
    const tid = topicNameIndex.get(n);
    if (pid) matches.pillar_ids.add(pid);
    if (tid) matches.topic_ids.add(tid);
  }
  return matches;
};

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });

  console.log('\n' + '-'.repeat(80));
  console.log(`Sheet: ${sheetName}`);
  console.log(`Rows: ${rows.length}`);

  const headerIndex = guessHeaderRowIndex(rows);
  const headerRow = takeFirstNonEmptyRow(rows.slice(headerIndex, headerIndex + 1));
  const headers = (headerRow || []).map((h, idx) => {
    const v = String(h ?? '').trim();
    return v || `__col_${idx + 1}`;
  });

  console.log(`Header row index (0-based guess): ${headerIndex}`);
  console.log('Headers:');
  console.log(headers.map((h, i) => `  ${i + 1}. ${h}`).join('\n'));

  const previewRows = rows.slice(headerIndex + 1, headerIndex + 6);
  console.log('Preview (first 5 data rows):');
  for (const r of previewRows) {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i]; });
    console.log(JSON.stringify(obj));
  }

  // Taxonomy matching stats
  let pillarHitRows = 0;
  let topicHitRows = 0;
  const pillarCounts = new Map();
  const topicCounts = new Map();

  const dataRows = rows.slice(headerIndex + 1);
  for (const r of dataRows) {
    const { pillar_ids, topic_ids } = analyzeRowForTaxonomy(r);
    if (pillar_ids.size) pillarHitRows++;
    if (topic_ids.size) topicHitRows++;
    for (const pid of pillar_ids) pillarCounts.set(pid, (pillarCounts.get(pid) || 0) + 1);
    for (const tid of topic_ids) topicCounts.set(tid, (topicCounts.get(tid) || 0) + 1);
  }

  const topN = (m, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  console.log('Taxonomy matches:');
  console.log(`  Rows with pillar match: ${pillarHitRows}/${dataRows.length}`);
  console.log(`  Rows with topic match:  ${topicHitRows}/${dataRows.length}`);

  const topPillars = topN(pillarCounts);
  if (topPillars.length) {
    console.log('  Top pillar hits:');
    for (const [pid, count] of topPillars) {
      const p = pillarById.get(pid);
      console.log(`    ${pid} (${p?.name_pt || p?.name_en || 'unknown'}): ${count}`);
    }
  }

  const topTopics = topN(topicCounts);
  if (topTopics.length) {
    console.log('  Top topic hits:');
    for (const [tid, count] of topTopics) {
      const t = topicById.get(tid);
      console.log(`    ${tid} (${t?.name || 'unknown'}): ${count}`);
    }
  }
}
