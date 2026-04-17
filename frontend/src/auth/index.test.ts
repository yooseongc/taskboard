// ---------------------------------------------------------------------------
// Contract: access / refresh tokens persist in localStorage so that a page
// reload does not force a full re-authentication round-trip. The historical
// D-024 "memory-only" design was reversed (2026-04-17) — the UX cost of
// losing the session on every refresh outweighed the marginal XSS hardening,
// and Keycloak refresh tokens are themselves revocable server-side.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken, clearToken, isAuthenticated } from './index';

const TOKEN_KEY = 'taskboard_token';

describe('auth token storage', () => {
  beforeEach(() => {
    clearToken();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists the token in localStorage under the canonical key', () => {
    setToken('test-jwt-token');
    expect(getToken()).toBe('test-jwt-token');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('test-jwt-token');
  });

  it('does not leak to sessionStorage', () => {
    setToken('test-jwt-token');
    expect(sessionStorage.length).toBe(0);
  });

  it('clearToken removes the token', () => {
    setToken('test-jwt-token');
    clearToken();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns false when no token is stored', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns true after setToken', () => {
    setToken('some-token');
    expect(isAuthenticated()).toBe(true);
  });

  it('getToken returns null when no token is stored', () => {
    expect(getToken()).toBeNull();
  });
});
