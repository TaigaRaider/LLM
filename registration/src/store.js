import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const STORAGE_KEY = 'llm-participants-v1'

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

export const useStore = create(
  persist(
    (set, get) => ({
      participants: [],

      add: (data) => {
        const p = { id: uid(), ...data }
        set((s) => ({ participants: [...s.participants, p] }))
        return p
      },

      update: (id, data) =>
        set((s) => ({
          participants: s.participants.map((p) => (p.id === id ? { ...p, ...data } : p)),
        })),

      remove: (id) => set((s) => ({ participants: s.participants.filter((p) => p.id !== id) })),

      importAll: (list) => set({ participants: normalizeParticipants(list) }),

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
