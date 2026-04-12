// D-024: Access tokens stored in JS memory only — no localStorage/sessionStorage.
// Page refresh clears the token (intended for dev-auth; OIDC uses silent refresh).

let _token: string | null = null;

export function getToken(): string | null {
  return _token;
}

export function setToken(token: string): void {
  _token = token;
}

export function clearToken(): void {
  _token = null;
}

export function isAuthenticated(): boolean {
  return _token !== null;
}
