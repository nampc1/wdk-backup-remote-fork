// Copyright 2026 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 *
 * The primary entry-point for consumers of this SDK.
 *
 * Security contract:
 *   - Encrypted payloads are NEVER logged, neither here nor in the HTTP layer.
 *   - Encrypted payloads are NEVER modified before being sent.
 *   - Backend response shapes are validated with Zod before being returned.
 *   - HTTP status codes are validated; non-2xx always raises a typed error.
 */

import { z } from 'zod';
import { AxiosHttpClient, type IHttpClient } from './http/httpClient.js';
import { BackendValidationError } from './errors/index.js';
import type {
  BackendBackupConfig,
  UploadSeedParams,
  UploadEntropyParams,
  RetryConfig,
  SeedItem,
  EntropyItem,
} from './types.js';

// ---------------------------------------------------------------------------
// Response schemas (Zod) — runtime shape validation
//
// The backend returns arrays: { seeds: [{ seed, metadata }, ...] }.
// The SDK validates the shape and extracts the most recent entry so
// callers get a plain string back.
// ---------------------------------------------------------------------------

const SeedItemSchema = z.object({
  seed: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const SeedResponseSchema = z.object({
  seeds: z.array(SeedItemSchema),
});

const EntropyItemSchema = z.object({
  entropy: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

const EntropyResponseSchema = z.object({
  entropies: z.array(EntropyItemSchema),
});

// ---------------------------------------------------------------------------
// Default configuration values
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

const DEFAULT_RETRY: Partial<RetryConfig> = {
  count: 3,
  delayMs: 300,
  backoffFactor: 2,
};

// ---------------------------------------------------------------------------
// BackendBackupClient
// ---------------------------------------------------------------------------

export class BackendBackupClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly http: IHttpClient;

  /**
   * @param config  SDK configuration (baseUrl, timeoutMs, retry strategy).
   * @param http    Optional IHttpClient injection point — useful for testing or
   *                replacing the HTTP layer entirely without touching this class.
   */
  constructor(config: BackendBackupConfig, http?: IHttpClient) {
    if (!config.baseUrl) {
      throw new Error('BackendBackupConfig.baseUrl is required');
    }
    // Normalise: strip trailing slash so URL construction is predictable
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    this.http =
      http ??
      new AxiosHttpClient(
        config.retry === null ? null : { ...DEFAULT_RETRY, ...config.retry },
        config.debug,
      );
  }

  // -------------------------------------------------------------------------
  // Upload
  // -------------------------------------------------------------------------

  /**
   * Upload the encrypted seed to the backend.
   * The payload is transmitted as-is — no transformation is applied.
   */
  async uploadSeed(params: UploadSeedParams): Promise<void> {
    const { seed, authToken, metadata } = params;

    await this.http.request({
      url: this.url('/seed'),
      method: 'POST',
      headers: this.authHeader(authToken),
      body: { seed, metadata: metadata ?? {} },
      timeoutMs: this.timeoutMs,
    });
  }

  /**
   * Upload the encrypted entropy to the backend.
   * The payload is transmitted as-is — no transformation is applied.
   */
  async uploadEntropy(params: UploadEntropyParams): Promise<void> {
    const { entropy, authToken, metadata } = params;

    await this.http.request({
      url: this.url('/entropy'),
      method: 'POST',
      headers: this.authHeader(authToken),
      body: { entropy, metadata: metadata ?? {} },
      timeoutMs: this.timeoutMs,
    });
  }

  // -------------------------------------------------------------------------
  // Retrieve
  // -------------------------------------------------------------------------

  /**
   * Retrieve all encrypted seeds from the backend.
   * Returns the complete array (each item has seed + metadata).
   * Empty array when no backup exists.
   */
  async getSeed(authToken: string): Promise<SeedItem[]> {
    const response = await this.http.request<unknown>({
      url: this.url('/seed'),
      method: 'GET',
      headers: this.authHeader(authToken),
      timeoutMs: this.timeoutMs,
    });

    if (response.data === null || response.data === undefined) {
      return [];
    }

    return this.parseResponse(
      response.data,
      SeedResponseSchema,
      (parsed) => parsed.seeds as SeedItem[],
      'GET /seed',
    );
  }

  /**
   * Retrieve all encrypted entropies from the backend.
   * Returns the complete array (each item has entropy + metadata).
   * Empty array when no backup exists.
   */
  async getEntropy(authToken: string): Promise<EntropyItem[]> {
    const response = await this.http.request<unknown>({
      url: this.url('/entropy'),
      method: 'GET',
      headers: this.authHeader(authToken),
      timeoutMs: this.timeoutMs,
    });

    if (response.data === null || response.data === undefined) {
      return [];
    }

    return this.parseResponse(
      response.data,
      EntropyResponseSchema,
      (parsed) => parsed.entropies as EntropyItem[],
      'GET /entropy',
    );
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  /**
   * Delete both the seed and entropy backups from the backend in parallel.
   * Both DELETE requests are fired concurrently; errors from either are
   * propagated to the caller.
   */
  async deleteBackup(authToken: string): Promise<void> {
    await Promise.all([
      this.http.request({
        url: this.url('/seed'),
        method: 'DELETE',
        headers: this.authHeader(authToken),
        timeoutMs: this.timeoutMs,
      }),
      this.http.request({
        url: this.url('/entropy'),
        method: 'DELETE',
        headers: this.authHeader(authToken),
        timeoutMs: this.timeoutMs,
      }),
    ]);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private authHeader(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Parse and validate the raw API response data with a Zod schema.
   * Throws BackendValidationError if the shape does not match.
   *
   * NOTE: `data` is intentionally typed as `unknown` — we never assume the
   * response shape without explicit validation.
   */
  private parseResponse<TSchema extends z.ZodTypeAny, TOut>(
    data: unknown,
    schema: TSchema,
    extract: (parsed: z.infer<TSchema>) => TOut,
    endpoint: string,
  ): TOut {
    const result = schema.safeParse(data);

    if (!result.success) {
      throw new BackendValidationError(
        `Unexpected response shape from ${endpoint}: ${result.error.message}`,
        { cause: result.error },
      );
    }

    return extract(result.data as z.infer<TSchema>);
  }
}
