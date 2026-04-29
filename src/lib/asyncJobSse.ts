export type AsyncJobEventName = 'accepted' | 'progress' | 'completed' | 'failed';

export interface AsyncJobResult {
  summary?: string;
  message?: string;
  reply?: string;
  [key: string]: unknown;
}

export interface AsyncJobEventPayload {
  status?: string;
  stage?: string;
  message?: string;
  error?: string;
  result?: AsyncJobResult;
  [key: string]: unknown;
}

interface StreamJobOptions {
  streamPath: string;
  onAccepted?: (payload: AsyncJobEventPayload) => void;
  onProgress?: (payload: AsyncJobEventPayload) => void;
  onCompleted: (payload: AsyncJobEventPayload) => void;
  onFailed: (payload: AsyncJobEventPayload) => void;
}

const parseEventPayload = (event: MessageEvent<string>): AsyncJobEventPayload => {
  try {
    const parsed = JSON.parse(event.data || '{}');
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as AsyncJobEventPayload)
      : {};
  } catch {
    return {};
  }
};

export const streamAsyncJob = (jobId: string, options: StreamJobOptions): EventSource => {
  const source = new EventSource(`${options.streamPath}/${encodeURIComponent(jobId)}`);
  let terminal = false;

  const complete = (handler: (payload: AsyncJobEventPayload) => void, payload: AsyncJobEventPayload) => {
    if (terminal) return;
    terminal = true;
    handler(payload);
    source.close();
  };

  source.addEventListener('accepted', (event) => {
    if (terminal) return;
    options.onAccepted?.(parseEventPayload(event as MessageEvent<string>));
  });

  source.addEventListener('progress', (event) => {
    if (terminal) return;
    options.onProgress?.(parseEventPayload(event as MessageEvent<string>));
  });

  source.addEventListener('completed', (event) => {
    complete(options.onCompleted, parseEventPayload(event as MessageEvent<string>));
  });

  source.addEventListener('failed', (event) => {
    complete(options.onFailed, parseEventPayload(event as MessageEvent<string>));
  });

  source.onerror = () => {
    complete(options.onFailed, { error: 'Unable to process request.' });
  };

  return source;
};
