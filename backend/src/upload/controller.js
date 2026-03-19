const express = require('express');
const multer = require('multer');
const path = require('path');

const { uploadFile } = require('./services/uploadFile');

function createUploadController(ctx) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      const allowed = ['.pdf', '.txt', '.md', '.png', '.jpg', '.jpeg', '.webp'];
      cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
  });

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const item = await uploadFile(ctx, { file: req.file });
      res.status(201).json(item);
    } catch (err) {
      console.error('[upload] error:', err);
      res.status(err.status || 500).json({ error: 'Upload failed', details: err.message });
    }
  });

  return router;
}

module.exports = { createUploadController };
