const configured = import.meta.env.VITE_API_BASE_URL;

/** Empty in dev (Vite proxy); override via VITE_API_BASE_URL in production. */
export const API_BASE = configured ?? (import.meta.env.DEV ? '' : 'http://localhost:5000');

export function apiUrl(path) {
  const base = API_BASE.replace(/\/$/, '');
  const route = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${route}` : route;
}
