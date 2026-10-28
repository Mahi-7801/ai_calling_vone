# ai_calling_vone

Enterprise AI Calling SaaS Platform — Multi-lingual Real-Time Conversational AI Telephony (Telugu, Hindi, English, Tamil, Kannada, Malayalam, Marathi) powered by Groq, Cartesia Sonic 3.6, VoBiz PSTN, LiveKit WebRTC Cloud, and InsForge Postgres.

## Architecture

- **Frontend (`/web`)**: React 19, Vite, TailwindCSS, LiveKit WebRTC Client, TanStack Query.
- **Backend (`/server`)**: Node.js, Express, WebSocket streaming, Cartesia TTS, Groq LLM, InsForge PostgreSQL BaaS.

## Quick Start

### 1. Backend
```bash
cd server
npm install
npm run dev
```

### 2. Frontend
```bash
cd web
npm install
npm run dev
```

## Deployment

- **Backend**: Render (Web Service running `server/`)
- **Frontend**: Vercel (Vite SPA running `web/`)
