import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { ApiError } from '@/api/types/errors';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

const getConfiguredApiBaseUrl = () => {
  if (!apiBaseUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL. Set it in mobile/.env (e.g., your existing backend base URL).'
    );
  }
  return apiBaseUrl.replace(/\/$/, '');
};

const isLoopbackHost = (host: string) => ['localhost', '127.0.0.1', '::1'].includes(host.toLowerCase());

const parseHostFromUrl = (url: string): string | null => {
  const match = url.match(/^[a-z]+:\/\/([^/:?#]+)/i);
  return match?.[1] ?? null;
};

const replaceHostInUrl = (url: string, host: string): string =>
  url.replace(/^([a-z]+:\/\/)([^/:?#]+)/i, `$1${host}`);

const getExpoHost = () => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const [host] = hostUri.split(':');
  return host?.trim() || null;
};

const getApiBaseUrlCandidates = () => {
  const primary = getConfiguredApiBaseUrl();
  const candidates = [primary];
  const host = parseHostFromUrl(primary);
  const expoHost = getExpoHost();

  if (host && isLoopbackHost(host) && expoHost && !isLoopbackHost(expoHost)) {
    candidates.push(replaceHostInUrl(primary, expoHost));
  }

  return Array.from(new Set(candidates));
};

const buildUrl = (baseUrl: string, path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
};

const getNetworkErrorMessage = (attemptedUrls: string[], networkMessage: string) => {
  const firstAttempt = attemptedUrls[0] ?? getConfiguredApiBaseUrl();
  const attemptedTargets = attemptedUrls.length > 1 ? attemptedUrls.join(', ') : firstAttempt;
  const host = parseHostFromUrl(firstAttempt);

  if (host && isLoopbackHost(host)) {
    return [
      networkMessage || 'Network request failed.',
      `Could not reach ${attemptedTargets}.`,
      'For local development, start the web backend with `npm run dev` in the repo root.',
      'If testing on a physical iPhone, set EXPO_PUBLIC_API_URL to your Mac LAN IP (for example, http://192.168.1.20:3000) and restart Expo.',
    ].join(' ');
  }

  if (!networkMessage) {
    return `Network request failed. Could not reach ${attemptedTargets}.`;
  }

  return `${networkMessage} (URL: ${firstAttempt})`;
};

const getAuthHeader = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const header: Record<string, string> = {};
  if (token) {
    header.Authorization = `Bearer ${token}`;
  }
  return header;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers } = options;
  const baseUrls = getApiBaseUrlCandidates();
  const attemptedUrls: string[] = [];
  const authHeader = await getAuthHeader();
  const isFormDataBody = typeof FormData !== 'undefined' && body instanceof FormData;
  const hasBody = body !== undefined && body !== null;

  let response: Response | null = null;
  let networkError: unknown = null;
  for (const baseUrl of baseUrls) {
    const url = buildUrl(baseUrl, path);
    attemptedUrls.push(url);
    try {
      response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
          ...authHeader,
          ...headers,
        },
        body: hasBody ? (isFormDataBody ? body : JSON.stringify(body)) : undefined,
      });
      networkError = null;
      break;
    } catch (error: unknown) {
      networkError = error;
    }
  }

  if (!response) {
    const networkMessage =
      networkError && typeof networkError === 'object' && 'message' in networkError
        ? String((networkError as { message?: unknown }).message ?? '')
        : '';
    const message = getNetworkErrorMessage(attemptedUrls, networkMessage);
    throw new ApiError(message, 0, {
      originalError: networkError,
      attemptedUrls,
    });
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    let message = response.statusText || `Request failed (${response.status})`;
    if (isJson && payload && typeof payload === 'object') {
      const candidate =
        (payload as { message?: unknown }).message ??
        (payload as { error?: unknown }).error ??
        (payload as { details?: unknown }).details;
      if (typeof candidate === 'string' && candidate.trim()) {
        message = candidate;
      }
    } else if (typeof payload === 'string' && payload.trim()) {
      message = payload.trim();
    }
    throw new ApiError(message || 'Request failed', response.status, payload);
  }

  return payload as T;
}
