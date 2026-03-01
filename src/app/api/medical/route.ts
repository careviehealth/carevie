/**
 * Next.js API Route for Medical RAG Integration
 */

import { NextRequest, NextResponse } from 'next/server';

const FLASK_API_URL = process.env.NEXT_PUBLIC_CHATBOT_URL || 'http://localhost:8000';
const DEFAULT_BACKEND_URLS = ['http://127.0.0.1:8000', 'http://localhost:8000'];
const BACKEND_ENV_KEYS = [
  'BACKEND_URL',
  'NEXT_PUBLIC_BACKEND_URL',
  'NEXT_PUBLIC_CHATBOT_URL',
] as const;

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

async function callFlask(endpoint: string, method: string, body?: unknown) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const candidateUrls = getCandidateBackendUrls();
  const attemptErrors: string[] = [];

  for (const baseUrl of candidateUrls) {
    const url = `${baseUrl}${endpoint}`;
    console.log(`📡 [Next.js API] Calling Flask: ${method} ${url}`);

    try {
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
          console.log(`✅ [Next.js API] Flask response OK from ${baseUrl}`);
          return { status: response.status, data, backendUrl: baseUrl };
        } catch {
          attemptErrors.push(`invalid JSON (${response.status}) from ${url}`);
          continue;
        }
      }

      const bodyPreview =
        trimmedResponseText.slice(0, 120).replace(/\s+/g, ' ') || '<empty>';
      attemptErrors.push(
        `non-JSON (${response.status}) from ${url}, starts with: ${bodyPreview}`
      );
    } catch (error: unknown) {
      attemptErrors.push(`network failure for ${url}: ${getErrorMessage(error)}`);
    }
  }

  const joinedErrors = attemptErrors.join(' | ');
  throw createProxyError(
    `Unable to reach a valid Flask JSON endpoint. Set BACKEND_URL/NEXT_PUBLIC_BACKEND_URL correctly. Attempts: ${joinedErrors}`,
    503
  );
}

export async function POST(request: NextRequest) {
  try {
    console.log('📥 [Next.js API] POST /api/medical');
    
    const body = await request.json();
    const {
      action,
      folder_type,
      use_cache,
      force_regenerate,
      max_new_structured_extractions,
      user_id
    } = body;
    
    if (!user_id) {
      return NextResponse.json(
        { success: false, error: 'user_id is required' },
        { status: 400 }
      );
    }
    
    console.log(`📋 [Next.js API] Action: ${action}, User: ${user_id}`);
    
    if (action === 'process') {
      const result = await callFlask('/api/process-files', 'POST', {
        user_id,
        folder_type: folder_type || 'reports'
      });
      return NextResponse.json(
        { ...result.data, backend_url: result.backendUrl },
        { status: result.status }
      );
    }
    
    else if (action === 'generate-summary') {
      const result = await callFlask('/api/generate-summary', 'POST', {
        user_id,
        folder_type,
        use_cache: use_cache !== false,
        force_regenerate: force_regenerate === true,
        max_new_structured_extractions
      });
      return NextResponse.json(
        { ...result.data, backend_url: result.backendUrl },
        { status: result.status }
      );
    }
    
    else {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }
    
  } catch (error: unknown) {
    console.error('❌ [Next.js API] Error:', error);
    const status =
      error instanceof Error && 'status' in error && typeof error.status === 'number'
        ? error.status
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
        backend_candidates: getCandidateBackendUrls(),
      },
      { status }
    );
  }
}
