// ─────────────────────────────────────────────────────────
// YOUTUBE INTEGRATION — cole este bloco no server.js
// depois da linha: app.use('/uploads', express.static(...))
// ─────────────────────────────────────────────────────────

const { YoutubeTranscript } = require('youtube-transcript');

// Extrai o ID do vídeo de qualquer formato de URL do YouTube
function extractYouTubeId(url) {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
  );
  return match ? match[1] : null;
}

// POST /youtube
// Body: { url: "https://www.youtube.com/watch?v=..." }
app.post('/youtube', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url in request body.' });

  const videoId = extractYouTubeId(url);
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL.' });

  try {
    // 1. Buscar transcrição — tenta PT, cai para EN se não houver
    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'pt' });
    } catch {
      transcript = await YoutubeTranscript.fetchTranscript(videoId);
    }

    const text = transcript.map(t => t.text).join(' ');
    if (!text || text.length < 20) {
      return res.status(422).json({ error: 'Transcript too short or unavailable for this video.' });
    }

    // 2. Inserir como pendente
    const id = uuidv4();
    db.prepare(`
      INSERT INTO items (id, filename, original, mimetype, size, text, status)
      VALUES (?, ?, ?, ?, ?, ?, 'classifying')
    `).run(id, `yt_${videoId}`, url, 'video/youtube', text.length, text);

    // 3. Sem chave OpenAI — retorna pendente
    if (!process.env.OPENAI_API_KEY) {
      db.prepare("UPDATE items SET status='needs_api_key' WHERE id=?").run(id);
      return res.status(202).json({ id, status: 'needs_api_key', message: 'Set OPENAI_API_KEY to enable classification.' });
    }

    // 4. Classificar com IA
    const { result, logData } = await classifyWithAI(text, `YouTube: ${url}`);

    db.prepare(`
      UPDATE items SET
        summary=?, tags=?, pillar_id=?, pillar_name=?,
        topic_id=?, topic_name=?, confidence=?, rationale=?,
        status='classified', updated_at=datetime('now')
      WHERE id=?
    `).run(
      result.summary, JSON.stringify(result.tags),
      result.pillar_id, result.pillar_name,
      result.topic_id, result.topic_name,
      result.confidence, result.rationale, id
    );

    // 5. Audit log
    db.prepare(`
      INSERT INTO classification_log (id, item_id, prompt, response, model, tokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, logData.prompt, logData.response, logData.model, logData.tokens);

    const item = db.prepare('SELECT * FROM items WHERE id=?').get(id);
    res.json({ success: true, item: parseItem(item) });

  } catch (err) {
    console.error('YouTube error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
