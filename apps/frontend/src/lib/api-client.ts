import { buildWalletAuthHeaders } from './wallet-auth';

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  '';

export function buildApiUrl(path: string) {
  if (!apiBaseUrl) {
    return path;
  }
  const normalizedBase = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export function apiFetch(input: string, init?: RequestInit) {
  return fetch(buildApiUrl(input), init);
}

/**
 * Authenticated API fetch with wallet signature
 * 
 * Automatically builds auth headers using wallet signature
 * and handles JSON body serialization.
 * 
 * @example
 * const response = await authenticatedApiFetch('/api/users/update', {
 *   method: 'POST',
 *   body: { username: 'newname' },
 *   walletAddress: publicKey.toBase58(),
 *   signMessage,
 * });
 */
export async function authenticatedApiFetch(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    walletAddress: string;
    signMessage: (message: Uint8Array) => Promise<Uint8Array>;
    headers?: Record<string, string>;
  }
): Promise<Response> {
  const { method = 'GET', body, walletAddress, signMessage, headers: customHeaders } = options;

  const authHeaders = await buildWalletAuthHeaders({
    walletAddress,
    signMessage,
  });

  const headers: Record<string, string> = {
    ...customHeaders,
    ...authHeaders,
  };

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  return apiFetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Helper to check if response is successful and parse JSON
 */
export async function parseApiResponse<T = unknown>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `API error: ${response.status}`);
  }
  return response.json();
}
