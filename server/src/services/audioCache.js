const fs = require('fs');
const path = require('path');

// Ensure persistent audio directory on disk
const audioDir = path.join(__dirname, '..', '..', 'public', 'audio');
if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

// In-memory cache + disk persistence for cross-process and nodemon restart safety
const memoryCache = new Map();

function storeAudio(buffer, contentType = 'audio/mpeg') {
  const audioId = 'aud_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  
  // Store in memory
  memoryCache.set(audioId, {
    buffer,
    contentType,
    createdAt: Date.now(),
  });

  // Store on disk
  try {
    const filePath = path.join(audioDir, `${audioId}.mp3`);
    fs.writeFileSync(filePath, buffer);
  } catch (err) {
    console.warn('[audioCache] Disk write warning:', err.message);
  }

  return audioId;
}

function getAudio(audioId) {
  // 1. Check memory cache
  const inMemory = memoryCache.get(audioId);
  if (inMemory) return inMemory;

  // 2. Check disk cache (survives process restarts and one-shot scripts)
  try {
    const filePath = path.join(audioDir, `${audioId}.mp3`);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      const item = {
        buffer: buf,
        contentType: 'audio/mpeg',
        createdAt: Date.now(),
      };
      memoryCache.set(audioId, item);
      return item;
    }
  } catch (err) {
    console.warn('[audioCache] Disk read error:', err.message);
  }

  return null;
}

// Prune files older than 2 hours periodically
setInterval(() => {
  try {
    const files = fs.readdirSync(audioDir);
    const now = Date.now();
    for (const file of files) {
      const fullPath = path.join(audioDir, file);
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs > 2 * 60 * 60 * 1000) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch {}
}, 15 * 60 * 1000);

module.exports = { storeAudio, getAudio };
