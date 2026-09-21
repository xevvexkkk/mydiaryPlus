import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send cookies
});

// CSRF token handling: read XSRF-TOKEN cookie and set header for state-changing requests
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

let csrfRefreshPromise: Promise<string> | null = null;

async function ensureCsrfToken(): Promise<string> {
  const existingToken = getCsrfToken();
  if (existingToken) return existingToken;

  if (!csrfRefreshPromise) {
    csrfRefreshPromise = axios
      .get('/api/csrf-token', {
        withCredentials: true,
        headers: { 'Cache-Control': 'no-cache' },
      })
      .then(() => {
        const refreshedToken = getCsrfToken();
        if (!refreshedToken) throw new Error('CSRF token cookie was not set');
        return refreshedToken;
      })
      .finally(() => {
        csrfRefreshPromise = null;
      });
  }

  return csrfRefreshPromise;
}

api.interceptors.request.use(async (config) => {
  // Attach CSRF token for state-changing methods
  if (config.method && !['get', 'head', 'options'].includes(config.method)) {
    const csrfToken = await ensureCsrfToken();
    if (config.headers) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
  }
  return config;
});

// Handle 401 by redirecting to login (but not if already there)
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response && error.response.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
