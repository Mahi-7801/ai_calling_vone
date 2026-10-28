import { useCallback, useEffect, useRef, useState } from 'react';
import { Room } from 'livekit-client';
import { authStore } from '@/lib/api';
import { pcm16ToMulawBase64, mulawBase64ToPcm, rms } from '@/lib/mulaw';

const TARGET_RATE = 8000;
const FRAME_MS = 20; // 160 samples @ 8kHz, one telephony frame
const SILENCE_RMS = 0.012;
const SPEECH_RMS = 0.035;
// Minimum utterance length to consider valid speech (~200ms)
const MIN_SPEECH_MS = 200;
const MAX_UTTERANCE_MS = 20000;

export type BrowserCallState = 'idle' | 'connecting' | 'live' | 'ending' | 'ended' | 'error';

export interface BrowserCallEvent {
  type: string;
  text?: string;
  message?: string;
  callId?: string;
  duration?: number;
  payload?: string;
}

/**
 * Live browser call with an AI employee.
 *
 * The browser owns turn-taking: it captures the microphone, resamples to 8 kHz
 * mu-law (the encoding the telephony carrier streams, so no transcoding is
 * needed anywhere), and only sends audio once the user has actually spoken.
 * That avoids streaming the user's voice to the speech-to-text provider while
 * they are silent, and lets the mic be ignored entirely while the AI talks.
 */
export function useBrowserCall(employeeId: number | string | null) {
  const [state, setState] = useState<BrowserCallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [events, setEvents] = useState<BrowserCallEvent[]>([]);
  const [livekitConnected, setLivekitConnected] = useState(false);

  const livekitRoomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const playbackRef = useRef<AudioBufferSourceNode[]>([]);
  const nextPlayAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);
  const speakingRef = useRef(false);

  // Turn-taking state, kept in refs because the audio callback closes over them
  // and must not be rebuilt when React re-renders.
  const speechMsRef = useRef(0);
  const silenceMsRef = useRef(0);
  const samplesRef = useRef<number[]>([]);
  const aiSpeakingRef = useRef(false);

  const cleanup = useCallback(() => {
    nodeRef.current?.disconnect();
    sourceRef.current?.disconnect();
    nodeRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    playbackRef.current.forEach((n) => {
      try { n.stop(); } catch { /* already finished */ }
    });
    playbackRef.current = [];
    abortRef.current?.abort();
    abortRef.current = null;
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'hangup' }));
        ws.close(1000, 'client ending');
      } catch { /* already closing */ }
    }
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    if (livekitRoomRef.current) {
      try { livekitRoomRef.current.disconnect(); } catch { /* ignore */ }
      livekitRoomRef.current = null;
    }
    setLivekitConnected(false);
    aiSpeakingRef.current = false;
    speakingRef.current = false;
    setAiSpeaking(false);
    setUserSpeaking(false);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Queue streamed mu-law audio so playback is continuous instead of restarting
  // per chunk, which would click at every boundary.
  const enqueueAudio = useCallback((base64: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const pcm = mulawBase64ToPcm(base64);
    const buffer = ctx.createBuffer(1, pcm.length, TARGET_RATE);
    buffer.copyToChannel(pcm, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);
    const now = ctx.currentTime;
    const startAt = Math.max(now, nextPlayAtRef.current);
    node.start(startAt);
    nextPlayAtRef.current = startAt + buffer.duration;
    playbackRef.current.push(node);
    // Release the reference once this chunk has finished, so a long call does
    // not accumulate one node per received frame.
    node.onended = () => {
      playbackRef.current = playbackRef.current.filter((n) => n !== node);
    };
  }, []);

  const start = useCallback(async () => {
    if (!employeeId) return;
    setError(null);
    setEvents([]);
    setSeconds(0);
    setState('connecting');
    startedAtRef.current = Date.now();
    speechMsRef.current = 0;
    silenceMsRef.current = 0;
    samplesRef.current = [];
    nextPlayAtRef.current = 0;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setState('error');
      setError('Microphone access was blocked. Allow the mic and try again.');
      return;
    }
    streamRef.current = stream;

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    // Autoplay policy can start the context suspended until a user gesture.
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    const token = authStore.getToken();
    if (!token) {
      cleanup();
      setState('error');
      setError('Your session expired. Sign in again.');
      return;
    }
    const baseUrl = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
    let host = typeof window !== 'undefined' ? window.location.host : 'localhost:5000';
    let proto = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';

    const remoteUrl = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL;
    if (remoteUrl) {
      try {
        const u = new URL(remoteUrl);
        host = u.host;
        proto = u.protocol === 'https:' || u.protocol === 'wss:' ? 'wss' : 'ws';
      } catch {
        // fallback
      }
    }

    const callId = `browser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Connect to LiveKit WebRTC Cloud room for premium audio routing
    try {
      const lkRes = await fetch(`${baseUrl}/api/telephony/livekit-token?room=${encodeURIComponent(callId)}`);
      if (lkRes.ok) {
        const lkData = await lkRes.json();
        if (lkData?.token && lkData?.url) {
          const lkRoom = new Room({ adaptiveStream: true, dynacast: true });
          livekitRoomRef.current = lkRoom;
          await lkRoom.connect(lkData.url, lkData.token);
          setLivekitConnected(true);
          console.log('[livekit] Connected to WebRTC Cloud room:', lkData.room);
        }
      }
    } catch (lkErr) {
      console.warn('[livekit] WebRTC Cloud optional connect:', lkErr);
    }

    const ws = new WebSocket(
      `${proto}://${host}/ws/browser/${employeeId}/${callId}?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      let data: BrowserCallEvent;
      try {
        data = JSON.parse(msg.data as string);
      } catch {
        return;
      }
      switch (data.type) {
        case 'ready':
          setState('live');
          break;
        case 'audio':
          if (data.payload) enqueueAudio(data.payload);
          break;
        case 'ai_speaking_start':
          // Ignore the microphone while the employee is talking, so the AI does
          // not transcribe its own voice back through the speaker.
          aiSpeakingRef.current = true;
          setAiSpeaking(true);
          break;
        case 'ai_speaking_end':
          aiSpeakingRef.current = false;
          setAiSpeaking(false);
          setUserSpeaking(false);
          break;
        case 'user_transcript':
        case 'ai_delta':
          setEvents((prev) => [...prev, data]);
          break;
        case 'ended':
          setState('ended');
          setSeconds(data.duration ?? Math.round((Date.now() - startedAtRef.current) / 1000));
          break;
        case 'error':
          setError(data.message ?? 'Call error');
          break;
        default:
          break;
      }
    };

    ws.onerror = () => {
      // Only report a connection failure here. A mid-call reset is routine
      // (laptop sleep, NAT timeout) and onclose already finalizes the call.
      setError((prev) => prev ?? 'Connection to the call server was interrupted.');
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      setState((prev) => (prev === 'ended' || prev === 'error' ? prev : 'ended'));
    };

    // Set up capture only once the socket is open, so no audio is produced
    // before the server can accept it.
    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.OPEN) return resolve();
      ws.onopen = () => resolve();
    });

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    // ScriptProcessor is deprecated but is the only node available without
    // shipping a separate AudioWorklet file. It runs on the main thread, so the
    // buffer is kept small (20ms) to stay well inside a frame budget.
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    nodeRef.current = processor;

    processor.onaudioprocess = (ev) => {
      if (aiSpeakingRef.current) {
        // Clear any half-collected utterance when the employee starts talking.
        samplesRef.current = [];
        speechMsRef.current = 0;
        silenceMsRef.current = 0;
        return;
      }
      const input = ev.inputBuffer.getChannelData(0);
      const level = rms(input);
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Resample the capture rate down to 8kHz by averaging, which is adequate
      // for speech and avoids a windowed-sinc filter.
      const ratio = ctx.sampleRate / TARGET_RATE;
      const out = new Float32Array(Math.floor(input.length / ratio));
      for (let i = 0; i < out.length; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = start; j < end; j++) sum += input[j];
        out[i] = end > start ? sum / (end - start) : 0;
      }

      if (level < SILENCE_RMS) {
        silenceMsRef.current += FRAME_MS;
        if (speechMsRef.current > 0 && silenceMsRef.current >= 240) {
          // End of utterance: send immediately for rapid response (< 250ms turn)
          if (speechMsRef.current >= MIN_SPEECH_MS && samplesRef.current.length > 0) {
            const pcm = Float32Array.from(samplesRef.current);
            ws.send(JSON.stringify({ type: 'audio', payload: pcm16ToMulawBase64(pcm) }));
          }
          samplesRef.current = [];
          speechMsRef.current = 0;
          silenceMsRef.current = 0;
          setUserSpeaking(false);
        }
        return;
      }

      if (level < SPEECH_RMS) return; // between the two gates: not speech, not silence
      silenceMsRef.current = 0;
      speechMsRef.current += FRAME_MS;
      if (!speakingRef.current) {
        speakingRef.current = true;
        setUserSpeaking(true);
      }
      for (const s of out) samplesRef.current.push(s);
      if (speechMsRef.current >= MAX_UTTERANCE_MS) {
        // Cap the buffer; flush rather than grow without bound on a stuck mic.
        ws.send(JSON.stringify({ type: 'audio', payload: pcm16ToMulawBase64(Float32Array.from(samplesRef.current)) }));
        samplesRef.current = [];
        speechMsRef.current = 0;
        silenceMsRef.current = 0;
        speakingRef.current = false;
        setUserSpeaking(false);
      }
    };

    source.connect(processor);
    // A ScriptProcessor only runs while connected to the destination. Route it
    // through a zero-gain node so the mic is not echoed back to the speakers.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(ctx.destination);
  }, [cleanup, employeeId, enqueueAudio]);

  const hangup = useCallback(() => {
    setState('ending');
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // The server persists the transcript and emits call.completed on hangup.
      ws.send(JSON.stringify({ type: 'hangup' }));
    } else {
      cleanup();
      setState('ended');
    }
  }, [cleanup]);

  const reset = useCallback(() => {
    cleanup();
    setState('idle');
    setError(null);
    setEvents([]);
    setSeconds(0);
  }, [cleanup]);

  useEffect(() => {
    if (state !== 'live' && state !== 'ending') return;
    const t = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAtRef.current) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  return {
    state,
    error,
    aiSpeaking,
    userSpeaking,
    seconds,
    events,
    livekitConnected,
    start,
    hangup,
    reset,
  };
}
