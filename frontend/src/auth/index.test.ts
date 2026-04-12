// ---------------------------------------------------------------------------
// Regression guard: Finding #1 — Token MUST NOT be stored in localStorage.
// D-024: Access tokens stored in JS memory only.
// ---------------------------------------------------------------------------
import { describe, it, expect, beforeEach } from 'vitest';
import { getToken, setToken, clearToken, isAuthenticated } from './index';

describe('auth token storage (D-024 regression guard)', () => {
  beforeEach(() => {
    clearToken();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores token in JS memory, not localStorage', () => {
    setToken('test-jwt-token');
    // Token must be retrievable via getToken()
    expect(getToken()).toBe('test-jwt-token');
    // But must NOT be in localStorage (Finding #1)
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    // Check all localStorage keys
    expect(localStorage.length).toBe(0);
  });

  it('stores token in JS memory, not sessionStorage', () => {
    setToken('test-jwt-token');
    expect(sessionStorage.length).toBe(0);
  });

  it('clearToken removes the token from memory', () => {
    setToken('test-jwt-token');
    clearToken();
    expect(getToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns false initially', () => {
    expect(isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns true after setToken', () => {
    setToken('some-token');
    expect(isAuthenticated()).toBe(true);
  });

  it('getToken returns null initially', () => {
    expect(getToken()).toBeNull();
  });
});
