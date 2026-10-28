const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config/env');

// Cartesia accepts flac/mp3/mpeg/mpga/oga/ogg/wav/webm for /voices/clone.
// Phone apps (especially WhatsApp) hand us .mp4/.m4a/.aac containers holding an
// audio stream, which Cartesia rejects outright - so normalise to mono 16 kHz
// WAV before uploading.
const FFMPEG_FORMATS = {
  '.wav': 'wav',
  '.mp3': 'mp3',
  '.webm': 'webm',
  '.ogg': 'ogg',
  '.oga': 'oga',
  '.flac': 'flac',
};

function extOf(fileName = '') {
  const idx = String(fileName).lastIndexOf('.');
  return idx === -1 ? '' : String(fileName).slice(idx).toLowerCase();
}

function ffmpegBinary() {
  return config.ffmpegPath || 'ffmpeg';
}

function runFfmpeg(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBinary(), args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Audio conversion timed out'));
    }, timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg unavailable: ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

function decodeToWav(inputPath) {
  return runFfmpeg(['-y', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', inputPath + '.norm.wav']);
}

/**
 * Convert an unsupported audio container to a Cartesia-compatible format.
 * Returns { buffer, fileName, contentType, converted }.
 * WAV is streamed straight back - it is already accepted as-is.
 */
async function toCloneReadyAudio({ buffer, fileName, mimetype }) {
  const ext = extOf(fileName);

  if (ext === '.wav') {
    return { buffer, fileName: 'clip.wav', contentType: mimetype || 'audio/wav', converted: false };
  }

  if (FFMPEG_FORMATS[ext]) {
    return {
      buffer,
      fileName: `clip${ext}`,
      contentType: mimetype || `audio/${FFMPEG_FORMATS[ext]}`,
      converted: false,
    };
  }

  const tmpDir = path.join(os.tmpdir(), 'voice-clone');
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpIn = path.join(tmpDir, `in_${Date.now()}${ext || '.bin'}`);
  const outPath = `${tmpIn}.norm.wav`;

  try {
    fs.writeFileSync(tmpIn, buffer);
    await decodeToWav(tmpIn);
    if (!fs.existsSync(outPath)) throw new Error('conversion produced no output');
    return {
      buffer: fs.readFileSync(outPath),
      fileName: 'clip.wav',
      contentType: 'audio/wav',
      converted: true,
    };
  } catch (err) {
    throw new Error(
      `Could not convert "${fileName}" to a voice-clone compatible format: ${err.message}. ` +
        'Upload a .wav, .mp3, .ogg or .webm file.'
    );
  } finally {
    for (const f of [tmpIn, outPath]) {
      try {
        fs.unlinkSync(f);
      } catch {}
    }
  }
}

module.exports = { toCloneReadyAudio, FFMPEG_FORMATS, extOf };
