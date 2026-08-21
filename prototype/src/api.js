const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'llm_token'
const OFFICER_KEY = 'llm_officer'
const FETCH_TIMEOUT = 30000

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`)
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getStoredOfficer() {
  try {
    return JSON.parse(localStorage.getItem(OFFICER_KEY))
  } catch {
    return null
  }
}

function storeOfficer(officer) {
  if (officer) localStorage.setItem(OFFICER_KEY, JSON.stringify(officer))
  else localStorage.removeItem(OFFICER_KEY)
}

async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = getToken()
  try {
    const res = await fetchWithTimeout(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (res.status === 401) {
      setToken(null)
      storeOfficer(null)
      throw new ApiError(401, 'Not authenticated')
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
  } catch (err) {
    if (err instanceof ApiError) throw err
    if (err.name === 'AbortError') throw new ApiError(0, 'Request timed out')
    if (err instanceof TypeError && err.message.includes('fetch')) throw new ApiError(0, 'Network error — check connection')
    throw new ApiError(0, err.message || 'Unknown error')
  }
}

export async function loginOfficer(username, password) {
  const data = await api('/auth/login', { method: 'POST', body: { username, password } })
  setToken(data.token)
  storeOfficer(data.officer)
  return data.officer
}

export async function changePassword(currentPassword, newPassword) {
  const officer = await api('/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  })
  storeOfficer(officer)
  return officer
}

export async function logout() {
  setToken(null)
  storeOfficer(null)
}

export function isOnline() {
  return !!getToken()
}
