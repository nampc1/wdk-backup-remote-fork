/**
 * Tests for BackendBackupClient — uses a mock IHttpClient injection.
 * No real HTTP requests are made.
 *
 * Covers:
 *   - uploadSeed: correct endpoint, method, auth header, body shape
 *   - uploadEntropy: correct endpoint, method, auth header, body shape
 *   - getSeed: array response parsing, null handling, empty array, validation
 *   - getEntropy: array response parsing, null handling, empty array, validation
 *   - deleteBackup: both DELETE requests fired in parallel
 *   - Error propagation: auth error, network error
 *   - Constructor: missing baseUrl throws
 *   - URL normalisation: trailing slash is stripped
 */

import { BackendBackupClient } from '../backendClient';
import {
  BackendAuthError,
  BackendNetworkError,
  BackendValidationError,
} from '../errors/index';
import type { IHttpClient } from '../http/httpClient';
import type { HttpRequestConfig, HttpResponse } from '../types';

// ---------------------------------------------------------------------------
// Mock IHttpClient factory
// ---------------------------------------------------------------------------

function makeMockHttp(
  impl: (config: HttpRequestConfig) => Promise<HttpResponse>,
): IHttpClient {
  return { request: jest.fn(impl) as unknown as IHttpClient['request'] };
}

function successHttp(data: unknown = {}): IHttpClient {
  return makeMockHttp(() => Promise.resolve({ status: 200, data }));
}

function errorHttp(err: Error): IHttpClient {
  return makeMockHttp(() => Promise.reject(err));
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.example.com';
const TOKEN = 'test-bearer-token';

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('BackendBackupClient — constructor', () => {
  it('throws if baseUrl is empty', () => {
    expect(() => new BackendBackupClient({ baseUrl: '' })).toThrow(
      'BackendBackupConfig.baseUrl is required',
    );
  });

  it('strips trailing slash from baseUrl', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: `${BASE_URL}/` }, http);
    await client.uploadSeed({ seed: 'x', authToken: TOKEN });

    const mock = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(mock.url).toBe('https://api.example.com/seed');
  });
});

// ---------------------------------------------------------------------------
// uploadSeed
// ---------------------------------------------------------------------------

describe('BackendBackupClient.uploadSeed', () => {
  it('calls POST /seed with correct url, method, and Bearer auth', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.uploadSeed({ seed: 'enc-seed', authToken: TOKEN });

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.url).toBe(`${BASE_URL}/seed`);
    expect(call.method).toBe('POST');
    expect(call.headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends { seed, metadata } in body', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.uploadSeed({ seed: 'enc-seed', authToken: TOKEN, metadata: { device: 'ios' } });

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.body).toEqual({ seed: 'enc-seed', metadata: { device: 'ios' } });
  });

  it('defaults metadata to {} when not provided', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.uploadSeed({ seed: 'enc', authToken: TOKEN });

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.body).toEqual({ seed: 'enc', metadata: {} });
  });

  it('propagates BackendAuthError', async () => {
    const http = errorHttp(new BackendAuthError());
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(
      client.uploadSeed({ seed: 'x', authToken: TOKEN }),
    ).rejects.toBeInstanceOf(BackendAuthError);
  });

  it('propagates BackendNetworkError', async () => {
    const http = errorHttp(new BackendNetworkError('timeout'));
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(
      client.uploadSeed({ seed: 'x', authToken: TOKEN }),
    ).rejects.toBeInstanceOf(BackendNetworkError);
  });
});

// ---------------------------------------------------------------------------
// uploadEntropy
// ---------------------------------------------------------------------------

describe('BackendBackupClient.uploadEntropy', () => {
  it('calls POST /entropy with correct url and Bearer auth', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.uploadEntropy({ entropy: 'enc-ent', authToken: TOKEN });

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.url).toBe(`${BASE_URL}/entropy`);
    expect(call.method).toBe('POST');
    expect(call.headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('sends { entropy, metadata } in body', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.uploadEntropy({ entropy: 'enc-ent', authToken: TOKEN, metadata: { v: 1 } });

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.body).toEqual({ entropy: 'enc-ent', metadata: { v: 1 } });
  });

  it('defaults metadata to {} when not provided', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.uploadEntropy({ entropy: 'enc-ent', authToken: TOKEN });

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.body).toEqual({ entropy: 'enc-ent', metadata: {} });
  });
});

// ---------------------------------------------------------------------------
// getSeed
// ---------------------------------------------------------------------------

describe('BackendBackupClient.getSeed', () => {
  it('returns all seeds from the array', async () => {
    const http = successHttp({
      seeds: [
        { seed: 'old-seed', metadata: {} },
        { seed: 'newest-seed', metadata: { ts: 123 } },
      ],
    });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getSeed(TOKEN);
    expect(result).toEqual([
      { seed: 'old-seed', metadata: {} },
      { seed: 'newest-seed', metadata: { ts: 123 } },
    ]);
  });

  it('returns the seed array when only one item exists', async () => {
    const http = successHttp({
      seeds: [{ seed: 'only-seed' }],
    });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getSeed(TOKEN);
    expect(result).toEqual([{ seed: 'only-seed' }]);
  });

  it('calls GET /seed with Authorization Bearer header', async () => {
    const http = successHttp({ seeds: [{ seed: 'seed' }] });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.getSeed(TOKEN);

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.url).toBe(`${BASE_URL}/seed`);
    expect(call.method).toBe('GET');
    expect(call.headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
  });

  it('returns empty array when backend returns null', async () => {
    const http = successHttp(null);
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getSeed(TOKEN);
    expect(result).toEqual([]);
  });

  it('returns empty array when backend returns undefined', async () => {
    const http = makeMockHttp(() => Promise.resolve({ status: 200, data: undefined as unknown }));
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getSeed(TOKEN);
    expect(result).toEqual([]);
  });

  it('returns empty array when seeds array is empty', async () => {
    const http = successHttp({ seeds: [] });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getSeed(TOKEN);
    expect(result).toEqual([]);
  });

  it('throws BackendValidationError when seeds field is missing', async () => {
    const http = successHttp({ somethingElse: 'oops' });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(client.getSeed(TOKEN)).rejects.toBeInstanceOf(BackendValidationError);
  });

  it('throws BackendValidationError when seed item has empty string', async () => {
    const http = successHttp({ seeds: [{ seed: '' }] });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(client.getSeed(TOKEN)).rejects.toBeInstanceOf(BackendValidationError);
  });

  it('propagates BackendAuthError from HTTP layer', async () => {
    const http = errorHttp(new BackendAuthError('401'));
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(client.getSeed(TOKEN)).rejects.toBeInstanceOf(BackendAuthError);
  });
});

// ---------------------------------------------------------------------------
// getEntropy
// ---------------------------------------------------------------------------

describe('BackendBackupClient.getEntropy', () => {
  it('returns all entropies from the array', async () => {
    const http = successHttp({
      entropies: [
        { entropy: 'old-entropy' },
        { entropy: 'newest-entropy', metadata: { ts: 456 } },
      ],
    });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getEntropy(TOKEN);
    expect(result).toEqual([
      { entropy: 'old-entropy' },
      { entropy: 'newest-entropy', metadata: { ts: 456 } },
    ]);
  });

  it('returns empty array when backend returns null', async () => {
    const http = successHttp(null);
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getEntropy(TOKEN);
    expect(result).toEqual([]);
  });

  it('returns empty array when entropies array is empty', async () => {
    const http = successHttp({ entropies: [] });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    const result = await client.getEntropy(TOKEN);
    expect(result).toEqual([]);
  });

  it('throws BackendValidationError when entropies field is missing', async () => {
    const http = successHttp({ data: 'wrong-shape' });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(client.getEntropy(TOKEN)).rejects.toBeInstanceOf(BackendValidationError);
  });

  it('calls GET /entropy with Authorization Bearer header', async () => {
    const http = successHttp({ entropies: [{ entropy: 'ent' }] });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.getEntropy(TOKEN);

    const call = (http.request as jest.Mock).mock.calls[0]?.[0] as HttpRequestConfig;
    expect(call.url).toBe(`${BASE_URL}/entropy`);
    expect(call.method).toBe('GET');
    expect(call.headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
  });
});

// ---------------------------------------------------------------------------
// deleteBackup
// ---------------------------------------------------------------------------

describe('BackendBackupClient.deleteBackup', () => {
  it('fires two DELETE requests in parallel', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.deleteBackup(TOKEN);

    const calls = (http.request as jest.Mock).mock.calls as [HttpRequestConfig][];
    expect(calls).toHaveLength(2);

    const urls = calls.map((c) => c[0].url).sort();
    expect(urls).toContain(`${BASE_URL}/seed`);
    expect(urls).toContain(`${BASE_URL}/entropy`);

    const methods = calls.map((c) => c[0].method);
    expect(methods).toEqual(['DELETE', 'DELETE']);
  });

  it('sends Authorization Bearer on both DELETE requests', async () => {
    const http = successHttp({});
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await client.deleteBackup(TOKEN);

    const calls = (http.request as jest.Mock).mock.calls as [HttpRequestConfig][];
    calls.forEach((c) => {
      expect(c[0].headers?.['Authorization']).toBe(`Bearer ${TOKEN}`);
    });
  });

  it('propagates error if one DELETE fails', async () => {
    let callCount = 0;
    const http = makeMockHttp(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ status: 200, data: {} });
      return Promise.reject(new BackendNetworkError('seed delete failed'));
    });
    const client = new BackendBackupClient({ baseUrl: BASE_URL }, http);
    await expect(client.deleteBackup(TOKEN)).rejects.toBeInstanceOf(BackendNetworkError);
  });
});
