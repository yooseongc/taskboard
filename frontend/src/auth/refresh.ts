// Token refresh logic. Supports OIDC refresh_token flow.
// Dev-auth tokens have no refresh mechanism — returns false.

import { getToken, setToken } from './index';

const REFRESH_KEY = 'taskboard_refresh_token';
const KC_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8180';
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'taskboard';
const KC_CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'taskboard-frontend';
const TOKEN_URL = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`;

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_KEY, token);
}

export function clearRefreshToken(): void {
  localStorage.removeItem(REFRESH_KEY);
}

/** Attempt to refresh the access token using a stored refresh_token.
 *  Returns true if refresh succeeded and new access_token is stored. */
export async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: KC_CLIENT_ID,
      refresh_token: refreshToken,
    });

    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      // Refresh token expired or invalid — clear it
      clearRefreshToken();
      return false;
    }

    const data = await res.json();
    setToken(data.access_token);
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token);
    }
    return true;
  } catch {
    clearRefreshToken();
    return false;
  }
}
