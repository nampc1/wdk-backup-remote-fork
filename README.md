# @tetherto/wdk-backup-remote

> Production-grade SDK for securely uploading and retrieving encrypted wallet seeds and entropy to/from a client backend.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![License: Apache%202.0](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)

---

## Overview

`@tetherto/wdk-backup-remote` handles all communication between a wallet application and a client-owned backend that stores **pre-encrypted** seed phrases and entropy. The backend **never receives plaintext** — encryption is handled separately by the crypto module before data ever reaches this SDK.

**Platform support:** React Native · Web · Node.js (no native APIs)

---

## Installation

```bash
npm install @tetherto/wdk-backup-remote
# or
yarn add @tetherto/wdk-backup-remote
```

**Peer requirements:** Node ≥ 16, TypeScript ≥ 5 (for consumers using TS)

---

## Quick Start

```ts
import {
  BackendBackupClient,
  BackendAuthError,
  BackendNetworkError,
  BackendValidationError,
} from "@tetherto/wdk-backup-remote";

const client = new BackendBackupClient({
  baseUrl: "https://api.mywallet.com",
  timeoutMs: 15_000, // optional, default: 10_000 ms
  retry: {
    // optional, set to null to disable
    count: 3,
    delayMs: 300,
    backoffFactor: 2, // exponential: 300ms → 600ms → 1200ms
  },
});
```

---

## API Reference

### `new BackendBackupClient(config, http?)`

| Parameter          | Type                           | Required | Description                                                                    |
| ------------------ | ------------------------------ | -------- | ------------------------------------------------------------------------------ |
| `config.baseUrl`   | `string`                       | ✅       | Backend base URL (trailing slash is stripped automatically)                    |
| `config.timeoutMs` | `number`                       | ❌       | Request timeout in ms (default: `10_000`)                                      |
| `config.retry`     | `Partial<RetryConfig> \| null` | ❌       | Retry strategy; `null` disables retries (default: 3 retries, 300 ms, factor 2) |
| `http`             | `IHttpClient`                  | ❌       | Inject a custom HTTP implementation (useful for testing)                       |

---

### Methods

#### `uploadSeed(params): Promise<void>`

Uploads the encrypted seed to `POST /seed`.

```ts
await client.uploadSeed({
  seed: "<base64-or-hex-encrypted-seed>",
  authToken: "bearer-token",
  metadata: { device: "ios" }, // optional
});
```

#### `uploadEntropy(params): Promise<void>`

Uploads the encrypted entropy to `POST /entropy`.

```ts
await client.uploadEntropy({
  entropy: "<base64-or-hex-encrypted-entropy>",
  authToken: "bearer-token",
  metadata: { device: "ios" }, // optional
});
```

#### `getSeed(authToken): Promise<SeedItem[]>`

Retrieves all encrypted seeds from `GET /seed`. Returns the complete array (each item has `seed` + optional `metadata`). Returns `[]` when no backup exists.

```ts
const seeds = await client.getSeed("bearer-token");
// [{ seed: '...', metadata: { ... } }, ...]
if (seeds.length > 0) {
  const latest = seeds[seeds.length - 1].seed;
}
```

#### `getEntropy(authToken): Promise<EntropyItem[]>`

Retrieves all encrypted entropies from `GET /entropy`. Returns the complete array (each item has `entropy` + optional `metadata`). Returns `[]` when no backup exists.

```ts
const entropies = await client.getEntropy("bearer-token");
// [{ entropy: '...', metadata: { ... } }, ...]
if (entropies.length > 0) {
  const latest = entropies[entropies.length - 1].entropy;
}
```

#### `deleteBackup(authToken): Promise<void>`

Deletes both the seed and entropy backups from the backend in parallel (`DELETE /seed` + `DELETE /entropy`).

```ts
await client.deleteBackup("bearer-token");
```

---

## Error Handling

All errors are typed. Use `instanceof` checks to handle each case:

```ts
try {
  const seeds = await client.getSeed(authToken);
} catch (err) {
  if (err instanceof BackendAuthError) {
    // HTTP 401 / 403 — token expired or invalid
    // Action: refresh the auth token and retry
    console.error("Auth failed, status:", err.statusCode);
  } else if (err instanceof BackendNetworkError) {
    // Timeout, DNS failure, ECONNREFUSED, etc.
    // Action: show offline banner, retry later
    console.error("Network error:", err.message);
  } else if (err instanceof BackendValidationError) {
    // HTTP 4xx (non-auth) or malformed response shape
    // Action: report bug — do NOT auto-retry
    console.error("Validation error:", err.message, "status:", err.statusCode);
  }
}
```

### Error Class Reference

| Class                    | Trigger                                               | `statusCode`           |
| ------------------------ | ----------------------------------------------------- | ---------------------- |
| `BackendAuthError`       | 401 / 403 response                                    | `401` or `403`         |
| `BackendNetworkError`    | Timeout, DNS, connection refused, 5xx (after retries) | `undefined` (or `5xx`) |
| `BackendValidationError` | 400 / 422 / unexpected response shape                 | `400`, `422`, etc.     |

All errors expose:

- `message: string`
- `statusCode?: number`
- `cause?: unknown` — the original underlying error

---

## Security Contract

- **Encrypted payloads are never modified** — transmitted byte-for-byte as provided.
- **Encrypted payloads are never logged** — neither in this SDK nor by the HTTP retry layer.
- **Response shapes are always validated** with Zod before being returned — malformed responses throw `BackendValidationError` instead of returning `undefined` or crashing silently.
- **HTTP status codes are always validated** — non-2xx responses always raise a typed error.

---

## Backend API Contract

Your backend must implement the following endpoints:

| Method   | Path       | Auth         | Body / Response                                                     |
| -------- | ---------- | ------------ | ------------------------------------------------------------------- |
| `POST`   | `/seed`    | Bearer token | Body: `{ seed: string, metadata?: object }`                         |
| `POST`   | `/entropy` | Bearer token | Body: `{ entropy: string, metadata?: object }`                      |
| `GET`    | `/seed`    | Bearer token | Response: `{ seeds: [{ seed: string, metadata?: object }] }`        |
| `GET`    | `/entropy` | Bearer token | Response: `{ entropies: [{ entropy: string, metadata?: object }] }` |
| `DELETE` | `/seed`    | Bearer token | —                                                                   |
| `DELETE` | `/entropy` | Bearer token | —                                                                   |

---

## Replacing the HTTP Layer

The HTTP implementation is fully abstracted behind `IHttpClient`. Provide your own implementation for custom adapters (e.g., `fetch`, React Native Networking) or for test mocking:

```ts
import type { IHttpClient } from "@tetherto/wdk-backup-remote";

class MyFetchHttpClient implements IHttpClient {
  async request<T>(config: {
    url: string;
    method: "GET" | "POST" | "DELETE";
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
    timeoutMs: number;
  }): Promise<{ status: number; data: T }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: controller.signal,
      });
      const data = (await res.json()) as T;
      return { status: res.status, data };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

const client = new BackendBackupClient(config, new MyFetchHttpClient());
```

---

## Project Structure

```
src/
├── types.ts              # Public interfaces & internal HTTP types
├── errors/
│   └── index.ts          # BackendAuthError, BackendNetworkError, BackendValidationError
├── http/
│   └── httpClient.ts     # IHttpClient interface + AxiosHttpClient (Axios + axios-retry)
├── backendClient.ts      # BackendBackupClient — the main public class
└── index.ts              # Public barrel export
```

---

## Development

```bash
# Install dependencies
npm install

# Type-check (zero errors expected)
npm run typecheck

# Run tests (51 tests)
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Watch mode (development)
npm run dev

# Clean build artifacts
npm run clean
```

---

## Deployment / Publishing

1. **Build the package:**

   ```bash
   npm run build
   ```

2. **Verify the output:**

   ```bash
   ls dist/
   # index.js  index.d.ts  index.js.map  index.d.ts.map
   # backendClient.js  errors/  http/  types.js  ...
   ```

3. **Publish to npm (scoped):**

   ```bash
   # Ensure you are logged in
   npm login

   # First publish (scoped packages default to private)
   npm publish --access public

   # Subsequent releases — bump the version first
   npm version patch   # or minor / major
   npm publish --access public
   ```

4. **Publishing updates to an existing package:**

   ```bash
   # 1. Make your code changes
   # 2. Bump version (choose one based on semver):
   npm version patch   # 0.1.0 → 0.1.1 (bug fixes)
   npm version minor   # 0.1.0 → 0.2.0 (new features, backward compatible)
   npm version major   # 0.1.0 → 1.0.0 (breaking changes)

   # 3. Build and publish
   npm run build
   npm publish --access public
   ```

   Consumers using `^0.1.0` will receive patch/minor updates automatically on `npm install`.

5. **Using in a monorepo (local linking):**
   ```bash
   # From the wallet-app repo
   npm install ../wallet-backup-backend
   # or with workspaces / turborepo — reference the package by name
   ```

---

## Dependencies

| Package       | Version | Purpose                                                     |
| ------------- | ------- | ----------------------------------------------------------- |
| `axios`       | `^1.7`  | Cross-platform HTTP client (Node, Web, RN — no native APIs) |
| `axios-retry` | `^4`    | Exponential-backoff retry on network errors and 5xx         |
| `zod`         | `^3`    | Runtime response-shape validation                           |

---

## License

Apache-2.0
