// Access-token storage in localStorage for session persistence across reloads.
// Refresh flow lives in ./refresh.ts; on 401 the apiFetch wrapper calls
// tryRefreshToken() and retries once. See doc/API_CONTRACT.md §4.5.

const TOKEN_KEY = 'taskboard_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return localStorage.getItem(TOKEN_KEY) !== null;
}
