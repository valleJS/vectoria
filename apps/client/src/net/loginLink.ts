/** Email + code from a login link (`/?email=…&code=…`), removed from the address bar. */
export interface LoginLink {
  email: string;
  code: string;
}

export function takeLoginLink(): LoginLink | null {
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email');
  const code = params.get('code');
  if (!email || !code) return null;
  params.delete('email');
  params.delete('code');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  return { email, code };
}
