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
 * IHttpClient is the seam that allows the concrete HTTP implementation to be
 * swapped out (e.g. in tests, or for a custom fetch-based implementation).
 *
 * AxiosHttpClient is the production implementation backed by Axios +
 * axios-retry.  It never logs request/response bodies to prevent accidental
 * leakage of encrypted payloads.
 */

import axios, {
  type AxiosInstance,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios';
import axiosRetry, { isNetworkError, isRetryableError } from 'axios-retry';
import {
  BackendAuthError,
  BackendNetworkError,
  BackendValidationError,
} from '../errors/index.js';
import type {
  HttpRequestConfig,
  HttpResponse,
  RetryConfig,
  DebugInterceptor,
} from '../types.js';

// ---------------------------------------------------------------------------
// Public interface — the only thing BackendBackupClient depends on
// ---------------------------------------------------------------------------

export interface IHttpClient {
  request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>>;
}

// ---------------------------------------------------------------------------
// Default retry configuration
// ---------------------------------------------------------------------------

const DEFAULT_RETRY: RetryConfig = {
  count: 3,
  delayMs: 300,
  backoffFactor: 2,
};

// ---------------------------------------------------------------------------
// AxiosHttpClient
// ---------------------------------------------------------------------------

export class AxiosHttpClient implements IHttpClient {
  private readonly instance: AxiosInstance;
  private readonly debug: DebugInterceptor | null;

  constructor(
    retry: Partial<RetryConfig> | null | undefined,
    debug?: DebugInterceptor | null,
  ) {
    this.debug = debug ?? null;

    this.instance = axios.create({
      // baseURL is NOT set here — full URLs are passed per-request so the
      // client can be reused against different endpoints if needed.
      validateStatus: () => true, // Handle status codes ourselves
    });

    if (retry !== null && retry !== undefined) {
      const cfg: RetryConfig = { ...DEFAULT_RETRY, ...retry };

      axiosRetry(this.instance, {
        retries: cfg.count,
        retryDelay: (retryNumber) =>
          cfg.delayMs * Math.pow(cfg.backoffFactor, retryNumber - 1),
        retryCondition: (error: AxiosError) =>
          // Retry on network errors and 5xx — never retry 4xx
          isNetworkError(error) || isRetryableError(error),
        onRetry: (_retryCount, _error, _requestConfig) => {
          // Intentionally do NOT log the error body or request payload to
          // prevent leaking encrypted values into logs.
        },
      });
    }

    // Strip sensitive headers from logs (defence-in-depth)
    this.instance.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => config,
      (error: unknown) => Promise.reject(error),
    );
  }

  async request<T = unknown>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    this.debug?.onRequest?.({
      url: config.url,
      method: config.method,
      headers: config.headers ?? {},
      body: config.body ?? {},
    });

    const startMs = Date.now();

    try {
      const response = await this.instance.request<T>({
        url: config.url,
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        data: config.body,
        timeout: config.timeoutMs,
      });

      const durationMs = Date.now() - startMs;

      this.debug?.onResponse?.({
        url: config.url,
        method: config.method,
        status: response.status,
        data: response.data,
        durationMs,
      });

      return this.handleResponse<T>(response.status, response.data);
    } catch (err) {
      const durationMs = Date.now() - startMs;
      const classified = this.classifyError(err);

      this.debug?.onError?.({
        url: config.url,
        method: config.method,
        error: classified,
        durationMs,
      });

      throw classified;
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private handleResponse<T>(status: number, data: T): HttpResponse<T> {
    if (status >= 200 && status < 300) {
      return { status, data };
    }

    if (status === 401 || status === 403) {
      throw new BackendAuthError(
        `Authentication failed (HTTP ${status})`,
        { statusCode: status },
      );
    }

    if (status >= 400 && status < 500) {
      throw new BackendValidationError(
        `Request rejected by server (HTTP ${status})`,
        { statusCode: status },
      );
    }

    // 5xx — should have been retried already; surface as network error
    throw new BackendNetworkError(
      `Server error (HTTP ${status})`,
      { statusCode: status },
    );
  }

  private classifyError(err: unknown): Error {
    // Already one of our typed errors (thrown inside handleResponse)
    if (
      err instanceof BackendAuthError ||
      err instanceof BackendValidationError ||
      err instanceof BackendNetworkError
    ) {
      return err;
    }

    const axiosErr = err as AxiosError | undefined;

    if (axiosErr?.code === 'ECONNABORTED' || axiosErr?.code === 'ETIMEDOUT') {
      return new BackendNetworkError('Request timed out', { cause: err });
    }

    if (axiosErr?.isAxiosError) {
      return new BackendNetworkError(
        axiosErr.message ?? 'Network error',
        { cause: err },
      );
    }

    return new BackendNetworkError('Unknown network error', { cause: err });
  }
}
