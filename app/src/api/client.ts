import { getStoredAuthToken } from './auth';
import { getBackendBaseUrl, isBackendConfigured } from './serverAuth';

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

export function normalizeId(value: number | string | undefined): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return `tmp-${Date.now()}`;
}

export function buildAuthHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = getStoredAuthToken();
  const nextHeaders = { ...headers };
  if (token && !nextHeaders.Authorization) {
    nextHeaders.Authorization = `Bearer ${token}`;
  }
  return nextHeaders;
}

export async function fetchJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!isBackendConfigured()) {
    throw new Error('BACKEND_NOT_CONFIGURED');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  const baseUrl = getBackendBaseUrl();
  // N\u1ebfu baseUrl r\u1ed7ng, d\u00f9ng relative path \u0111\u1ec3 nginx proxy t\u1edbi backend (khi deploy Docker)
  const url = baseUrl
    ? `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
    : endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getStoredAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    const payload = rawText && contentType.includes('application/json') ? JSON.parse(rawText) : rawText;

    if (!response.ok) {
      throw new Error(
        (payload && (payload.message || payload.error || payload.detail)) || `Request failed: ${response.status}`
      );
    }

    return (payload as T) ?? ({} as T);
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new Error('Kết nối tới server bị quá thời gian chờ (timeout).');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function safeFetchJson<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const data = await fetchJson<T>(endpoint, options);
    return { ok: true, data, status: 200 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể kết nối tới backend.';
    return { ok: false, error: message, status: undefined };
  }
}
