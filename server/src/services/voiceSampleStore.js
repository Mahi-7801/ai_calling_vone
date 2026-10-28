const fs = require('fs');
const path = require('path');

const SAMPLE_DIR = path.join(__dirname, '..', '..', 'public', 'voice-samples');

if (!fs.existsSync(SAMPLE_DIR)) {
  fs.mkdirSync(SAMPLE_DIR, { recursive: true });
}

/**
 * Identifies the container from the actual bytes.
 *
 * This used to be hardcoded to .mp3. Sarvam returns 16-bit PCM WAV, so every
 * cloned preview was written to a .mp3 file and then served as `audio/mpeg`
 * while the body was RIFF/WAVE. Browsers reject that outright, so the preview
 * never played and the clone looked broken.
 */
function detectFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return 'wav';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF') return 'wav';
  if (buffer.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (buffer.subarray(0, 4).toString('latin1') === 'fLaC') return 'flac';
  if (buffer.subarray(0, 3).toString('latin1') === 'ID3') return 'mp3';
  // Raw MPEG frame sync without an ID3 header.
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return 'mp3';
  return 'wav';
}

const CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

const EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac']);

/**
 * Cloned voice preview audio is far too large for a DB column (a base64 payload
 * is hundreds of KB), so we persist it to disk and store only a short URL path.
 *
 * `maxBytes` guards against persisting an entire user recording. The fallback
 * path can otherwise hand us the full multi-megabyte reference clip, which the
 * UI would then present as the clone's preview.
 */
function storeSample(buffer, slug, { maxBytes = 0 } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  let payload = buffer;

  if (maxBytes > 0 && buffer.length > maxBytes) {
    // Only trim formats where we know where the audio starts: WAV has a 44-byte
    // canonical header, and trimming a container blindly would corrupt it.
    if (detectFormat(buffer) === 'wav' && buffer.length > 44) {
      const header = buffer.subarray(0, 44);
      const body = buffer.subarray(44, maxBytes & ~1);
      payload = Buffer.concat([header, body]);
      // Fix the RIFF and data sizes so the truncated file is still valid.
      payload.writeUInt32LE(36 + body.length, 4);
      payload.writeUInt32LE(body.length, 40);
    } else {
      payload = buffer.subarray(0, maxBytes);
    }
  }

  const safe = String(slug || 'voice').replace(/[^\w-]/g, '_').slice(0, 60) || 'voice';
  const ext = detectFormat(payload);
  const fileName = `${safe}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(SAMPLE_DIR, fileName), payload);
  return `/api/employees/voice-samples/${fileName}`;
}

function resolveSample(fileName) {
  const safe = path.basename(String(fileName || ''));
  const ext = path.extname(safe).replace('.', '').toLowerCase();
  if (!EXTENSIONS.has(ext)) return null;
  const fullPath = path.join(SAMPLE_DIR, safe);
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

/** Content-Type matching the stored file, so the browser is told the truth. */
function contentTypeFor(fileName) {
  const ext = path.extname(String(fileName || '')).replace('.', '').toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function removeSample(url) {
  if (!url || typeof url !== 'string' || !url.includes('/voice-samples/')) return;
  const fullPath = resolveSample(url.split('/voice-samples/').pop());
  if (fullPath) {
    try {
      fs.unlinkSync(fullPath);
    } catch {}
  }
}

// Legacy rows stored a truncated base64 data URL in sample_url. Treat those as
// missing so callers regenerate a playable sample instead of serving garbage.
function isPlayableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return url.length > 500;
  return true;
}

module.exports = {
  storeSample,
  resolveSample,
  removeSample,
  isPlayableUrl,
  contentTypeFor,
  detectFormat,
  SAMPLE_DIR,
};