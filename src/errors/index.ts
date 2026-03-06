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
// 

/**
 * All errors thrown by this SDK are instances of one of these classes.
 * Consumers can use `instanceof` to handle each case specifically.
 *
 * Usage:
 *   try { await client.getSeed(token) }
 *   catch (err) {
 *     if (err instanceof BackendAuthError) { ... }
 *     if (err instanceof BackendNetworkError) { ... }
 *     if (err instanceof BackendValidationError) { ... }
 *   }
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

interface BackendErrorOptions {
  statusCode?: number;
  cause?: unknown;
}

abstract class BackendError extends Error {
  /** The HTTP status code that triggered this error, if available. */
  public readonly statusCode: number | undefined;
  /** The original cause (underlying Error, Axios error, etc.). */
  public readonly cause: unknown;

  constructor(message: string, options: BackendErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = options.statusCode;
    this.cause = options.cause;

    // Restore prototype chain (required when extending built-ins in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Auth Error — 401 / 403
// ---------------------------------------------------------------------------

/**
 * Thrown when the backend returns 401 (Unauthorized) or 403 (Forbidden).
 * The consumer should refresh / re-request the auth token and retry.
 */
export class BackendAuthError extends BackendError {
  constructor(message = 'Authentication failed', options?: BackendErrorOptions) {
    super(message, options);
  }
}

// ---------------------------------------------------------------------------
// Network Error — timeout, DNS failure, connection refused, etc.
// ---------------------------------------------------------------------------

/**
 * Thrown when the request cannot be completed due to a network-level failure.
 * This includes: connection timeout, DNS resolution failure, ECONNREFUSED,
 * and any error that occurs before the server returns an HTTP response.
 */
export class BackendNetworkError extends BackendError {
  constructor(message = 'Network error', options?: BackendErrorOptions) {
    super(message, options);
  }
}

// ---------------------------------------------------------------------------
// Validation Error — malformed response, unexpected 4xx
// ---------------------------------------------------------------------------

/**
 * Thrown when:
 * - The backend returns a 4xx status that is NOT 401/403 (e.g. 400, 422).
 * - The response body does not match the expected shape.
 *
 * The consumer should NOT retry automatically; a code or payload problem
 * on the client side must be fixed first.
 */
export class BackendValidationError extends BackendError {
  constructor(message = 'Validation error', options?: BackendErrorOptions) {
    super(message, options);
  }
}
