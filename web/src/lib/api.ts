const TOKEN_KEY = 'tac_token';

export const getApiBase = (): string => {
  const url = import.meta.env.VITE_API_URL || '';
  return url.replace(/\/+$/, '');
};

export const authStore = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

const TOKEN_FN: Array<() => string | null> = [() => authStore.getToken()];
export const onUnauthorized: Array<() => void> = [];

async function request<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = TOKEN_FN[0]?.() ?? null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  const baseUrl = getApiBase();
  try {
    res = await fetch(`${baseUrl}/api${path}`, { method, headers, body: payload, credentials: 'include' });
  } catch {
    throw new ApiClientError('Network error. Is the server running?', 'NETWORK_ERROR', 0);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }

  if (!res.ok || (json && typeof json === 'object' && (json as { success?: boolean }).success === false)) {
    const error = (json as { error?: { message?: string; code?: string } })?.error;
    const message = error?.message ?? `Request failed (${res.status})`;
    const code = error?.code ?? 'REQUEST_FAILED';
    if (res.status === 401) {
      for (const fn of onUnauthorized) fn();
    }
    throw new ApiClientError(message, code, res.status);
  }

  return json as T;
}

/**
 * Fetch a binary asset as an object URL, carrying the bearer token.
 *
 * The recording proxy sits behind the same tenant check as every other route,
 * so it cannot be loaded straight into an `<audio src>`: the browser would send
 * no Authorization header and get a 401. The blob is revoked by the caller.
 */
export async function fetchObjectUrl(path: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = TOKEN_FN[0]?.() ?? null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let url = path;
  const baseUrl = getApiBase();
  if (!url.startsWith('http')) {
    if (!url.startsWith('/api')) {
      url = `${baseUrl}/api${url.startsWith('/') ? url : `/${url}`}`;
    } else {
      url = `${baseUrl}${url}`;
    }
  }

  const res = await fetch(url, { headers, credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401) for (const fn of onUnauthorized) fn();
    throw new ApiClientError(`Could not load recording (${res.status})`, 'RECORDING_FETCH_FAILED', res.status);
  }
  return URL.createObjectURL(await res.blob());
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, undefined, form),
  /**
   * Server-sent events. Uses fetch rather than EventSource because the request
   * needs the Bearer header, which EventSource cannot send.
   */
  stream: async (
    path: string,
    body: unknown,
    handlers: { onEvent: (event: string, data: Record<string, unknown>) => void; signal?: AbortSignal },
  ): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = authStore.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const baseUrl = getApiBase();

    const res = await fetch(`${baseUrl}/api${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
      signal: handlers.signal,
    });

    if (!res.ok || !res.body) {
      throw new ApiClientError(`Stream failed (${res.status})`, 'STREAM_FAILED', res.status);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames end at a blank line; a read can land mid-frame, so only
      // consume complete frames and keep the remainder buffered.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = 'message';
        const dataLines: string[] = [];
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        try {
          handlers.onEvent(event, JSON.parse(dataLines.join('\n')));
        } catch {
          /* malformed frame; skip */
        }
      }
    }
  },
};