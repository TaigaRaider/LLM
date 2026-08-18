import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { seedOfficers, seedParticipants } from './seed'

const PARTICIPANT_SOURCE_KEY = 'llm-participants-v1'

function readSharedParticipants() {
  try {
    const raw = localStorage.getItem(PARTICIPANT_SOURCE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed) ? parsed : parsed?.state?.participants
    if (Array.isArray(list) && list.length) return list
  } catch {
    /* ignore malformed shared storage */
  }
  return null
}

const writeSharedParticipants = (list) => {
  try {
    const raw = localStorage.getItem(PARTICIPANT_SOURCE_KEY)
    const base = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    if (!base.state || typeof base.state !== 'object') base.state = {}
    base.state.participants = list
    localStorage.setItem(PARTICIPANT_SOURCE_KEY, JSON.stringify(base))
  } catch {
    /* ignore storage failures */
  }
}

const initialParticipants = readSharedParticipants() ?? seedParticipants

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const useStore = create(
  persist(
    (set, get) => ({
      officer: seedOfficers[0],
      officers: seedOfficers,
      participants: initialParticipants,
      bags: [],
      vehicle: { code: 'TRUCK-01', status: 'AT_ORIGIN' },
      nextTagNumber: 1,
      toast: null,

      setOfficer: (officer) => set({ officer }),
      showToast: (msg) => {
        set({ toast: msg })
        setTimeout(() => set({ toast: null }), 3500)
      },

      reloadParticipants: () => {
        const participants = readSharedParticipants() ?? seedParticipants
        set({ participants })
        return participants
      },

      importParticipants: (list) => {
        const participants = list
          .map((r) => ({
            id: typeof r.id === 'string' && r.id ? r.id : String(r.idNumber ?? r.id_number ?? r['ID Number'] ?? ''),
            name: String(r.name ?? r.Name ?? '').trim(),
            idNumber: String(r.idNumber ?? r.id_number ?? r['ID Number'] ?? '').trim(),
            phone: String(r.phone ?? r.Phone ?? '').trim(),
            group: String(r.group ?? r.Group ?? '').trim(),
          }))
          .filter((p) => p.name && p.id)
        if (participants.length) writeSharedParticipants(participants)
        set({ participants })
        return participants
      },

      findParticipant: (query) => {
        const q = query.trim().toLowerCase()
        if (!q) return null
        return (
          get().participants.find(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.idNumber.includes(q) ||
              p.phone.includes(q)
          ) ?? null
        )
      },

      findBag: (tagCode) => get().bags.find((b) => b.tagCode === tagCode.toUpperCase()) ?? null,

      checkIn: (participantId, bagCount) => {
        const officer = get().officer.name
        const time = now()
        let n = get().nextTagNumber
        const newBags = []
        for (let i = 0; i < bagCount; i++) {
          const tagCode = `LLM-${String(n).padStart(4, '0')}`
          newBags.push({
            tagCode,
            participantId,
            status: 'CHECKED_IN',
            vehicle: null,
            timeline: [{ event: 'CHECKED_IN', officer, time, note: 'Bag tagged & receipt issued' }],
          })
          n++
        }
        set((s) => ({
          bags: [...s.bags, ...newBags],
          nextTagNumber: n,
        }))
        return newBags
      },

      removeBag: (tagCode) => {
        const bag = get().bags.find((b) => b.tagCode === tagCode)
        if (!bag) return { ok: false, reason: `Tag ${tagCode} not found` }
        if (bag.status !== 'CHECKED_IN')
          return { ok: false, reason: `${tagCode} is ${bag.status} — can only remove bags still at check-in` }
        set((s) => ({ bags: s.bags.filter((b) => b.tagCode !== tagCode) }))
        return { ok: true, reason: `${tagCode} removed — check-in corrected` }
      },

      loadBags: (tagCodes) => {
        const officer = get().officer.name
        const time = now()
        const vehicle = get().vehicle.code
        set((s) => ({
          bags: s.bags.map((b) =>
            tagCodes.includes(b.tagCode) && b.status === 'CHECKED_IN'
              ? {
                  ...b,
                  status: 'LOADED',
                  vehicle,
                  timeline: [...b.timeline, { event: 'LOADED', officer, time, note: `Loaded onto ${vehicle}` }],
                }
              : b
          ),
        }))
      },

      depart: () => {
        const officer = get().officer.name
        const time = now()
        set((s) => ({
          vehicle: { ...s.vehicle, status: 'IN_TRANSIT' },
          bags: s.bags.map((b) =>
            b.status === 'LOADED'
              ? { ...b, status: 'IN_TRANSIT', timeline: [...b.timeline, { event: 'IN_TRANSIT', officer, time, note: 'Manifest locked — truck departed' }] }
              : b
          ),
        }))
      },

      unloadBag: (tagCode) => {
        const officer = get().officer.name
        const time = now()
        const bag = get().bags.find((b) => b.tagCode === tagCode)
        if (!bag) return { ok: false, reason: `Tag ${tagCode} not found` }
        if (bag.status !== 'IN_TRANSIT')
          return { ok: false, reason: `${tagCode} is ${bag.status} — can only offload bags in transit` }
        const remainingInTransit = get().bags.filter((b) => b.status === 'IN_TRANSIT' && b.tagCode !== tagCode).length
        set((s) => ({
          vehicle: remainingInTransit === 0 ? { ...s.vehicle, status: 'AT_ORIGIN' } : s.vehicle,
          bags: s.bags.map((b) =>
            b.tagCode === tagCode
              ? {
                  ...b,
                  status: 'UNLOADED',
                  timeline: [...b.timeline, { event: 'UNLOADED', officer, time, note: 'Scanned off truck at destination' }],
                }
              : b
          ),
        }))
        return { ok: true, returned: remainingInTransit === 0 }
      },

      unloadAll: () => {
        const officer = get().officer.name
        const time = now()
        set((s) => ({
          vehicle: { ...s.vehicle, status: 'AT_ORIGIN' },
          bags: s.bags.map((b) =>
            b.status === 'IN_TRANSIT'
              ? { ...b, status: 'UNLOADED', timeline: [...b.timeline, { event: 'UNLOADED', officer, time, note: 'Scanned off truck at destination' }] }
              : b
          ),
        }))
      },

      handOver: (participantId, tagCode) => {
        const officer = get().officer.name
        const time = now()
        let ok = false
        set((s) => ({
          bags: s.bags.map((b) => {
            if (b.tagCode !== tagCode) return b
            if (b.participantId !== participantId) return b
            if (b.status !== 'UNLOADED' && b.status !== 'CHECKED_IN' && b.status !== 'LOADED') return b
            ok = true
            return {
              ...b,
              status: 'HANDED_OVER',
              timeline: [...b.timeline, { event: 'HANDED_OVER', officer, time, note: 'ID verified — bag returned' }],
            }
          }),
        }))
        return ok
      },

      reset: () =>
        set({
          bags: [],
          vehicle: { code: 'TRUCK-01', status: 'AT_ORIGIN' },
          nextTagNumber: 1,
        }),
    }),
    {
      name: 'llm-prototype-v2',
      partialize: (s) => ({
        officer: s.officer,
        bags: s.bags,
        vehicle: s.vehicle,
        nextTagNumber: s.nextTagNumber,
      }),
    }
  )
)

export const STATUS_META = {
  CHECKED_IN: { label: 'Checked in', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  LOADED: { label: 'Loaded', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  IN_TRANSIT: { label: 'In transit', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  UNLOADED: { label: 'Unloaded', color: 'bg-teal-50 text-teal-700 border-teal-200' },
  HANDED_OVER: { label: 'Handed over', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}
