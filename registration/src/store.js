import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, ApiError } from './api'

export const STORAGE_KEY = 'llm-participants-v1'
const PENDING_KEY = 'llm_reg_pending_ops'

export const sampleParticipants = [
  { id: 'p1', name: 'Abena Boateng', idNumber: 'ID-1001', phone: '0241001001', group: 'Bus A' },
  { id: 'p2', name: 'Kwame Asante', idNumber: 'ID-1002', phone: '0241001002', group: 'Bus A' },
  { id: 'p3', name: 'Yaa Darko', idNumber: 'ID-1003', phone: '0241001003', group: 'Bus B' },
  { id: 'p4', name: 'Kojo Anane', idNumber: 'ID-1004', phone: '0241001004', group: 'Bus B' },
  { id: 'p5', name: 'Akosua Frimpong', idNumber: 'ID-1005', phone: '0241001005', group: 'Bus C' },
  { id: 'p6', name: 'Nana Yaw Sarpong', idNumber: 'ID-1006', phone: '0241001006', group: 'Bus C' },
  { id: 'p7', name: 'Esi Quarshie', idNumber: 'ID-1007', phone: '0241001007', group: 'Bus A' },
  { id: 'p8', name: 'Yaw Mensah', idNumber: 'ID-1008', phone: '0241001008', group: 'Bus B' },
]

export const uid = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const normalize = (p) => ({ id: p.id, name: p.name, idNumber: p.id_number, phone: p.phone, group: p.group })

export function normalizeParticipants(raw) {
  const seen = new Set()
  return raw
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : uid(),
      name: String(r.name ?? r.Name ?? '').trim(),
      idNumber: String(r.idNumber ?? r.id_number ?? r['ID Number'] ?? '').trim(),
      phone: String(r.phone ?? r.Phone ?? '').trim(),
      group: String(r.group ?? r.Group ?? '').trim(),
    }))
    .filter((p) => {
      if (!p.name || seen.has(p.idNumber.toLowerCase())) return false
      if (p.idNumber) seen.add(p.idNumber.toLowerCase())
      return true
    })
}

const loadPending = () => {
  try {
    const ops = JSON.parse(localStorage.getItem(PENDING_KEY))
    return Array.isArray(ops) ? ops : []
  } catch {
    return []
  }
}

const savePending = (ops) => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops))
  } catch {
    /* ignore storage failures */
  }
}

const isClientError = (err) => err instanceof ApiError && err.status >= 400 && err.status < 500

export const useStore = create(
  persist(
    (set, get) => ({
      participants: [],
      online: false,
      pendingCount: 0,

      queueOp: (op) => {
        const ops = [...loadPending(), op]
        savePending(ops)
        set({ pendingCount: ops.length })
      },

      flushQueue: async () => {
        const ops = loadPending()
        if (!ops.length) return
        const remaining = []
        for (const op of ops) {
          try {
            await api(op.path, { method: op.method, body: op.body })
          } catch (err) {
            if (isClientError(err)) {
              // server state is authoritative — drop the stale op
            } else {
              remaining.push(op)
            }
          }
        }
        savePending(remaining)
        set({ pendingCount: remaining.length })
      },

      refresh: async () => {
        try {
          const list = await api('/participants')
          set({ participants: list.map(normalize), online: true })
          return true
        } catch {
          set({ online: false })
          return false
        }
      },

      bootstrap: async () => {
        const ok = await get().refresh()
        if (ok) await get().flushQueue()
        return ok
      },

      add: async (data) => {
        try {
          const p = await api('/participants', {
            method: 'POST',
            body: { name: data.name, id_number: data.idNumber, phone: data.phone, group: data.group },
          })
          const participant = normalize(p)
          set((s) => ({ participants: [...s.participants, participant], online: true }))
          return participant
        } catch (err) {
          if (isClientError(err)) throw err
          const participant = { id: uid(), ...data }
          set((s) => ({ participants: [...s.participants, participant], online: false }))
          get().queueOp({
            path: '/participants',
            method: 'POST',
            body: { name: data.name, id_number: data.idNumber, phone: data.phone, group: data.group },
          })
          return participant
        }
      },

      update: async (id, data) => {
        try {
          await api(`/participants/${id}`, {
            method: 'PUT',
            body: { name: data.name, id_number: data.idNumber, phone: data.phone, group: data.group },
          })
          set((s) => ({ participants: s.participants.map((p) => (p.id === id ? { ...p, ...data } : p)), online: true }))
        } catch (err) {
          if (isClientError(err)) throw err
          set((s) => ({ participants: s.participants.map((p) => (p.id === id ? { ...p, ...data } : p)), online: false }))
          get().queueOp({
            path: `/participants/${id}`,
            method: 'PUT',
            body: { name: data.name, id_number: data.idNumber, phone: data.phone, group: data.group },
          })
        }
      },

      remove: async (id) => {
        try {
          await api(`/participants/${id}`, { method: 'DELETE' })
          set((s) => ({ participants: s.participants.filter((p) => p.id !== id), online: true }))
        } catch (err) {
          if (isClientError(err)) throw err
          set((s) => ({ participants: s.participants.filter((p) => p.id !== id), online: false }))
          get().queueOp({ path: `/participants/${id}`, method: 'DELETE' })
        }
      },

      importAll: async (list) => {
        const normalized = normalizeParticipants(list)
        if (!normalized.length) return normalized
        try {
          await api('/participants/bulk', {
            method: 'POST',
            body: normalized.map(({ name, idNumber, phone, group }) => ({ name, id_number: idNumber, phone, group })),
          })
          await get().refresh()
          return normalized
        } catch (err) {
          if (isClientError(err)) throw err
          set({ participants: normalized, online: false })
          get().queueOp({
            path: '/participants/bulk',
            method: 'POST',
            body: normalized.map(({ name, idNumber, phone, group }) => ({ name, id_number: idNumber, phone, group })),
          })
          return normalized
        }
      },

      loadSample: () =>
        set((s) => {
          const existing = new Set(s.participants.map((p) => p.idNumber))
          const add = sampleParticipants.filter((p) => !existing.has(p.idNumber))
          return { participants: [...s.participants, ...add] }
        }),

      nextIdNumber: () => {
        const max = get().participants.reduce((m, p) => {
          const n = parseInt(String(p.idNumber).replace(/\D/g, ''), 10)
          return Number.isFinite(n) ? Math.max(m, n) : m
        }, 0)
        return `ID-${String(max + 1).padStart(4, '0')}`
      },
    }),
    { name: STORAGE_KEY }
  )
)