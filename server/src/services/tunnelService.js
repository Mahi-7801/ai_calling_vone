const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env here too, not just in src/index.js. Any script that imports this
// module standalone (server/scratch/*, server/scripts/*) would otherwise see an
// empty environment, silently fall back to "quick" mode, and burn the Cloudflare
// per-IP quota on a tunnel nobody asked for. dotenv never overrides variables
// that are already set, so this is safe to call more than once.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

let activeTunnelUrl = null;
let tunnelProc = null;
let watchdog = null;

// -----------------------------------------------------------------------------
// Modes
// -----------------------------------------------------------------------------
// off    - an external tunnel (ngrok / a reverse proxy) is already serving this
//          app and PUBLIC_WEBHOOK_URL points at it. We never launch anything.
// ngrok  - launch ngrok instead of cloudflared. Needs a free authtoken. No
//          Cloudflare per-IP quota, so it is immune to the 429 problem, but the
//          free tier hands out a random *.ngrok-free.app subdomain that changes
//          on every restart.
// named  - a Cloudflare *named* tunnel started with an account token. No rate
//          limits, a stable hostname, survives restarts. The only mode suitable
//          for production.
// quick  - the account-less trycloudflare.com tunnel. Cloudflare caps these per
//          IP (~200/day) and answers HTTP 429 / error 1015 once you exceed it.
//          Good for a smoke test, not for a server that stays up.
function envFlag(name) {
  return String(process.env[name] || '').trim();
}

function resolveTunnelMode() {
  const explicit = envFlag('TUNNEL_MODE').toLowerCase();
  if (['off', 'none', 'external'].includes(explicit)) return 'off';
  if (explicit === 'ngrok') return 'ngrok';
  if (explicit === 'named') return 'named';
  if (explicit === 'quick') return 'quick';
  if (envFlag('PUBLIC_WEBHOOK_URL')) return 'off';
  if (envFlag('CLOUDFLARE_TUNNEL_TOKEN')) return 'named';
  if (envFlag('NGROK_AUTHTOKEN')) return 'ngrok';
  return 'quick';
}

const TUNNEL_MODE = resolveTunnelMode();

// -----------------------------------------------------------------------------
// Backoff
// -----------------------------------------------------------------------------
// A plain launch failure (transient DNS, no network) is worth retrying quickly.
const BACKOFF_START_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;

// A quick-tunnel rate limit is NOT a transient blip: it is a daily per-IP quota.
// Minute-scale backoff just burns the remaining quota window, so a 429 gets its
// own much longer cooldown instead of sharing the generic one.
const RATE_LIMIT_COOLDOWN_START_MS = 15 * 60 * 1000;
const RATE_LIMIT_COOLDOWN_MAX_MS = 6 * 60 * 60 * 1000;

let consecutiveFailures = 0;
let rateLimitStrikes = 0;
let nextLaunchAllowedAt = 0;
let lastLoggedCooldownUntil = 0;
let lastRateLimitNoticeAt = 0;

function genericBackoffMs() {
  return Math.min(BACKOFF_START_MS * 2 ** Math.max(0, consecutiveFailures - 1), BACKOFF_MAX_MS);
}

function rateLimitCooldownMs() {
  return Math.min(
    RATE_LIMIT_COOLDOWN_START_MS * 2 ** Math.max(0, rateLimitStrikes - 1),
    RATE_LIMIT_COOLDOWN_MAX_MS
  );
}

function namedTunnelUrl() {
  const raw = envFlag('CLOUDFLARE_TUNNEL_HOSTNAME') || envFlag('PUBLIC_WEBHOOK_URL');
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, '');
}

function tunnelArgs(port) {
  if (TUNNEL_MODE === 'ngrok') {
    // --log=stdout makes ngrok emit JSON lines to stdout, which is the only
    // reliable way to learn the assigned *.ngrok-free.app URL. The authtoken is
    // passed via the NGROK_AUTHTOKEN env var (inherited from our own .env) so it
    // never appears in the process command line.
    const domain = envFlag('NGROK_DOMAIN');
    return {
      args: [
        'http', String(port),
        '--log=stdout',
        '--log-format=json',
        ...(domain ? ['--domain', domain] : []),
      ],
      staticUrl: domain ? `https://${domain}` : null,
    };
  }

  if (TUNNEL_MODE === 'named') {
    // Prefer --token-file: passing the token in argv exposes it to any process
    // listing on the machine (tasklist / Get-Process shows command lines).
    const tokenFile = envFlag('CLOUDFLARE_TUNNEL_TOKEN_FILE');
    const token = envFlag('CLOUDFLARE_TUNNEL_TOKEN');
    const credentialArgs = tokenFile
      ? ['--token-file', tokenFile]
      : token
        ? ['--token', token]
        : [];
    return {
      args: ['tunnel', '--no-autoupdate', 'run', ...credentialArgs],
      // A named tunnel serves the hostname configured in the Cloudflare
      // dashboard, so it never prints a trycloudflare URL for us to scrape.
      staticUrl: namedTunnelUrl(),
    };
  }
  return { args: ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], staticUrl: null };
}

// Node refuses to spawn a .cmd/.bat without a shell, and passing an args array
// alongside shell:true is deprecated (DEP0190) because the arguments are
// concatenated without escaping. Every value here comes from our own .env, never
// from user input, and is quote-escaped before being handed to the shell.
function spawnTunnelProcess(exePath, args) {
  if (!/\.(cmd|bat)$/i.test(exePath)) {
    return spawn(exePath, args);
  }
  const line = [exePath, ...args].map((a) => `"${String(a).replace(/"/g, '""')}"`).join(' ');
  return spawn(line, { shell: true });
}

function cloudflaredExePath() {
  return envFlag('CLOUDFLARED_PATH') || path.join(__dirname, '..', '..', 'bin', 'cloudflared.exe');
}

function ngrokExePath() {
  return envFlag('NGROK_PATH') || path.join(__dirname, '..', '..', 'bin', 'ngrok.exe');
}

function tunnelExePath() {
  return TUNNEL_MODE === 'ngrok' ? ngrokExePath() : cloudflaredExePath();
}

function launchTunnel(port) {
  return new Promise((resolve) => {
    try {
      const now = Date.now();
      if (nextLaunchAllowedAt > now) {
        // Log the cooldown once per window instead of on every 60s watchdog
        // tick, otherwise the log is nothing but "still rate limited".
        if (nextLaunchAllowedAt !== lastLoggedCooldownUntil) {
          lastLoggedCooldownUntil = nextLaunchAllowedAt;
          console.warn(
            `[tunnel] Cooldown active (${rateLimitStrikes > 0 ? 'quick-tunnel rate limit' : 'previous failure'}). ` +
              `Next attempt in ${Math.ceil((nextLaunchAllowedAt - now) / 1000)}s.`
          );
        }
        return resolve(null);
      }

      const exePath = tunnelExePath();
      const providerName = TUNNEL_MODE === 'ngrok' ? 'ngrok' : 'cloudflared';
      if (!fs.existsSync(exePath)) {
        console.warn(`[tunnel] ${providerName} executable not found at:`, exePath);
        console.warn(`[tunnel] Set ${TUNNEL_MODE === 'ngrok' ? 'NGROK_PATH' : 'CLOUDFLARED_PATH'} in server/.env to point at the binary.`);
        return resolve(null);
      }

      if (TUNNEL_MODE === 'ngrok' && !envFlag('NGROK_AUTHTOKEN')) {
        console.warn(
          '[tunnel] TUNNEL_MODE is "ngrok" but NGROK_AUTHTOKEN is not set.\n' +
            '         Get a free token at https://dashboard.ngrok.com/get-started/your-authtoken\n' +
            '         then add it to server/.env as NGROK_AUTHTOKEN=<token>.'
        );
        return resolve(null);
      }

      if (
        TUNNEL_MODE === 'named' &&
        !envFlag('CLOUDFLARE_TUNNEL_TOKEN') &&
        !envFlag('CLOUDFLARE_TUNNEL_TOKEN_FILE')
      ) {
        console.warn(
          '[tunnel] TUNNEL_MODE is "named" but neither CLOUDFLARE_TUNNEL_TOKEN nor ' +
            'CLOUDFLARE_TUNNEL_TOKEN_FILE is set. Set one, or use TUNNEL_MODE=quick or TUNNEL_MODE=ngrok.'
        );
        return resolve(null);
      }

      const { args, staticUrl } = tunnelArgs(port);
      const label =
        TUNNEL_MODE === 'named' ? 'named Cloudflare tunnel'
        : TUNNEL_MODE === 'ngrok' ? 'ngrok tunnel'
        : 'Cloudflare quick tunnel';
      console.log(`[tunnel] Launching ${label} for port ${port} ...`);

      const proc = spawnTunnelProcess(exePath, args);
      tunnelProc = proc;

      let settled = false;
      let rateLimited = false;
      let timer = null;

      const finish = (value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);

        if (value) {
          consecutiveFailures = 0;
          rateLimitStrikes = 0;
          nextLaunchAllowedAt = 0;
          lastLoggedCooldownUntil = 0;
          return resolve(value);
        }

        if (rateLimited) {
          rateLimitStrikes += 1;
          consecutiveFailures = 0;
          const cooldown = rateLimitCooldownMs();
          nextLaunchAllowedAt = Date.now() + cooldown;
          // Rate limits are the one failure worth explaining rather than just
          // logging, but not on every attempt during a long cooldown.
          if (Date.now() - lastRateLimitNoticeAt > 30 * 60 * 1000) {
            lastRateLimitNoticeAt = Date.now();
            console.warn(
              `[tunnel] Cloudflare rejected the quick tunnel (HTTP 429 / error 1015).\n` +
                `         trycloudflare.com allows only a limited number of tunnels per IP per day, and the\n` +
                `         limit does not lift on a short timer. Pausing for ${Math.round(cooldown / 60000)} minutes.\n` +
                `         Inbound PSTN webhooks will NOT work until a tunnel is available, because the carrier\n` +
                `         cannot reach a localhost address_url. To fix this permanently, create a free named\n` +
                `         tunnel and set CLOUDFLARE_TUNNEL_TOKEN (+ CLOUDFLARE_TUNNEL_HOSTNAME) in server/.env.`
            );
          }
        } else {
          consecutiveFailures += 1;
          nextLaunchAllowedAt = Date.now() + genericBackoffMs();
        }
        resolve(null);
      };

      const onLog = (chunk) => {
        const text = chunk.toString();

        // ngrok reports its assigned URL as a JSON log line:
        //   {"lvl":"info","msg":"started tunnel","url":"https://abc.ngrok-free.app",...}
        if (TUNNEL_MODE === 'ngrok') {
          for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const entry = JSON.parse(trimmed);
              if (typeof entry?.url === 'string' && /^https:\/\//.test(entry.url)) {
                adoptUrl(entry.url, 'ngrok');
                return finish(activeTunnelUrl);
              }
            } catch {
              // Not JSON - fall through to the plain-text form below.
            }
            const m = trimmed.match(/url=(https:\/\/[^\s"]+)/);
            if (m) {
              adoptUrl(m[1], 'ngrok');
              return finish(activeTunnelUrl);
            }
          }
          if (/authtoken|authentication failed|ERR.*(login|auth)/i.test(text)) {
            console.warn('[tunnel] ngrok reported an auth problem. Check NGROK_AUTHTOKEN in server/.env.');
          }
          return;
        }

        if (/status 429|error code: 1015|too many requests|rate.?limit/i.test(text)) {
          rateLimited = true;
        }

        const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) {
          const url = match[0].trim();
          adoptUrl(url, 'quick');
          return finish(activeTunnelUrl);
        }

        // Named tunnels announce readiness on the tunnel connection, not with a
        // URL. Treat that as "up" and attach the configured hostname.
        if (TUNNEL_MODE === 'named' && /registered tunnel connection|connection.*registered/i.test(text)) {
          if (staticUrl) {
            adoptUrl(staticUrl, 'named');
            return finish(activeTunnelUrl);
          }
        }
      };

      proc.stdout.on('data', onLog);
      proc.stderr.on('data', onLog);

      const procLabel = TUNNEL_MODE === 'ngrok' ? 'ngrok' : 'cloudflared';
      proc.on('error', (err) => {
        console.warn(`[tunnel] ${procLabel} process error:`, err.message);
        finish(null);
      });

      proc.on('exit', (code) => {
        console.log(`[tunnel] ${procLabel} exited with code: ${code}`);
        finish(null);
      });

      // If the process is alive and we know the URL, accept it even without a log
      // line (some versions stay quiet on the happy path).
      timer = setTimeout(() => {
        if (settled) return;
        if (TUNNEL_MODE !== 'quick' && staticUrl && proc.exitCode === null) {
          adoptUrl(staticUrl, TUNNEL_MODE);
          return finish(activeTunnelUrl);
        }
        console.warn(`[tunnel] ${procLabel} start timeout.`);
        finish(null);
      }, 30000);
    } catch (err) {
      console.warn('[tunnel] Error launching tunnel process:', err.message);
      consecutiveFailures += 1;
      nextLaunchAllowedAt = Date.now() + genericBackoffMs();
      resolve(null);
    }
  });
}

function adoptUrl(url, mode) {
  if (!url || url === activeTunnelUrl) return;
  activeTunnelUrl = url;
  process.env.PUBLIC_WEBHOOK_URL = activeTunnelUrl;
  console.log(`[tunnel] >>> PUBLIC TUNNEL ACTIVE (${mode}): ${activeTunnelUrl}`);
}

// Verify a public URL is actually reachable (a dead tunnel returns 520/530/1033).
//
// ngrok's free tier injects a browser-warning interstitial (ERR_NGROK_6024) for
// browser-like requests. It still answers 200, so a status-only check would
// report a broken tunnel as healthy forever. Ask ngrok to skip the warning and
// then confirm the body is actually OUR health response. Server-to-server
// callers (VoBiz) do not send a browser User-Agent and are not affected.
async function checkPublicUrl(url) {
  if (!url || !url.startsWith('https://')) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${url}/api/health`, {
      signal: controller.signal,
      headers: { 'ngrok-skip-browser-warning': 'true' },
    });
    clearTimeout(timer);
    if (res.status < 200 || res.status >= 500) return false;
    const body = await res.text().catch(() => '');
    if (/ERR_NGROK_\d+/.test(body)) {
      // The tunnel is up but only serving the interstitial. Not a dead tunnel,
      // so do not thrash - but the bypass header did not take effect.
      return true;
    }
    // Confirm it is really our app, not a captive portal or proxy error page.
    return body.includes('"status"');
  } catch {
    return false;
  }
}

async function getPublicUrl(port = 5000) {
  // 1. Env override — only trust it if it is actually reachable.
  if (process.env.PUBLIC_WEBHOOK_URL && process.env.PUBLIC_WEBHOOK_URL.startsWith('https://')) {
    if (activeTunnelUrl !== process.env.PUBLIC_WEBHOOK_URL) {
      activeTunnelUrl = process.env.PUBLIC_WEBHOOK_URL;
    }
    if (await checkPublicUrl(activeTunnelUrl)) {
      return activeTunnelUrl;
    }
    console.warn('[tunnel] Stale PUBLIC_WEBHOOK_URL detected, relaunching tunnel.');
    activeTunnelUrl = null;
  }

  // 2. Cached URL — validate before trusting so a stale/expired tunnel is always
  //    refreshed (a dead answer_url means silent calls).
  if (activeTunnelUrl && activeTunnelUrl.startsWith('https://')) {
    if (await checkPublicUrl(activeTunnelUrl)) {
      return activeTunnelUrl;
    }
    console.warn('[tunnel] Cached tunnel URL unreachable, refreshing...');
    activeTunnelUrl = null;
  }

  // 3. Launch a fresh tunnel.
  if (TUNNEL_MODE === 'off') {
    // Launching is disabled, so do not let every caller wait on a doomed launch.
    return null;
  }
  return launchTunnel(port);
}

function setPublicUrl(url) {
  if (url && url.startsWith('https://')) adoptUrl(url, 'manual');
}

// Lets callers (and the admin UI) tell "no tunnel because it is cooling down"
// apart from "no tunnel because none was ever configured".
function getTunnelStatus() {
  const coolingDown = nextLaunchAllowedAt > Date.now();
  return {
    mode: TUNNEL_MODE,
    url: activeTunnelUrl,
    available: Boolean(activeTunnelUrl),
    coolingDown,
    retryInSeconds: coolingDown ? Math.ceil((nextLaunchAllowedAt - Date.now()) / 1000) : 0,
    rateLimited: rateLimitStrikes > 0,
    rateLimitStrikes,
  };
}

function isTunnelAvailable() {
  return Boolean(activeTunnelUrl);
}

// Watchdog: re-validate the active tunnel and relaunch if it died. Without this a
// tunnel that expires silently breaks every new call that embeds the answer_url
// (the "call connects but the AI is silent" bug). launchTunnel() owns the backoff,
// so a rate-limited account is not retried on every tick.
function startTunnelWatchdog(port = 5000) {
  if (watchdog) clearInterval(watchdog);
  watchdog = setInterval(async () => {
    if (!activeTunnelUrl) {
      await getPublicUrl(port);
      return;
    }
    const ok = await checkPublicUrl(activeTunnelUrl);
    if (!ok) {
      console.warn('[tunnel] Watchdog: tunnel unreachable, refreshing...');
      activeTunnelUrl = null;
      if (tunnelProc) {
        try { tunnelProc.kill(); } catch {}
        tunnelProc = null;
      }
      await getPublicUrl(port);
    }
  }, 60 * 1000);
  if (watchdog.unref) watchdog.unref();
  return watchdog;
}

function stopTunnel() {
  if (watchdog) {
    clearInterval(watchdog);
    watchdog = null;
  }
  if (tunnelProc) {
    try { tunnelProc.kill(); } catch {}
    tunnelProc = null;
  }
  activeTunnelUrl = null;
}

/**
 * Public wss:// origin for bidirectional media (Twilio <Stream>).
 *
 * Verified: the HTTP tunnel used for webhooks (ngrok, cloudflared quick or named
 * tunnels) does terminate a WebSocket upgrade on its https origin, so
 * `https://host` -> `wss://host` is a working media endpoint with no extra
 * infrastructure. An earlier version of this comment claimed the opposite and
 * that was wrong.
 *
 * TLS_WS_URL wins when set, for a stable custom domain. Otherwise the currently
 * active tunnel is used. Deliberately does not call getPublicUrl(), which can
 * launch a tunnel - answering a call must not block on that, and if no tunnel is
 * up the caller gets the <Gather> fallback instead.
 *
 * Returns null for loopback/unparseable values: Twilio cannot reach those, and
 * handing it a dead Stream is worse than the turn-based fallback.
 */
function getPublicWsUrl() {
  // Explicit kill switch. A <Stream> that connects but carries no audio is
  // worse than the turn-based fallback: the caller hears nothing and the carrier
  // drops the call. "off" keeps every call on <Gather>.
  const raw = String(process.env.TLS_WS_URL || '').trim().toLowerCase();
  if (raw === 'off' || raw === 'false' || raw === '0' || raw === 'disabled') return null;

  const candidates = [process.env.TLS_WS_URL, activeTunnelUrl];
  for (const candidate of candidates) {
    const configured = String(candidate || '').trim();
    if (!configured) continue;
    const origin = configured.replace(/\/+$/, '').replace(/^http:/, 'https:');
    let host;
    try {
      host = new URL(origin).hostname;
    } catch {
      console.warn('[tunnel] Not a usable TLS origin for <Stream>; skipping.');
      continue;
    }
    if (!host || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
      console.warn(`[tunnel] ${host === activeTunnelUrl ? 'Active tunnel' : 'TLS_WS_URL'} points at loopback; Twilio cannot reach it, so <Stream> stays disabled.`);
      continue;
    }
    return origin;
  }
  return null;
}

module.exports = {
  getPublicUrl,
  getPublicWsUrl,
  setPublicUrl,
  checkPublicUrl,
  startTunnelWatchdog,
  stopTunnel,
  getTunnelStatus,
  isTunnelAvailable,
  TUNNEL_MODE,
};
