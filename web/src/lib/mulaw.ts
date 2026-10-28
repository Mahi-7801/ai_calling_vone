/**
 * mu-law <-> linear PCM for 8 kHz mono audio, matching what the telephony
 * carrier streams and what browserCallService expects.
 */

const MULAW_BIAS = 0x84;

function linearToMulaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = 0x80;
  let pcm = sample >> 8; // 16-bit -> 8-bit magnitude domain

  if (pcm < 0) {
    pcm = -pcm;
    sign = 0;
  }
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS >> 2;

  if (pcm > 0x2fff) pcm = 0x7fff;
  else if (pcm > 0x1fff) pcm = 0x3fff;
  else if (pcm > 0x0fff) pcm = 0x1fff;
  else if (pcm > 0x07ff) pcm = 0x0fff;
  else if (pcm > 0x03ff) pcm = 0x07ff;
  else if (pcm > 0x01ff) pcm = 0x03ff;
  else if (pcm > 0x00ff) pcm = 0x01ff;
  else if (pcm > 0x007f) pcm = 0x00ff;
  else pcm >>= 3;

  return (sign | pcm) & 0xff;
}

function mulawToLinear(byte: number): number {
  // Canonical G.711 expansion: the low nibble is the mantissa, bits 4-6 are
  // the exponent (a left shift of 0..7), and the sign bit is bit 7 of the
  // original byte.
  const u = (~byte) & 0xff;
  let t = ((u & 0x0f) << 3) + MULAW_BIAS;
  t <<= (u & 0x70) >> 4;
  return (byte & 0x80) ? MULAW_BIAS - t : t - MULAW_BIAS;
}

/** Encode 16-bit PCM samples to a base64 mu-law payload. */
export function pcm16ToMulawBase64(pcm: Float32Array): string {
  const out = new Uint8Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    out[i] = linearToMulaw(Math.round(s * 32767));
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < out.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(out.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

/** Decode a base64 mu-law payload into a Float32Array in [-1, 1]. */
export function mulawBase64ToPcm(base64: string): Float32Array<ArrayBuffer> {
  const binary = atob(base64);
  const out = new Float32Array(new ArrayBuffer(binary.length * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < binary.length; i++) {
    out[i] = mulawToLinear(binary.charCodeAt(i) & 0xff) / 32768;
  }
  return out;
}

/** Average absolute amplitude, used as a simple voice-activity signal. */
export function rms(pcm: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, pcm.length));
}
