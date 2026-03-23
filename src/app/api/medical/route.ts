/**
 * Next.js API Route for Medical RAG Integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getBackendInternalHeaders, hasBackendInternalAuth } from '@/lib/backendInternalAuth';

const PRODUCTION_BACKEND_FALLBACK = 'https://vytara-ssr-qzin.onrender.com';
const FLASK_API_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (process.env.NODE_ENV === 'production' ? PRODUCTION_BACKEND_FALLBACK : 'http://localhost:8000');
const DEFAULT_BACKEND_URLS = process.env.NODE_ENV === 'production' ? [] : ['http://127.0.0.1:8000', 'http://localhost:8000'];
const BACKEND_ENV_KEYS = ['BACKEND_URL', 'NEXT_PUBLIC_BACKEND_URL'] as const;
const MEDICAL_REQUEST_TIMEOUT_MS = Number(process.env.MEDICAL_REQUEST_TIMEOUT_MS || 150000);
const BACKEND_WAKEUP_TIMEOUT_MS = Number(process.env.MEDICAL_WAKEUP_TIMEOUT_MS || 70000);

type ProxyError = Error & { status?: number };

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, '');

function getCandidateBackendUrls() {
  const envUrls = BACKEND_ENV_KEYS.map((key) => process.env[key])
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => normalizeBaseUrl(value.trim()));

  return Array.from(
    new Set([
      normalizeBaseUrl(FLASK_API_URL),
      ...envUrls,
      ...DEFAULT_BACKEND_URLS.map(normalizeBaseUrl),
    ])
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

function createProxyError(message: string, status = 500) {
  const error = new Error(message) as ProxyError;
  error.status = status;
  return error;
}

function sanitizeBackendResponse(status: number, data: unknown): Record<string, unknown> {
  if (status < 500 && typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }

  if (status < 500) {
    return {
      success: false,
      error: 'Unexpected response from medical service.',
    };
  }

  return {
    success: false,
    error: 'Medical service is temporarily unavailable.',
    message: 'Medical service is temporarily unavailable. Please try again.',
  };
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    /timeout/i.test(error.message)
  );
}

function getSelfHosts(request: NextRequest) {
  const hosts = new Set<string>();
  const hostHeader = request.headers.get('host');
  const forwardedHostHeader = request.headers.get('x-forwarded-host');

  for (const rawValue of [hostHeader, forwardedHostHeader]) {
    if (!rawValue) continue;
    for (const segment of rawValue.split(',')) {
      const normalized = segment.trim().split(':')[0]?.toLowerCase();
      if (normalized) {
        hosts.add(normalized);
      }
    }
  }

  return hosts;
}

async function wakeBackend(baseUrl: string) {
  try {
    await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(BACKEND_WAKEUP_TIMEOUT_MS),
    });
  } catch (error: unknown) {
    console.warn(`⚠️ [Next.js API] Backend wake-up attempt failed for ${baseUrl}: ${getErrorMessage(error)}`);
  }
}

async function fetchBackendJson(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const responseText = await response.text();
  const trimmedResponseText = responseText.trimStart();

  if (
    contentType.includes('application/json') ||
    trimmedResponseText.startsWith('{') ||
    trimmedResponseText.startsWith('[')
  ) {
    try {
      const data = JSON.parse(trimmedResponseText);
      return { response, data };
    } catch {
      throw createProxyError(`invalid JSON (${response.status}) from ${url}`, 502);
    }
  }

  const bodyPreview =
    trimmedResponseText.slice(0, 120).replace(/\s+/g, ' ') || '<empty>';
  throw createProxyError(
    `non-JSON (${response.status}) from ${url}, starts with: ${bodyPreview}`,
    response.status >= 500 ? response.status : 502
  );
}

async function callFlask(endpoint: string, method: string, disallowedHosts: Set<string>, body?: unknown) {
  if (!hasBackendInternalAuth()) {
    throw createProxyError('Backend internal authentication is not configured.', 500);
  }

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...getBackendInternalHeaders(),
    },
    signal: AbortSignal.timeout(MEDICAL_REQUEST_TIMEOUT_MS),
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const candidateUrls = getCandidateBackendUrls();
  const attemptErrors: string[] = [];

  for (const baseUrl of candidateUrls) {
    let candidateHost = '';
    try {
      candidateHost = new URL(baseUrl).hostname.toLowerCase();
    } catch {
      attemptErrors.push(`invalid backend URL configuration: ${baseUrl}`);
      continue;
    }

    if (disallowedHosts.has(candidateHost)) {
      attemptErrors.push(`skipped self-referential backend URL ${baseUrl}`);
      continue;
    }

    const url = `${baseUrl}${endpoint}`;
    console.log(`📡 [Next.js API] Calling Flask: ${method} ${url}`);

    try {
      const { response, data } = await fetchBackendJson(url, options);
      console.log(`✅ [Next.js API] Flask response OK from ${baseUrl}`);
      return { status: response.status, data, backendUrl: baseUrl };
    } catch (error: unknown) {
      if (isTimeoutError(error)) {
        attemptErrors.push(`timeout from ${url}; backend may be waking from Render cold start`);
        await wakeBackend(baseUrl);

        try {
          const retryOptions: RequestInit = {
            ...options,
            signal: AbortSignal.timeout(MEDICAL_REQUEST_TIMEOUT_MS),
          };
          const { response, data } = await fetchBackendJson(url, retryOptions);
          console.log(`✅ [Next.js API] Flask response OK after warm-up retry from ${baseUrl}`);
          return { status: response.status, data, backendUrl: baseUrl };
        } catch (retryError: unknown) {
          attemptErrors.push(`retry failed for ${url}: ${getErrorMessage(retryError)}`);
          continue;
        }
      }

      attemptErrors.push(getErrorMessage(error));
    }
  }

  const joinedErrors = attemptErrors.join(' | ');
  throw createProxyError(
    `Medical backend is unavailable or waking up. If using Render free tier, wait ~1 minute and retry. Attempts: ${joinedErrors}`,
    503
  );
}

export async function POST(request: NextRequest) {
  try {
    console.log('📥 [Next.js API] POST /api/medical');

    if (!(await getAuthenticatedUser(request))) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const disallowedHosts = getSelfHosts(request);

    const body = await request.json();
    const {
      action,
      folder_type,
      use_cache,
      force_regenerate,
      max_new_structured_extractions,
      profile_id,
      user_id,
    } = body;

    const normalizedProfileId =
      typeof profile_id === 'string' ? profile_id.trim() : '';

    if (!normalizedProfileId) {
      return NextResponse.json(
        { success: false, error: 'profile_id is required' },
        { status: 400 }
      );
    }

    if (
      user_id &&
      typeof user_id === 'string' &&
      user_id.trim() &&
      user_id.trim() !== normalizedProfileId
    ) {
      console.warn('⚠️ [Next.js API] Ignoring user_id because profile_id is required for profile-scoped medical calls');
    }

    console.log(`📋 [Next.js API] Action: ${action}, Profile: ${normalizedProfileId}`);

    if (action === 'process') {
      const result = await callFlask('/api/process-files', 'POST', disallowedHosts, {
        profile_id: normalizedProfileId,
        user_id: normalizedProfileId,
        folder_type: folder_type || 'reports',
      });
      return NextResponse.json(
        {
          ...sanitizeBackendResponse(result.status, result.data),
          backend_url: result.backendUrl,
        },
        { status: result.status }
      );
    }

    if (action === 'generate-summary') {
      const result = await callFlask('/api/generate-summary', 'POST', disallowedHosts, {
        profile_id: normalizedProfileId,
        user_id: normalizedProfileId,
        folder_type,
        use_cache: use_cache !== false,
        force_regenerate: force_regenerate === true,
        max_new_structured_extractions,
      });
      return NextResponse.json(
        {
          ...sanitizeBackendResponse(result.status, result.data),
          backend_url: result.backendUrl,
        },
        { status: result.status }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error('❌ [Next.js API] Error:', error);
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    const message =
      status === 503
        ? 'Medical service is temporarily unavailable. Please try again in a minute.'
        : 'Medical request failed. Please try again.';
    const payload: Record<string, unknown> = {
      success: false,
      error: message,
      message,
    };

    if (process.env.NODE_ENV !== 'production') {
      payload.details = getErrorMessage(error);
    }

    return NextResponse.json(
      payload,
      { status }
    );
  }
}
