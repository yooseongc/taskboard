// Proactive session-extension scheduler.
//
// The reactive refresh in ./refresh.ts only fires on a 401, which means the
// user sees (and the backend logs) an authentication failure as the trigger
// for every token renewal. That's jarring UX: a quiet 5–15 minute break
// silently expires the token and the next click is an error.
//
// This module schedules a `refresh_token` call *before* the access token
// reaches its `exp`. We decode the JWT's `exp` claim client-side (no
// verification needed — we're only asking "when should I kick the tires"),
// set a timeout for `exp - HEADROOM_MS`, refresh, then reschedule from the
// fresh token. The result: as long as the Keycloak SSO idle window allows,
// the user's session is extended invisibly.
//
// On refresh failure we surface a toast and run the app's forceLogout path.
// Dev-auth tokens have no refresh endpoint, so we fall back to replaying
// the last-known dev email against `/api/dev/login` — enough to keep a
// dev tester alive past the 1h HMAC expiry without a manual re-auth.

import { getToken, clearToken } from './index';
import { getRefreshToken, tryRefreshToken, clearRefreshToken } from './refresh';

/** Refresh this many milliseconds *before* the access token's exp so we
 *  never race a real 401. 90s covers round-trip + Keycloak backend latency. */
const HEADROOM_MS = 90_000;

/** Absolute floor — refresh at least this often even when a token claims a
 *  long lifespan. Guards against a misconfigured Keycloak realm shipping a
 *  token with an impossible `exp` (seen in past deployments). */
const MAX_INTERVAL_MS = 30 * 60 * 1000; // 30 min

/** Minimum delay between refreshes when exp is near / already past. Keeps
 *  a runaway loop from hammering the token endpoint if clocks drift. */
const MIN_INTERVAL_MS = 5_000;

const DEV_EMAIL_KEY = 'taskboard_dev_email';
const DEV_LOGIN_PATH = '/api/dev/login';

let timer: ReturnType<typeof setTimeout> | null = null;
/** Set at start() and called on failure; lets the store/toast wiring inject
 *  its own shutdown behavior without this module importing from stores. */
let onFailure: (() => void) | null = null;

/** Stash the email a dev user used to mint their current token so we can
 *  replay it when the HMAC token is about to expire. Safe because dev mode
 *  is already non-production. */
export function rememberDevEmail(email: string): void {
  try {
    localStorage.setItem(DEV_EMAIL_KEY, email);
  } catch {
    // localStorage disabled — silent fail, dev refresh will just stop.
  }
}

export function forgetDevEmail(): void {
  try {
    localStorage.removeItem(DEV_EMAIL_KEY);
  } catch {
    /* noop */
  }
}

/** Start or restart the scheduler. Safe to call many times — any previous
 *  timer is cleared. `onFail` fires when a refresh path is exhausted
 *  (both OIDC refresh and dev-replay failed). */
export function startSessionScheduler(onFail: () => void): void {
  onFailure = onFail;
  scheduleNext();
}

export function stopSessionScheduler(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  onFailure = null;
}

function scheduleNext(): void {
  if (timer) clearTimeout(timer);
  const token = getToken();
  if (!token) return;

  const expMs = readExpMs(token);
  if (expMs == null) {
    // Token without a parseable exp — don't try to refresh it, but also
    // don't crash. Next reactive 401 will clean up if this was garbage.
    return;
  }

  const delay = clamp(
    expMs - Date.now() - HEADROOM_MS,
    MIN_INTERVAL_MS,
    MAX_INTERVAL_MS,
  );
  timer = setTimeout(runRefresh, delay);
}

async function runRefresh(): Promise<void> {
  // OIDC path: standard refresh_token grant.
  if (getRefreshToken()) {
    const ok = await tryRefreshToken();
    if (ok) {
      scheduleNext();
      return;
    }
    // OIDC refresh failed — tryRefreshToken already cleared the refresh
    // token. Fall through to dev fallback just in case someone mixed the
    // two flows; otherwise it's a clean session-expired signal.
  }

  // Dev-auth fallback: re-mint an HS256 token with the saved email.
  const devEmail = safeLocalStorageRead(DEV_EMAIL_KEY);
  if (devEmail) {
    const ok = await tryDevRelogin(devEmail);
    if (ok) {
      scheduleNext();
      return;
    }
  }

  // Nothing more we can do — tell the app to log the user out.
  clearToken();
  clearRefreshToken();
  onFailure?.();
}

async function tryDevRelogin(email: string): Promise<boolean> {
  try {
    const baseUrl = import.meta.env.VITE_BACKEND_URL ?? '';
    const res = await fetch(`${baseUrl}${DEV_LOGIN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_email: email }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { token?: string };
    if (!data.token) return false;
    // setToken lives in ./index; re-importing here avoids a circular edge
    // between this module and refresh.ts.
    const { setToken } = await import('./index');
    setToken(data.token);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// JWT exp reader — parses the payload without verifying the signature. This
// is safe because we're only scheduling (the backend still verifies every
// real request). We deliberately avoid a dependency on jose/jwt-decode.
// ---------------------------------------------------------------------------

function readExpMs(token: string): number | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    // Base64-URL → Base64 → JSON
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

function clamp(ms: number, lo: number, hi: number): number {
  if (Number.isNaN(ms)) return lo;
  return Math.max(lo, Math.min(hi, ms));
}

function safeLocalStorageRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
