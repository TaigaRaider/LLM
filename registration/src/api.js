const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'llm_token'
const DEFAULT_PASSWORD = 'officer123'

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`)
    this.status = status
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    await loginOfficer('ama')
    return api(path, { method, body })
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      if (typeof j.detail === 'string') detail = j.detail
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return null
  return res.json()
}

export async function loginOfficer(username) {
  const data = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: DEFAULT_PASSWORD }),
  })
  if (!data.ok) throw new ApiError(data.status, 'Backend unreachable')
  const json = await data.json()
  localStorage.setItem(TOKEN_KEY, json.token)
  return json.officer
}