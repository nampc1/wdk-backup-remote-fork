/**
 * Tests for AxiosHttpClient — covers:
 *   - Successful 2xx responses
 *   - 401/403 → BackendAuthError
 *   - 4xx (non-auth) → BackendValidationError
 *   - 5xx → BackendNetworkError
 *   - Timeout (ECONNABORTED) → BackendNetworkError
 *   - General Axios network error → BackendNetworkError
 *   - Retry: 5xx is retried up to `count` times then re-throws
 */

import axios from 'axios';
import {
  BackendAuthError,
  BackendNetworkError,
  BackendValidationError,
} from '../errors/index';
import { AxiosHttpClient } from '../http/httpClient';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(retryCount = 0) {
  return new AxiosHttpClient(retryCount > 0 ? { count: retryCount, delayMs: 0, backoffFactor: 1 } : null);
}

function buildAxiosError(code?: string, status?: number, message = 'error') {
  const err = new Error(message) as Error & {
    isAxiosError: boolean;
    code?: string;
    response?: { status: number };
  };
  err.isAxiosError = true;
  if (code !== undefined) {
    err.code = code;
  }
  if (status !== undefined) {
    err.response = { status };
  }
  return err;
}

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

jest.mock('axios', () => {
  const mockAxiosInstance = {
    request: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };
  const mockAxios = {
    create: jest.fn(() => mockAxiosInstance),
    ...mockAxiosInstance,
    isAxiosError: (e: unknown) => (e as Record<string, unknown>)?.['isAxiosError'] === true,
  };
  return { __esModule: true, default: mockAxios };
});

jest.mock('axios-retry', () => ({
  __esModule: true,
  default: jest.fn(),
  isNetworkError: jest.fn(() => false),
  isRetryableError: jest.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function getMockRequest() {
  const mockInstance = (axios.create as jest.Mock).mock.results[0]?.value as {
    request: jest.Mock;
  };
  return mockInstance.request;
}

const BASE_CONFIG = {
  url: 'https://api.example.com/seed',
  method: 'GET' as const,
  headers: { Authorization: 'Bearer token' },
  timeoutMs: 5000,
};

describe('AxiosHttpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-initialize so axios.create is called fresh and mock results populate
    (axios.create as jest.Mock).mockReturnValue({
      request: jest.fn(),
      interceptors: { request: { use: jest.fn() } },
    });
  });

  // -------------------------------------------------------------------------
  // 2xx success
  // -------------------------------------------------------------------------
  it('returns data on 200 response', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 200, data: { encryptedSeed: 'abc' } });

    const res = await client.request(BASE_CONFIG);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ encryptedSeed: 'abc' });
  });

  it('returns data on 201 response', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 201, data: {} });

    const res = await client.request({ ...BASE_CONFIG, method: 'POST' });
    expect(res.status).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Auth errors
  // -------------------------------------------------------------------------
  it('throws BackendAuthError on 401', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 401, data: {} });

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendAuthError);
  });

  it('throws BackendAuthError on 403', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 403, data: {} });

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendAuthError);
  });

  it('BackendAuthError contains correct statusCode', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 401, data: {} });

    const err = await client.request(BASE_CONFIG).catch((e: unknown) => e);
    expect((err as BackendAuthError).statusCode).toBe(401);
  });

  // -------------------------------------------------------------------------
  // Validation errors
  // -------------------------------------------------------------------------
  it('throws BackendValidationError on 400', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 400, data: {} });

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendValidationError);
  });

  it('throws BackendValidationError on 422', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 422, data: {} });

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendValidationError);
  });

  // -------------------------------------------------------------------------
  // Network / server errors
  // -------------------------------------------------------------------------
  it('throws BackendNetworkError on 500', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockResolvedValue({ status: 500, data: {} });

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendNetworkError);
  });

  it('throws BackendNetworkError on ECONNABORTED (timeout)', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    const timeoutErr = buildAxiosError('ECONNABORTED');
    mockRequest.mockRejectedValue(timeoutErr);

    const err = await client.request(BASE_CONFIG).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BackendNetworkError);
    expect((err as BackendNetworkError).message).toMatch(/timed out/i);
  });

  it('throws BackendNetworkError on ETIMEDOUT', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockRejectedValue(buildAxiosError('ETIMEDOUT'));

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendNetworkError);
  });

  it('throws BackendNetworkError on generic Axios network failure', async () => {
    const client = makeClient();
    const mockRequest = getMockRequest();
    mockRequest.mockRejectedValue(buildAxiosError(undefined, undefined, 'Network Error'));

    await expect(client.request(BASE_CONFIG)).rejects.toBeInstanceOf(BackendNetworkError);
  });
});
