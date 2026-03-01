import { supabase } from '@/lib/supabase';
import { ApiError } from '@/api/types/errors';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

const apiBaseUrl = process.env.EXPO_PUBLIC_API_URL;

const buildUrl = (path: string) => {
  if (!apiBaseUrl) {
    throw new Error(
      'Missing EXPO_PUBLIC_API_URL. Set it in mobile/.env (e.g., your existing backend base URL).'
    );
  }
  return `${apiBaseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
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
  const url = buildUrl(path);
  const authHeader = await getAuthHeader();

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error: unknown) {
    const networkMessage =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : '';
    throw new ApiError(networkMessage || 'Network request failed', 0, error);
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
