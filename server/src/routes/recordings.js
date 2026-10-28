const fs = require('fs');
const express = require('express');
const { asyncHandler } = require('../utils/helpers');
const { recordingFilePath } = require('../services/callRecording');

const router = express.Router();

// -----------------------------------------------------------------------------
// Self-captured call recordings (PUBLIC — <audio src> loads it directly).
//
// VoBiz <Stream> calls have no carrier-side .mp3, so mediaStreamService mixes the
// live audio and writes a WAV here. Range support matters: without it Safari and
// Chrome refuse to seek and can refuse to play the file at all.
// -----------------------------------------------------------------------------
router.get('/:fileName', asyncHandler(async (req, res) => {
  const full = recordingFilePath(req.params.fileName);
  if (!full || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'Recording not found' });
  }

  const stat = fs.statSync(full);
  const range = req.headers.range;

  const isMp3 = /\.mp3$/i.test(full);
  const mime = isMp3 ? 'audio/mpeg' : (/\.ogg$/i.test(full) ? 'audio/ogg' : 'audio/wav');
  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start) || start >= stat.size) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      end = Math.min(end, stat.size - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
  }

  res.setHeader('Content-Length', stat.size);
  return fs.createReadStream(full).pipe(res);
}));

module.exports = router;
