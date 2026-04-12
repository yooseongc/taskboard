// OIDC Authorization Code Flow with PKCE for Keycloak public client.

const KC_URL = import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8180';
const KC_REALM = import.meta.env.VITE_KEYCLOAK_REALM ?? 'taskboard';
const KC_CLIENT_ID =
  import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'taskboard-frontend';

const AUTHORIZE_URL = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/auth`;
const TOKEN_URL = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/token`;
const LOGOUT_URL = `${KC_URL}/realms/${KC_REALM}/protocol/openid-connect/logout`;

// --- PKCE helpers ---

function generateRandom(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- Public API ---

/**
 * Redirect the browser to Keycloak's authorization endpoint.
 */
export async function startOidcLogin(): Promise<void> {
  const state = generateRandom(16);
  const codeVerifier = generateRandom(32);
  const codeChallenge = base64UrlEncode(await sha256(codeVerifier));

  // Persist for callback verification
  sessionStorage.setItem('oidc_state', state);
  sessionStorage.setItem('oidc_code_verifier', codeVerifier);

  const redirectUri = `${window.location.origin}/login/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: KC_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens. Returns the access_token.
 */
export async function handleOidcCallback(
  code: string,
  state: string,
): Promise<{ access_token: string; refresh_token: string }> {
  const savedState = sessionStorage.getItem('oidc_state');
  const codeVerifier = sessionStorage.getItem('oidc_code_verifier');

  if (!savedState || savedState !== state) {
    throw new Error('Invalid OIDC state parameter');
  }
  if (!codeVerifier) {
    throw new Error('Missing PKCE code verifier');
  }

  // Clean up
  sessionStorage.removeItem('oidc_state');
  sessionStorage.removeItem('oidc_code_verifier');

  const redirectUri = `${window.location.origin}/login/callback`;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: KC_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
}

/**
 * Build the Keycloak logout URL.
 */
export function getLogoutUrl(): string {
  const redirectUri = `${window.location.origin}/login`;
  const params = new URLSearchParams({
    client_id: KC_CLIENT_ID,
    post_logout_redirect_uri: redirectUri,
  });
  return `${LOGOUT_URL}?${params.toString()}`;
}
