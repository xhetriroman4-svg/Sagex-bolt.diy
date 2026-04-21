/**
 * API Testing Tool
 *
 * Built-in HTTP client for testing endpoints within the WebContainer.
 * Tracks request history, manages environments/variables,
 * and provides API usage analytics.
 */

import { atom, map, type MapStore } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ApiTester');

// HTTP methods
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

// Request header
export interface RequestHeader {
  key: string;
  value: string;
  enabled: boolean;
}

// Request body type
export type BodyType = 'none' | 'json' | 'form' | 'raw' | 'xml';

// API request definition
export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: RequestHeader[];
  bodyType: BodyType;
  body: string;
  queryParams: Array<{ key: string; value: string; enabled: boolean }>;
  variables: Record<string, string>; // Template variables
  collectionId?: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
}

// API response
export interface ApiResponse {
  id: string;
  requestId: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  bodySize: number;
  responseTime: number; // ms
  timestamp: number;
  error?: string;
}

// Request history entry
export interface HistoryEntry {
  request: ApiRequest;
  response: ApiResponse;
}

// Environment for variables
export interface ApiEnvironment {
  id: string;
  name: string;
  variables: Record<string, string>;
  isActive: boolean;
}

// Request collection
export interface RequestCollection {
  id: string;
  name: string;
  description: string;
  requestIds: string[];
  createdAt: number;
}

// API usage tracking
export interface ApiUsageRecord {
  timestamp: number;
  method: HttpMethod;
  url: string;
  status: number;
  responseTime: number;
  bodySize: number;
  provider?: string;
  tokens?: number;
}

// Stores
export const apiRequests: MapStore<Record<string, ApiRequest>> = map({});
export const apiResponses: MapStore<Record<string, ApiResponse>> = map({});
export const requestHistory: MapStore<Record<string, HistoryEntry>> = map({});
export const apiEnvironments: MapStore<Record<string, ApiEnvironment>> = map({});
export const requestCollections: MapStore<Record<string, RequestCollection>> = map({});

export const activeRequestId = atom<string | null>(null);
export const activeResponseId = atom<string | null>(null);
export const isSendingRequest = atom<boolean>(false);
export const showHistory = atom<boolean>(true);
export const historyFilter = atom<string>('');
export const activeEnvironmentId = atom<string | null>(null);
export const apiUsageHistory: MapStore<Record<string, ApiUsageRecord>> = map({});

// Generate unique ID
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
}

// Resolve template variables in text
function resolveVariables(text: string, variables: Record<string, string>): string {
  let resolved = text;

  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value);
  }

  return resolved;
}

/**
 * Create a new API request
 */
export function createRequest(params: Partial<ApiRequest> = {}): ApiRequest {
  const id = generateId('req');

  const request: ApiRequest = {
    id,
    name: params.name || 'New Request',
    method: params.method || 'GET',
    url: params.url || '',
    headers: params.headers || [
      { key: 'Content-Type', value: 'application/json', enabled: true },
      { key: 'Accept', value: 'application/json', enabled: true },
    ],
    bodyType: params.bodyType || 'none',
    body: params.body || '',
    queryParams: params.queryParams || [],
    variables: params.variables || {},
    collectionId: params.collectionId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: params.tags || [],
  };

  apiRequests.setKey(id, request);
  activeRequestId.set(id);
  activeResponseId.set(null);

  logger.info(`Created request: ${id} - ${request.name}`);

  return request;
}

/**
 * Update an existing request
 */
export function updateRequest(id: string, updates: Partial<ApiRequest>): boolean {
  const existing = apiRequests.get()[id];

  if (!existing) {
    return false;
  }

  const updated = { ...existing, ...updates, updatedAt: Date.now() };
  apiRequests.setKey(id, updated);

  return true;
}

/**
 * Delete a request
 */
export function deleteRequest(id: string): boolean {
  const existing = apiRequests.get()[id];

  if (!existing) {
    return false;
  }

  const updated = { ...apiRequests.get() };
  delete updated[id];
  apiRequests.set(updated);

  if (activeRequestId.get() === id) {
    activeRequestId.set(null);
  }

  if (activeResponseId.get()) {
    // Check if there's a response for this request
    const responses = apiResponses.get();

    for (const [respId, resp] of Object.entries(responses)) {
      if (resp.requestId === id) {
        const updatedResponses = { ...responses };
        delete updatedResponses[respId];
        apiResponses.set(updatedResponses);
      }
    }
  }

  logger.info(`Deleted request: ${id}`);

  return true;
}

/**
 * Send an API request (through WebContainer preview proxy or fetch)
 */
export async function sendRequest(
  requestId: string,
  executeInContext?: (
    method: string,
    url: string,
    options: RequestInit,
  ) => Promise<{ status: number; headers: Headers; body: string; time: number }>,
): Promise<ApiResponse | null> {
  const request = apiRequests.get()[requestId];

  if (!request) {
    logger.error(`Request not found: ${requestId}`);
    return null;
  }

  isSendingRequest.set(true);

  // Resolve variables
  const env = apiEnvironments.get();
  const activeEnv = activeEnvironmentId.get() ? env[activeEnvironmentId.get()!] : null;
  const variables = { ...request.variables, ...(activeEnv?.variables || {}) };

  let resolvedUrl = resolveVariables(request.url, variables);

  // Add query params
  if (request.queryParams.length > 0) {
    const params = new URLSearchParams();

    for (const qp of request.queryParams) {
      if (qp.enabled && qp.key) {
        params.set(qp.key, resolveVariables(qp.value, variables));
      }
    }

    const paramStr = params.toString();

    if (paramStr) {
      resolvedUrl += (resolvedUrl.includes('?') ? '&' : '?') + paramStr;
    }
  }

  // Build headers
  const headers: Record<string, string> = {};

  for (const header of request.headers) {
    if (header.enabled && header.key) {
      headers[header.key] = resolveVariables(header.value, variables);
    }
  }

  // Build body
  let body: string | undefined;

  if (request.bodyType !== 'none' && request.method !== 'GET' && request.method !== 'HEAD') {
    body = resolveVariables(request.body, variables);
  }

  const startTime = Date.now();

  try {
    let status = 0;
    const responseHeaders: Record<string, string> = {};
    let responseBody = '';

    if (executeInContext) {
      // Execute through WebContainer context
      const result = await executeInContext(request.method, resolvedUrl, {
        headers,
        body,
      });

      status = result.status;
      result.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      responseBody = result.body;
    } else {
      // Direct fetch (for external URLs)
      const fetchOptions: RequestInit = {
        method: request.method,
        headers,
        body,
      };

      const response = await fetch(resolvedUrl, fetchOptions);
      status = response.status;
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      responseBody = await response.text();
    }

    const responseTime = Date.now() - startTime;

    const response: ApiResponse = {
      id: generateId('resp'),
      requestId,
      status,
      statusText: getStatusText(status),
      headers: responseHeaders,
      body: responseBody,
      bodySize: responseBody.length,
      responseTime,
      timestamp: Date.now(),
    };

    apiResponses.setKey(response.id, response);
    activeResponseId.set(response.id);

    // Add to history
    const historyId = response.id;
    requestHistory.setKey(historyId, { request, response });

    // Track usage
    const usageRecord: ApiUsageRecord = {
      timestamp: Date.now(),
      method: request.method,
      url: resolvedUrl,
      status,
      responseTime,
      bodySize: responseBody.length,
    };

    apiUsageHistory.setKey(generateId('usage'), usageRecord);

    // Keep history under 1000 entries
    const historyKeys = Object.keys(requestHistory.get());

    if (historyKeys.length > 1000) {
      const toRemove = historyKeys.slice(0, historyKeys.length - 1000);

      for (const key of toRemove) {
        requestHistory.setKey(key, undefined as any);
      }
    }

    logger.info(`Request sent: ${request.method} ${resolvedUrl} → ${status} (${responseTime}ms)`);

    return response;
  } catch (error: any) {
    const responseTime = Date.now() - startTime;

    const response: ApiResponse = {
      id: generateId('resp'),
      requestId,
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      bodySize: 0,
      responseTime,
      timestamp: Date.now(),
      error: error.message || 'Request failed',
    };

    apiResponses.setKey(response.id, response);
    activeResponseId.set(response.id);
    requestHistory.setKey(response.id, { request, response });

    logger.error(`Request failed: ${request.method} ${resolvedUrl} - ${error.message}`);

    return response;
  } finally {
    isSendingRequest.set(false);
  }
}

/**
 * Get status text for HTTP status code
 */
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    301: 'Moved Permanently',
    302: 'Found',
    304: 'Not Modified',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return statusTexts[status] || 'Unknown';
}

// ---- Environments ----

/**
 * Create an environment
 */
export function createEnvironment(name: string, variables: Record<string, string> = {}): ApiEnvironment {
  const id = generateId('env');

  // Deactivate all existing
  const envs = apiEnvironments.get();

  for (const [envId, env] of Object.entries(envs)) {
    apiEnvironments.setKey(envId, { ...env, isActive: false });
  }

  const environment: ApiEnvironment = {
    id,
    name,
    variables,
    isActive: true,
  };

  apiEnvironments.setKey(id, environment);
  activeEnvironmentId.set(id);

  return environment;
}

/**
 * Switch active environment
 */
export function switchEnvironment(envId: string): void {
  const envs = apiEnvironments.get();

  for (const [id, env] of Object.entries(envs)) {
    apiEnvironments.setKey(id, { ...env, isActive: id === envId });
  }

  activeEnvironmentId.set(envId);
}

/**
 * Delete an environment
 */
export function deleteEnvironment(envId: string): void {
  const updated = { ...apiEnvironments.get() };
  delete updated[envId];
  apiEnvironments.set(updated);

  if (activeEnvironmentId.get() === envId) {
    activeEnvironmentId.set(null);
  }
}

// ---- Collections ----

/**
 * Create a request collection
 */
export function createCollection(name: string, description: string = ''): RequestCollection {
  const id = generateId('col');

  const collection: RequestCollection = {
    id,
    name,
    description,
    requestIds: [],
    createdAt: Date.now(),
  };

  requestCollections.setKey(id, collection);

  return collection;
}

/**
 * Add request to collection
 */
export function addRequestToCollection(requestId: string, collectionId: string): void {
  const collection = requestCollections.get()[collectionId];

  if (!collection) {
    return;
  }

  if (!collection.requestIds.includes(requestId)) {
    requestCollections.setKey(collectionId, {
      ...collection,
      requestIds: [...collection.requestIds, requestId],
    });
  }
}

/**
 * Remove request from collection
 */
export function removeRequestFromCollection(requestId: string, collectionId: string): void {
  const collection = requestCollections.get()[collectionId];

  if (!collection) {
    return;
  }

  requestCollections.setKey(collectionId, {
    ...collection,
    requestIds: collection.requestIds.filter((id) => id !== requestId),
  });
}

// ---- History & Analytics ----

/**
 * Get filtered history
 */
export function getFilteredHistory(): HistoryEntry[] {
  const all = Object.values(requestHistory.get());
  const filter = historyFilter.get().toLowerCase();

  return all
    .filter((entry) => {
      if (!filter) {
        return true;
      }

      return (
        entry.request.name.toLowerCase().includes(filter) ||
        entry.request.url.toLowerCase().includes(filter) ||
        entry.request.method.toLowerCase().includes(filter) ||
        String(entry.response.status).includes(filter)
      );
    })
    .sort((a, b) => b.response.timestamp - a.response.timestamp);
}

/**
 * Get API usage analytics
 */
export function getApiUsageAnalytics(): {
  totalRequests: number;
  averageResponseTime: number;
  successRate: number;
  errorRate: number;
  byMethod: Record<string, number>;
  byStatusRange: Record<string, number>;
  totalDataTransferred: number;
  tokensUsed: number;
} {
  const history = Object.values(requestHistory.get());
  const totalRequests = history.length;

  if (totalRequests === 0) {
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      successRate: 0,
      errorRate: 0,
      byMethod: {},
      byStatusRange: {},
      totalDataTransferred: 0,
      tokensUsed: 0,
    };
  }

  let totalResponseTime = 0;
  let successCount = 0;
  let totalData = 0;
  const byMethod: Record<string, number> = {};
  const byStatusRange: Record<string, number> = {};
  let totalTokens = 0;

  for (const entry of history) {
    totalResponseTime += entry.response.responseTime;
    totalData += entry.response.bodySize;

    byMethod[entry.request.method] = (byMethod[entry.request.method] || 0) + 1;

    const statusRange = getStatusRange(entry.response.status);
    byStatusRange[statusRange] = (byStatusRange[statusRange] || 0) + 1;

    if (entry.response.status >= 200 && entry.response.status < 400) {
      successCount++;
    }

    // Extract token usage from response headers if present
    const usage = entry.response.headers['x-tokens-used'] || entry.response.headers['x-token-usage'];

    if (usage) {
      totalTokens += parseInt(usage, 10) || 0;
    }
  }

  return {
    totalRequests,
    averageResponseTime: Math.round(totalResponseTime / totalRequests),
    successRate: Math.round((successCount / totalRequests) * 100),
    errorRate: Math.round(((totalRequests - successCount) / totalRequests) * 100),
    byMethod,
    byStatusRange,
    totalDataTransferred: totalData,
    tokensUsed: totalTokens,
  };
}

function getStatusRange(status: number): string {
  if (status === 0) {
    return 'Error';
  }

  if (status < 200) {
    return '1xx Info';
  }

  if (status < 300) {
    return '2xx Success';
  }

  if (status < 400) {
    return '3xx Redirect';
  }

  if (status < 500) {
    return '4xx Client Error';
  }

  return '5xx Server Error';
}

/**
 * Duplicate a request
 */
export function duplicateRequest(requestId: string): ApiRequest | null {
  const source = apiRequests.get()[requestId];

  if (!source) {
    return null;
  }

  return createRequest({
    name: `${source.name} (copy)`,
    method: source.method,
    url: source.url,
    headers: source.headers.map((h) => ({ ...h })),
    bodyType: source.bodyType,
    body: source.body,
    queryParams: source.queryParams.map((q) => ({ ...q })),
    variables: { ...source.variables },
    tags: [...source.tags],
  });
}

/**
 * Clear all history
 */
export function clearHistory(): void {
  requestHistory.set({});
  logger.info('API request history cleared');
}

/**
 * Import requests from OpenAPI/Swagger spec (simplified)
 */
export function importFromOpenApi(spec: any): ApiRequest[] {
  const imported: ApiRequest[] = [];

  if (!spec?.paths) {
    return imported;
  }

  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, detailsRaw] of Object.entries(methods as any)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        continue;
      }

      const details = detailsRaw as any;
      const request = createRequest({
        name: details.summary || `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase() as HttpMethod,
        url: `${spec.servers?.[0]?.url || ''}${path}`,
        bodyType: ['post', 'put', 'patch'].includes(method) ? 'json' : 'none',
        body: details.requestBody?.content?.['application/json']?.example
          ? JSON.stringify(details.requestBody.content['application/json'].example, null, 2)
          : '',
        tags: (Array.isArray(details.tags) ? details.tags : []) as string[],
      });

      imported.push(request);
    }
  }

  logger.info(`Imported ${imported.length} requests from OpenAPI spec`);

  return imported;
}

/**
 * Initialize API tester
 */
export async function initApiTester(): Promise<void> {
  // Create default environment if none exists
  const envs = apiEnvironments.get();

  if (Object.keys(envs).length === 0) {
    createEnvironment('Default', {
      base_url: 'http://localhost:5173',
    });
  }
}
