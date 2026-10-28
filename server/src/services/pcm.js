const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../config/env');

// Minimal RIFF/WAVE helpers. Sarvam returns 16-bit PCM WAV, which we need to
// re-encode to 8 kHz G.711 mu-law for the PSTN (Twilio/Vobiz expect ulaw 8k).

function runFfmpeg(args, inputWav, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const tmpDir = path.join(os.tmpdir(), 'voice-format');
    fs.mkdirSync(tmpDir, { recursive: true });
    const out = path.join(tmpDir, `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.raw`);
    const proc = spawn(config.providers.ffmpegPath || 'ffmpeg', [
      '-y', '-i', 'pipe:0', '-f', 'mulaw', '-acodec', 'pcm_mulaw', '-ar', '8000', '-ac', '1', out,
    ], { windowsHide: true });

    const chunks = [];
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('ffmpeg conversion timed out'));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      try { fs.unlinkSync(out); } catch {}
      reject(new Error(`ffmpeg unavailable: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        try { fs.unlinkSync(out); } catch {}
        return reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-300)}`));
      }
      try {
        const buf = fs.readFileSync(out);
        fs.unlinkSync(out);
        resolve(buf);
      } catch (e) {
        reject(e);
      }
    });

    proc.stdin.on('error', () => {});
    proc.stdin.end(inputWav);
  });
}

/** Convert a 16-bit PCM WAV buffer to 8 kHz mono G.711 mu-law. */
async function toPcmMulaw8k(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) {
    throw new Error('Cannot convert non-WAV buffer to mu-law');
  }
  return runFfmpeg([], wavBuffer);
}

/** Concatenate multiple RIFF/WAVE buffers (same format). */
function concatWav(buffers) {
  const valid = buffers.filter((b) => Buffer.isBuffer(b) && b.length > 44);
  if (!valid.length) throw new Error('Nothing to concatenate');
  if (valid.length === 1) return valid[0];

  const first = valid[0];
  const channels = first.readUInt16LE(22);
  const sampleRate = first.readUInt32LE(24);
  const bitsPerSample = first.readUInt16LE(34);
  const blockAlign = channels * (bitsPerSample / 8);

  // Pull the raw sample data out of each WAV (skip RIFF headers).
  const chunks = valid.map((b) => b.subarray(44));
  const dataSize = chunks.reduce((n, c) => n + c.length, 0);

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, ...chunks]);
}

module.exports = { toPcmMulaw8k, concatWav };
