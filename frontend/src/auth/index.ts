// Token storage in localStorage for session persistence across page navigations.
// OIDC refresh is handled by Keycloak silent refresh or re-login on expiry.

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
