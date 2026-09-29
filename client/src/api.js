// api.js — server-first axios client with automatic offline
// fallback. On static hosting (GitHub Pages) there is no /api, so
// the first dead-server response flips this tab to the browser
// backend (localBackend.js: same routes, browser storage) and all
// later calls go straight there. Genuine HTTP errors from a live
// server are never masked: only network failures and non-JSON
// 404s (static hosts) trigger the switch.
import axios from 'axios';
import { isLocalMode, markLocal, routeLocal } from './lib/localBackend';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('studyapp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function isDeadServer(err) {
  if (!err) return false;
  // No response at all: refused connection, DNS, offline.
  if (!err.response) return true;
  // Static hosts answer unknown /api/* paths with an HTML 404 page.
  // A real API answers JSON (even for errors), so HTML means no API.
  if (err.response.status === 404) {
    try {
      const ct = String(
        err.response.headers
          ? err.response.headers['content-type'] || ''
          : ''
      );
      if (!/json/i.test(ct)) return true;
      if (typeof err.response.data === 'string') return true;
    } catch {
      return true;
    }
  }
  return false;
}

function toAxiosError(e) {
  const err = new Error((e && e.data && e.data.error) || (e && e.message) || 'Request failed');
  err.response = {
    status: (e && e.status) || 500,
    data: (e && e.data) || { error: err.message },
  };
  return err;
}

function toAxiosResponse(body, config) {
  let data = body;
  try {
    if (config && config.responseType === 'blob' && typeof body === 'string') {
      data = new Blob([body], { type: 'text/csv' });
    }
  } catch {
    /* return raw */
  }
  return { data, status: 200, statusText: 'OK', headers: {}, config };
}

async function send(method, url, payload, config) {
  const cfg = config || {};
  if (isLocalMode()) {
    try {
      const body = await routeLocal(method, url, payload, {
        headers: (cfg && cfg.headers) || axiosHeaders(),
      });
      return toAxiosResponse(body, cfg);
    } catch (e) {
      throw toAxiosError(e);
    }
  }
  try {
    if (method === 'get' || method === 'delete') {
      return await api.request({ method, url, ...cfg });
    }
    if (method === 'put' || method === 'patch' || method === 'post') {
      return await api.request({ method, url, data: payload, ...cfg });
    }
    return await api.request({ method, url, ...cfg });
  } catch (err) {
    if (!isDeadServer(err)) throw err;
    markLocal();
    try {
      const body = await routeLocal(method, url, payload, {
        headers: (cfg && cfg.headers) || axiosHeaders(),
      });
      return toAxiosResponse(body, cfg);
    } catch (e) {
      throw toAxiosError(e);
    }
  }
}

function axiosHeaders() {
  const headers = {};
  try {
    const token = localStorage.getItem('studyapp_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    /* storage blocked */
  }
  return headers;
}

export function localMode() {
  return isLocalMode();
}

export default {
  get: (url, config) => send('get', url, undefined, config),
  post: (url, data, config) => send('post', url, data, config),
  put: (url, data, config) => send('put', url, data, config),
  patch: (url, data, config) => send('patch', url, data, config),
  delete: (url, config) => {
    const data = config && config.data;
    return send('delete', url, data, config);
  },
  request: (config) =>
    send((config && config.method) || 'get', config && config.url, config && config.data, config),
};
