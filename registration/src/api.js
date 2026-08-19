const API_BASE = import.meta.env.VITE_API_BASE || '/api'
const TOKEN_KEY = 'llm_token'
const OFFICER_KEY = 'llm_officer'

export class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `Request failed (${status})`)
    this.status = status
  }
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

function storeToken(token) {
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
    storeToken(null)
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
}

export async function loginOfficer(username, password) {
  const data = await api('/auth/login', { method: 'POST', body: { username, password } })
  storeToken(data.token)
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
  storeToken(null)
  storeOfficer(null)
}