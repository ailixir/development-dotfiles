import axios, { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig, RawAxiosResponseHeaders, ResponseType } from 'axios';
import { getResponse } from 'msw';
import type { RequestHandler } from 'msw';
import { handlers } from './handlers';

const requestHandlers = handlers as unknown as RequestHandler[];

function isBodyAllowed(method: string): boolean {
  return !['GET', 'HEAD'].includes(method.toUpperCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeHeaders(headers: InternalAxiosRequestConfig['headers']): Headers {
  const normalized = new Headers();
  const flatHeaders = AxiosHeaders.from(headers).toJSON() as Record<string, unknown>;

  Object.entries(flatHeaders).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      normalized.set(key, value.map((item) => String(item)).join(', '));
      return;
    }
    normalized.set(key, String(value));
  });

  return normalized;
}

function buildRequestBody(data: unknown, method: string, headers: Headers): BodyInit | null | undefined {
  if (!isBodyAllowed(method) || data === undefined || data === null) {
    return undefined;
  }

  if (
    typeof data === 'string' ||
    data instanceof Blob ||
    data instanceof FormData ||
    data instanceof URLSearchParams ||
    data instanceof ArrayBuffer
  ) {
    return data;
  }

  if (ArrayBuffer.isView(data)) {
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return view.slice().buffer;
  }

  if (isPlainObject(data)) {
    if (!headers.has('content-type') && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return JSON.stringify(data);
  }

  return String(data);
}

function normalizeRequestUrl(config: InternalAxiosRequestConfig): string {
  const raw = axios.getUri(config);
  if (typeof window === 'undefined') return raw;
  return new URL(raw, window.location.origin).toString();
}

async function parseResponseData(response: Response, responseType?: ResponseType): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  switch (responseType) {
    case 'arraybuffer':
      return response.arrayBuffer();
    case 'blob':
      return response.blob();
    case 'text':
    case 'document':
    case 'stream':
      return response.text();
    default: {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      const text = await response.text();
      if (!text) return text;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }
}

function toAxiosResponse(
  response: Response,
  config: InternalAxiosRequestConfig,
  request: Request,
  data: unknown
): AxiosResponse {
  const responseHeaders: RawAxiosResponseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    config,
    request,
  };
}

export async function resolveInlineMockResponse(
  config: InternalAxiosRequestConfig
): Promise<AxiosResponse | undefined> {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const method = (config.method || 'get').toUpperCase();
  const headers = normalizeHeaders(config.headers);
  const signal = config.signal as AbortSignal | undefined;
  const request = new Request(normalizeRequestUrl(config), {
    method,
    headers,
    body: buildRequestBody(config.data, method, headers),
    signal,
    credentials: config.withCredentials ? 'include' : 'same-origin',
  });

  const mockedResponse = await getResponse(requestHandlers, request, {
    baseUrl: window.location.origin,
  });

  if (!mockedResponse) {
    return undefined;
  }

  const data = await parseResponseData(mockedResponse, config.responseType);
  const axiosResponse = toAxiosResponse(mockedResponse, config, request, data);
  const validateStatus = config.validateStatus || ((status: number) => status >= 200 && status < 300);

  if (!validateStatus(mockedResponse.status)) {
    throw new AxiosError(
      `Request failed with status code ${mockedResponse.status}`,
      mockedResponse.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      request,
      axiosResponse
    );
  }

  return axiosResponse;
}

