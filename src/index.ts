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
 * Re-exports everything a consuming application needs.
 * Internal implementation details (AxiosHttpClient, response schemas, etc.)
 * are intentionally NOT exported to keep the public surface minimal and stable.
 */

// Public class
export { BackendBackupClient } from './backendClient.js';

// Public interfaces / types
export type {
  BackendBackupConfig,
  UploadSeedParams,
  UploadEntropyParams,
  SeedItem,
  EntropyItem,
  RetryConfig,
  DebugInterceptor,
  RequestDebugInfo,
  ResponseDebugInfo,
  ErrorDebugInfo,
} from './types.js';

// Typed errors — consumers need these for `instanceof` checks
export {
  BackendAuthError,
  BackendNetworkError,
  BackendValidationError,
} from './errors/index.js';

// IHttpClient — exported so consumers can provide a custom HTTP implementation
export type { IHttpClient } from './http/httpClient.js';
