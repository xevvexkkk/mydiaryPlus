import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Send cookies
});

// CSRF token handling: read XSRF-TOKEN cookie and set header for state-changing requests
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config) => {
  // Attach CSRF token for state-changing methods
  if (config.method && !['get', 'head', 'options'].includes(config.method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken && config.headers) {
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
