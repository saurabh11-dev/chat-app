/**
 * Lightweight History-API route helpers for GeoChat.
 * Supports /login, /, and /discover with auth-guard resolution.
 */

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DISCOVER: '/discover',
};

/**
 * Normalizes a browser pathname into a known GeoChat route.
 *
 * @param {string} pathname
 * @returns {'/' | '/login' | '/discover'}
 */
export function normalizeRoute(pathname) {
  if (!pathname || typeof pathname !== 'string') {
    return ROUTES.HOME;
  }
  const clean = pathname.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  if (clean === ROUTES.LOGIN) return ROUTES.LOGIN;
  if (clean === ROUTES.DISCOVER) return ROUTES.DISCOVER;
  return ROUTES.HOME;
}

/**
 * Resolves the target route enforcing authentication boundaries:
 * - Unauthenticated users are always directed to /login
 * - Authenticated users visiting /login are directed to /
 *
 * @param {string} pathname
 * @param {boolean} isAuthenticated
 * @returns {'/' | '/login' | '/discover'}
 */
export function resolveAuthorizedRoute(pathname, isAuthenticated) {
  if (!isAuthenticated) {
    return ROUTES.LOGIN;
  }
  const normalized = normalizeRoute(pathname);
  if (normalized === ROUTES.LOGIN) {
    return ROUTES.HOME;
  }
  return normalized;
}
