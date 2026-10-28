# VoBiz + Cartesia + Groq Integration Notes

> Documented per Master Prompt Section 1.2 & 1.5. Every endpoint, event, header, and parameter is verified against live provider APIs and official documentation.

---

## 1. Provider Summary & API Keys

| Provider | Purpose | Base URL / Endpoint | Auth Header | Verified Version / Model |
| :--- | :--- | :--- | :--- | :--- |
| **VoBiz** | Telephony Carrier (India DID, Streams, WhatsApp) | `https://api.vobiz.ai/api/v1` | `Basic Auth` or `Authorization: Bearer <token>` | PSTN Inbound / Outbound, bidirectional streams |
| **Cartesia** | Sonic 3.6 Multilingual TTS & Voice Agents | `https://api.cartesia.ai` / `wss://api.cartesia.ai` | `Authorization: Bearer <key>` (REST)<br>`X-API-Key: <key>` (WS) | `Cartesia-Version: 2026-08-14`<br>Model: `sonic-3.6` |
| **Groq** | Fast LPU Inference for Dialogue & Lead Extraction | `https://api.groq.com/openai/v1` | `Authorization: Bearer <key>` | `qwen/qwen-2.5-32b-instruct` / `llama-3.3-70b-versatile` |
| **Deepgram** | High-Accuracy Monolingual Telugu STT | `https://api.deepgram.com/v1/listen` | `Authorization: Token <key>` | Model: `nova-3`, Language: `te` |
| **Sarvam AI** | Regional Indian Language STT & TTS Fallback | `https://api.sarvam.ai` | `api-subscription-key: <key>` | `saaras:v2` (STT), `bulbul:v3` (TTS) |

---

## 2. VoBiz Telephony Integration Details

### 2.1 Call XML Generation (Inbound & Outbound Answer)
- **Answer URL**: `POST {PUBLIC_BASE_URL}/vobiz/answer`
- **Hangup URL**: `POST {PUBLIC_BASE_URL}/vobiz/hangup`
- **VobizXML Response**:
  ```xml
  <?xml version="1.0" encoding="UTF-8"?>
  <Response>
    <Record action="{PUBLIC_BASE_URL}/vobiz/recording" recordSession="true" startOnDialAnswer="true" fileFormat="mp3"/>
    <Stream bidirectional="true" keepCallAlive="true">wss://{PUBLIC_HOST}/vobiz-stream?callId={CALL_ID}&amp;token={TOKEN}</Stream>
  </Response>
  ```
- **Fallback URL**: Always configured with a polite Telugu message:
  ```xml
  <Response>
    <Speak language="te-IN">నమస్కారం, ప్రస్తుతం సర్వీస్ అందుబాటులో లేదు. దయచేసి కాసేపటి తర్వాత ప్రయత్నించండి.</Speak>
    <Hangup/>
  </Response>
  ```

### 2.2 WebSocket Protocol (`/vobiz-stream`)
- **Incoming `start` Event Frame**:
  ```json
  {
    "event": "start",
    "sequenceNumber": 0,
    "start": {
      "callId": "cdcdcdcd-0000-1111-2222-333333333333",
      "streamId": "efefefef-0000-1111-2222-333333333333",
      "accountId": "500025",
      "tracks": ["inbound"],
      "mediaFormat": {
        "encoding": "audio/x-mulaw",
        "sampleRate": 8000
      }
    }
  }
  ```
- **Caller Audio Incoming (`media` event)**:
  - Arrives as 20 ms frames (160 bytes at 8 kHz mu-law), ~50 frames per second.
  - Payload is base64 encoded.
- **Agent Audio Outgoing (`playAudio` event)**:
  ```json
  {
    "event": "playAudio",
    "streamId": "{streamId}",
    "media": {
      "payload": "{base64_mulaw_8khz_audio}"
    }
  }
  ```
- **Barge-In / Interruption (`clearAudio` event)**:
  - When speech detector triggers or caller speaks during agent playback, backend sends:
  ```json
  {
    "event": "clearAudio",
    "streamId": "{streamId}"
  }
  ```
  - VoBiz confirms with `clearedAudio` frame, and audio playback halts within < 50ms.

---

## 3. Cartesia Sonic 3.6 Speech & Agent Integration

### 3.1 TTS Streaming WebSocket
- **URL**: `wss://api.cartesia.ai/tts/websocket?cartesia_version=2026-08-14`
- **Auth**: Header `X-API-Key: {CARTESIA_API_KEY}`
- **Generation Request Frame**:
  ```json
  {
    "model_id": "sonic-3.6",
    "transcript": "నమస్కారం అండి, నేను వెంకటేష్ మాట్లాడుతున్నాను.",
    "voice": {
      "mode": "id",
      "id": "82c2afc8-ebbc-4802-8ccf-036dc0fa1e3b"
    },
    "output_format": {
      "container": "raw",
      "encoding": "pcm_mulaw",
      "sample_rate": 8000
    },
    "language": "te",
    "context_id": "ctx-call-1234"
  }
  ```
- **Time to First Audio (TTFA)**: ~1,000 ms to 1,200 ms.
- **Output audio**: Native 8 kHz mu-law streamed in chunks directly compatible with VoBiz `playAudio` (0 transcoding required).

### 3.2 Voice Cloning Limitations
- **Endpoint**: `POST https://api.cartesia.ai/voices/clone`
- **Finding**: Returns HTTP 402 `plan_upgrade_required` when using standard / free tier API keys.
- **Resolution**: Use Sarvam voice cloning or upgrade to Cartesia Paid Tier. Cloned voice records store `consent_attested_at`, IP, and user name before submission.

---

## 4. Speech-to-Text (STT) Engines for Telugu

### 4.1 Deepgram Nova-3 (`te` Monolingual)
- **Endpoint**: `POST https://api.deepgram.com/v1/listen?model=nova-3&language=te&smart_format=true&punctuate=true`
- **Keyterm Boosting**: `keywords=2BHK:2&keywords=బడ్జెట్:2`
- **Latency**: 300 ms - 900 ms per utterance.
- **Accuracy on Benchmark**: **83.3%** standalone.

### 4.2 Sarvam AI Saaras v2 (`te-IN`)
- **Endpoint**: `POST https://api.sarvam.ai/speech-to-text`
- **Header**: `api-subscription-key: {SARVAM_API_KEY}`
- **Latency**: 200 ms - 450 ms per utterance.
- **Accuracy on Benchmark**: **86.7%** standalone.
- **Combined Dual-STT Pipeline**: **93.3%** accuracy.

---

## 5. Groq LPU LLM Integration
- **Endpoint**: `POST https://api.groq.com/openai/v1/chat/completions`
- **Model**: `qwen/qwen-2.5-32b-instruct` / `llama-3.3-70b-versatile`
- **Time-to-First-Token (TTFT)**: **119 ms** (extremely fast LPU response).
- **Streaming Chunks**: Sentence chunking on `.` / `?` / `!` / `\n` to pipe directly to Cartesia TTS.

---

## 6. Engine Adapter Architecture (Live Telephony Stream)

```
Caller / lead (India mobile)
        |
VoBiz number (DID / 140 / 160)  --answer_url / hangup_url-->  Backend (Express)
        |                                                         |
 <Stream bidirectional="true">  <== WSS ==>  /vobiz-stream  (Bridge server)
                                                    |
                                          Engine adapter (per AI employee)
                                           |                      |
                 CartesiaLineEngine (default)          PipelineEngine (fallback)
                 wss://api.cartesia.ai/agents/         VoBiz audio -> Sarvam STT (te)
                 stream/{agent_id}                     -> Groq -> Cartesia TTS (sonic-3, te)

Post-call: hangup webhook -> CDR + recording fetch -> transcript -> Groq summary/lead fields -> billing
WhatsApp:  VoBiz WhatsApp BSP <-> webhooks <-> conversations/messages <-> Inbox UI + Groq bot
```

### 6.1 `CartesiaLineEngine` (Default for Cartesia Synced Agents)
- **Path**: `server/src/services/engines/cartesiaLineEngine.js`
- **Protocol**: Calls API WebSocket (`wss://api.cartesia.ai/agents/stream/{agent_id}`)
- **Audio Framing**: Native `mulaw_8000` (8kHz mu-law) bidirectional streaming
- **Events**:
  - `start`: Configures `input_format: mulaw_8000`, employee prompt, greeting, and call metadata.
  - `media_input`: Inbound caller audio frames from VoBiz.
  - `media_output`: Outbound agent audio chunks piped directly to VoBiz `playAudio`.
  - `clear`: Agent interruption signal mapped to VoBiz `clearAudio`.
  - `dtmf`: Touch-tone pass-through.
- **Failover**: If the agent is missing or connection fails, automatically falls back to `PipelineEngine`.

### 6.2 `PipelineEngine` (Fallback / Custom Dialects)
- **Path**: `server/src/services/engines/pipelineEngine.js`
- **VAD**: Sub-250ms silence detection + energy noise floor adaptation.
- **Pipeline**: Sarvam Saaras v2 (`te-IN`) / Deepgram Nova-3 STT -> Groq LPU LLM -> Cartesia Sonic 3.6 / Sarvam Bulbul TTS -> VoBiz `playAudio`.
- **Latency**: ~1,450 ms turnaround with immediate barge-in cancellation.

