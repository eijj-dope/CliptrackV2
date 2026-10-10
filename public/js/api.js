// Small helper for talking to the Laravel backend (all routes live under /api).
//   const services = await api.get('/services');
//   await api.post('/appointments/public', { name, contact, serviceId, staffId, date, time });
// It sends Laravel's CSRF token with every change. Laravel issues a NEW token when someone logs in,
// so this helper updates the token from the server and, if a request is ever rejected (419),
// fetches a fresh token once and tries again.
const api = {
  setToken(token) {
    const tag = document.querySelector('meta[name="csrf-token"]');
    if (tag && token) tag.setAttribute('content', token);
  },

  async request(method, url, body, retried) {
    const tag = document.querySelector('meta[name="csrf-token"]');
    const headers = { 'Accept': 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (tag) headers['X-CSRF-TOKEN'] = tag.content;

    const res = await fetch('/api' + url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));

    // Rejected because the token is out of date: get a fresh one and try once more.
    if (res.status === 419 && !retried) {
      try {
        const t = await fetch('/api/csrf', { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' }).then((r) => r.json());
        api.setToken(t.csrfToken);
      } catch (e) { /* the retry below will report the problem */ }
      return api.request(method, url, body, true);
    }

    if (!res.ok) {
      const err = new Error(
        res.status === 419
          ? 'Your page expired. Refresh the page and try again.'
          : (data && (data.error || data.message)) || 'Request failed'
      );
      err.status = res.status;
      throw err;
    }

    // Login and /auth/me send the current token along with the user.
    if (data && data.csrfToken) api.setToken(data.csrfToken);
    return data;
  },

  get: (url) => api.request('GET', url),
  post: (url, body) => api.request('POST', url, body),
  put: (url, body) => api.request('PUT', url, body),
  patch: (url, body) => api.request('PATCH', url, body),
  del: (url) => api.request('DELETE', url)
};
