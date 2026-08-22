import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { seedParticipants } from './seed'
import { api, ApiError, changePassword, getStoredOfficer, getToken, loginOfficer, logout } from './api'

const PARTICIPANT_SOURCE_KEY = 'llm-participants-v1'
const PENDING_KEY = 'llm_pending_ops'

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

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return now()
  }
}

const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const normalizeParticipant = (p) => ({
  id: p.id,
  name: p.name,
  idNumber: p.id_number,
  phone: p.phone,
  group: p.group,
  active: p.active,
  source: p.source,
})

const normalizeBag = (b) => ({
  tagCode: b.tag_code,
  participantId: b.participant_id,
  status: b.status,
  vehicle: b.vehicle_code,
  restoreStatus: b.restore_status,
  timeline: (b.timeline || []).map((e) => ({
    event: e.event,
    officer: e.officer_name,
    time: fmtTime(e.timestamp),
    note: e.note,
  })),
})

const normalizeVehicle = (v) => ({
  code: v.code,
  status: v.status,
  loaded: v.loaded ?? 0,
  inTransit: v.in_transit ?? 0,
  unloaded: v.unloaded ?? 0,
  total: v.total ?? 0,
})

const normalizeTrip = (t) => ({
  id: t.id,
  vehicleCode: t.vehicle_code,
  departedAt: fmtDate(t.departed_at),
  arrivedAt: t.arrived_at ? fmtDate(t.arrived_at) : null,
  returnedAt: t.returned_at ? fmtDate(t.returned_at) : null,
  bagCount: t.bag_count,
  departedBy: t.departed_by,
  arrivedBy: t.arrived_by,
  returnedBy: t.returned_by,
})

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

const needsPasswordChange = (err) => err instanceof ApiError && err.status === 403 && err.message === 'CHANGE_PASSWORD_REQUIRED'

export const useStore = create(
  persist(
    (set, get) => ({
      officer: getStoredOfficer(),
      participants: [],
      bags: [],
      vehicles: [],
      trips: [],
      vehicle: { code: 'TRUCK-01', status: 'AT_ORIGIN' },
      nextTagNumber: 1,
      toast: null,
      online: false,
      hasBeenOnline: false,
      pendingCount: 0,
      mustChangePassword: false,
      loginError: null,

      showToast: (msg) => {
        set({ toast: msg })
        setTimeout(() => set({ toast: null }), 3500)
      },

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
        await get().refreshAll()
      },

      login: async (username, password) => {
        set({ loginError: null })
        try {
          const officer = await loginOfficer(username, password)
          if (officer.must_change_password) {
            set({ officer, online: true, mustChangePassword: true })
            return officer
          }
          set({ officer, online: true, mustChangePassword: false })
          await get().refreshAll()
          return officer
        } catch (err) {
          set({ loginError: err.message, online: false })
          throw err
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        const officer = await changePassword(currentPassword, newPassword)
        set({ officer, mustChangePassword: false })
        return officer
      },

      logout: async () => {
        await logout()
        set({ officer: null, online: false, mustChangePassword: false, loginError: null })
      },

      refreshAll: async () => {
        try {
          const [participants, bags, vehicle, vehicles, trips] = await Promise.all([
            api('/participants'),
            api('/bags'),
            api('/vehicle'),
            api('/vehicles'),
            api('/trips'),
          ])
          set({
            participants: participants.map(normalizeParticipant),
            bags: bags.map(normalizeBag),
            vehicle,
            vehicles: vehicles.map(normalizeVehicle),
            trips: trips.map(normalizeTrip),
            online: true,
            hasBeenOnline: true,
          })
          return true
        } catch (err) {
          if (needsPasswordChange(err)) set({ mustChangePassword: true })
          set({ online: false })
          return false
        }
      },

      bootstrap: async () => {
        if (!getToken()) return false
        const ok = await get().refreshAll()
        if (ok) {
          await get().flushQueue()
        } else {
          await get().reloadParticipants()
        }
        return ok
      },

      reloadParticipants: async () => {
        try {
          const list = await api('/participants')
          const participants = list.map(normalizeParticipant)
          set({ participants, online: true })
          return participants
        } catch {
          const participants = readSharedParticipants() ?? seedParticipants
          set({ participants, online: false })
          return participants
        }
      },

      importParticipants: async (raw) => {
        const seen = new Set()
        const list = raw
          .map((r) => ({
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
        if (!list.length) return []
        try {
          const created = await api('/participants/bulk', {
            method: 'POST',
            body: list.map((p) => ({ name: p.name, id_number: p.idNumber, phone: p.phone, group: p.group })),
          })
          set({ online: true })
          return created.map(normalizeParticipant)
        } catch {
          writeSharedParticipants(list)
          set({ participants: list, online: false })
          get().queueOp({
            path: '/participants/bulk',
            method: 'POST',
            body: list.map((p) => ({ name: p.name, id_number: p.idNumber, phone: p.phone, group: p.group })),
          })
          return list
        }
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

      findBag: (tagCode) => get().bags.find((b) => b.tagCode === (tagCode || '').toUpperCase()) ?? null,

      checkIn: async (participantId, bagCount) => {
        try {
          const created = await api('/bags/check-in', {
            method: 'POST',
            body: { participant_id: participantId, bag_count: bagCount },
          })
          const bags = created.map(normalizeBag)
          set((s) => ({ bags: [...s.bags, ...bags], online: true }))
          return bags
        } catch {
          const officer = get().officer.name
          const time = now()
          const existing = new Set(get().bags.map((b) => b.tagCode))
          let n = get().nextTagNumber
          while (existing.has(`LLM-${String(n).padStart(4, '0')}`)) n++
          const newBags = []
          for (let i = 0; i < bagCount; i++) {
            const tagCode = `LLM-${String(n).padStart(4, '0')}`
            newBags.push({
              tagCode,
              participantId,
              status: 'CHECKED_IN',
              vehicle: null,
              restoreStatus: null,
              timeline: [{ event: 'CHECKED_IN', officer, time, note: 'Bag tagged & receipt issued' }],
            })
            n++
          }
          set((s) => ({ bags: [...s.bags, ...newBags], nextTagNumber: n, online: false }))
          get().queueOp({ path: '/bags/check-in', method: 'POST', body: { participant_id: participantId, bag_count: bagCount } })
          return newBags
        }
      },

      removeBag: async (tagCode) => {
        const bag = get().bags.find((b) => b.tagCode === tagCode)
        if (!bag) return { ok: false, reason: `Tag ${tagCode} not found` }
        if (bag.status !== 'CHECKED_IN')
          return { ok: false, reason: `${tagCode} is ${bag.status} — can only remove bags still at check-in` }
        try {
          await api(`/bags/${encodeURIComponent(tagCode)}`, { method: 'DELETE' })
          set((s) => ({ bags: s.bags.filter((b) => b.tagCode !== tagCode), online: true }))
          return { ok: true, reason: `${tagCode} removed — check-in corrected` }
        } catch (err) {
          if (isClientError(err)) return { ok: false, reason: err.message }
          set((s) => ({ bags: s.bags.filter((b) => b.tagCode !== tagCode), online: false }))
          get().queueOp({ path: `/bags/${encodeURIComponent(tagCode)}`, method: 'DELETE' })
          return { ok: true, reason: `${tagCode} removed locally — will sync when online` }
        }
      },

      loadBags: async (tagCodes, vehicleCode) => {
        const officer = get().officer.name
        const time = now()
        const vehicle = vehicleCode || get().vehicle.code
        try {
          await api('/bags/load', { method: 'POST', body: { tag_codes: tagCodes, vehicle_code: vehicle } })
          set((s) => ({
            bags: s.bags.map((b) =>
              tagCodes.includes(b.tagCode) && b.status === 'CHECKED_IN'
                ? { ...b, status: 'LOADED', vehicle, timeline: [...b.timeline, { event: 'LOADED', officer, time, note: `Loaded onto ${vehicle}` }] }
                : b
            ),
            online: true,
          }))
          return true
        } catch (err) {
          if (isClientError(err)) {
            get().showToast(err.message)
            return false
          }
          set((s) => ({
            bags: s.bags.map((b) =>
              tagCodes.includes(b.tagCode) && b.status === 'CHECKED_IN'
                ? { ...b, status: 'LOADED', vehicle, timeline: [...b.timeline, { event: 'LOADED', officer, time, note: `Loaded onto ${vehicle}` }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: '/bags/load', method: 'POST', body: { tag_codes: tagCodes, vehicle_code: vehicle } })
          return true
        }
      },

      depart: async (vehicleCode) => {
        const officer = get().officer.name
        const time = now()
        const code = vehicleCode || get().vehicle.code
        try {
          await api(`/bags/depart?vehicle_code=${encodeURIComponent(code)}`, { method: 'POST' })
          const vehicles = get().vehicles.map((v) => (v.code === code ? { ...v, status: 'IN_TRANSIT' } : v))
          set((s) => ({
            vehicles,
            vehicle: code === s.vehicle.code ? { ...s.vehicle, status: 'IN_TRANSIT' } : s.vehicle,
            bags: s.bags.map((b) =>
              b.status === 'LOADED' && b.vehicle === code
                ? { ...b, status: 'IN_TRANSIT', timeline: [...b.timeline, { event: 'IN_TRANSIT', officer, time, note: 'Manifest locked — truck departed' }] }
                : b
            ),
            online: true,
          }))
        } catch (err) {
          if (isClientError(err)) {
            get().showToast(err.message)
            return
          }
          set((s) => ({
            vehicles: s.vehicles.map((v) => (v.code === code ? { ...v, status: 'IN_TRANSIT' } : v)),
            vehicle: code === s.vehicle.code ? { ...s.vehicle, status: 'IN_TRANSIT' } : s.vehicle,
            bags: s.bags.map((b) =>
              b.status === 'LOADED' && b.vehicle === code
                ? { ...b, status: 'IN_TRANSIT', timeline: [...b.timeline, { event: 'IN_TRANSIT', officer, time, note: 'Manifest locked — truck departed' }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: `/bags/depart?vehicle_code=${encodeURIComponent(code)}`, method: 'POST' })
        }
      },

      unloadBag: async (tagCode) => {
        const officer = get().officer.name
        const time = now()
        const bag = get().bags.find((b) => b.tagCode === tagCode)
        if (!bag) return { ok: false, reason: `Tag ${tagCode} not found` }
        if (bag.status !== 'IN_TRANSIT')
          return { ok: false, reason: `${tagCode} is ${bag.status} — can only offload bags in transit` }
        try {
          await api(`/bags/unload?tag_code=${encodeURIComponent(tagCode)}`, { method: 'POST' })
          const remainingInTransit = get().bags.filter((b) => b.status === 'IN_TRANSIT' && b.tagCode !== tagCode).length
          set((s) => ({
            vehicles: remainingInTransit === 0
              ? s.vehicles.map((v) => (v.code === bag.vehicle ? { ...v, status: 'AT_DESTINATION' } : v))
              : s.vehicles,
            vehicle: remainingInTransit === 0 && bag.vehicle === s.vehicle.code
              ? { ...s.vehicle, status: 'AT_DESTINATION' }
              : s.vehicle,
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: 'UNLOADED', timeline: [...b.timeline, { event: 'UNLOADED', officer, time, note: 'Scanned off truck at destination' }] }
                : b
            ),
            online: true,
          }))
          return { ok: true, last: remainingInTransit === 0 }
        } catch (err) {
          if (isClientError(err)) return { ok: false, reason: err.message }
          const remainingInTransit = get().bags.filter((b) => b.status === 'IN_TRANSIT' && b.tagCode !== tagCode).length
          set((s) => ({
            vehicles: remainingInTransit === 0
              ? s.vehicles.map((v) => (v.code === bag.vehicle ? { ...v, status: 'AT_DESTINATION' } : v))
              : s.vehicles,
            vehicle: remainingInTransit === 0 && bag.vehicle === s.vehicle.code
              ? { ...s.vehicle, status: 'AT_DESTINATION' }
              : s.vehicle,
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: 'UNLOADED', timeline: [...b.timeline, { event: 'UNLOADED', officer, time, note: 'Scanned off truck at destination' }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: `/bags/unload?tag_code=${encodeURIComponent(tagCode)}`, method: 'POST' })
          return { ok: true, last: remainingInTransit === 0 }
        }
      },

      unloadAll: async (vehicleCode) => {
        const officer = get().officer.name
        const time = now()
        const code = vehicleCode || get().vehicle.code
        try {
          await api(`/bags/unload?all_bags=true&vehicle_code=${encodeURIComponent(code)}`, { method: 'POST' })
          set((s) => ({
            vehicles: s.vehicles.map((v) => (v.code === code ? { ...v, status: 'AT_DESTINATION' } : v)),
            vehicle: code === s.vehicle.code ? { ...s.vehicle, status: 'AT_DESTINATION' } : s.vehicle,
            bags: s.bags.map((b) =>
              b.status === 'IN_TRANSIT' && b.vehicle === code
                ? { ...b, status: 'UNLOADED', timeline: [...b.timeline, { event: 'UNLOADED', officer, time, note: 'Scanned off truck at destination' }] }
                : b
            ),
            online: true,
          }))
        } catch (err) {
          if (isClientError(err)) {
            get().showToast(err.message)
            return
          }
          set((s) => ({
            vehicles: s.vehicles.map((v) => (v.code === code ? { ...v, status: 'AT_DESTINATION' } : v)),
            vehicle: code === s.vehicle.code ? { ...s.vehicle, status: 'AT_DESTINATION' } : s.vehicle,
            bags: s.bags.map((b) =>
              b.status === 'IN_TRANSIT' && b.vehicle === code
                ? { ...b, status: 'UNLOADED', timeline: [...b.timeline, { event: 'UNLOADED', officer, time, note: 'Scanned off truck at destination' }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: `/bags/unload?all_bags=true&vehicle_code=${encodeURIComponent(code)}`, method: 'POST' })
        }
      },

      returnToOrigin: async (vehicleCode) => {
        const code = vehicleCode || get().vehicle.code
        try {
          await api(`/bags/return-to-origin?vehicle_code=${encodeURIComponent(code)}`, { method: 'POST' })
          set((s) => ({
            vehicles: s.vehicles.map((v) => (v.code === code ? { ...v, status: 'AT_ORIGIN' } : v)),
            vehicle: code === s.vehicle.code ? { ...s.vehicle, status: 'AT_ORIGIN' } : s.vehicle,
            online: true,
          }))
        } catch (err) {
          if (isClientError(err)) {
            get().showToast(err.message)
            return
          }
          set((s) => ({
            vehicles: s.vehicles.map((v) => (v.code === code ? { ...v, status: 'AT_ORIGIN' } : v)),
            vehicle: code === s.vehicle.code ? { ...s.vehicle, status: 'AT_ORIGIN' } : s.vehicle,
            online: false,
          }))
          get().queueOp({ path: `/bags/return-to-origin?vehicle_code=${encodeURIComponent(code)}`, method: 'POST' })
        }
      },

      markLost: async (tagCode, note) => {
        const officer = get().officer.name
        const time = now()
        const bag = get().bags.find((b) => b.tagCode === tagCode)
        if (!bag) return { ok: false, reason: `Tag ${tagCode} not found` }
        if (bag.status === 'HANDED_OVER' || bag.status === 'LOST')
          return { ok: false, reason: `${tagCode} is ${bag.status} — cannot mark lost` }
        try {
          await api('/bags/lost', { method: 'POST', body: { tag_code: tagCode, note } })
          set((s) => ({
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: 'LOST', restoreStatus: bag.status, timeline: [...b.timeline, { event: 'LOST', officer, time, note: note || 'Marked lost' }] }
                : b
            ),
            online: true,
          }))
          return { ok: true, reason: `${tagCode} marked lost` }
        } catch (err) {
          if (isClientError(err)) return { ok: false, reason: err.message }
          set((s) => ({
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: 'LOST', restoreStatus: bag.status, timeline: [...b.timeline, { event: 'LOST', officer, time, note: note || 'Marked lost' }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: '/bags/lost', method: 'POST', body: { tag_code: tagCode, note } })
          return { ok: true, reason: `${tagCode} marked lost locally — will sync when online` }
        }
      },

      recoverBag: async (tagCode) => {
        const officer = get().officer.name
        const time = now()
        const bag = get().bags.find((b) => b.tagCode === tagCode)
        if (!bag) return { ok: false, reason: `Tag ${tagCode} not found` }
        if (bag.status !== 'LOST') return { ok: false, reason: `${tagCode} is not marked lost` }
        const target = bag.restoreStatus || 'UNLOADED'
        try {
          await api('/bags/recover', { method: 'POST', body: { tag_code: tagCode } })
          set((s) => ({
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: target, restoreStatus: null, timeline: [...b.timeline, { event: target, officer, time, note: 'Bag recovered — returned to previous status' }] }
                : b
            ),
            online: true,
          }))
          return { ok: true, reason: `${tagCode} recovered` }
        } catch (err) {
          if (isClientError(err)) return { ok: false, reason: err.message }
          set((s) => ({
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: target, restoreStatus: null, timeline: [...b.timeline, { event: target, officer, time, note: 'Bag recovered — returned to previous status' }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: '/bags/recover', method: 'POST', body: { tag_code: tagCode } })
          return { ok: true, reason: `${tagCode} recovered locally — will sync when online` }
        }
      },

      handOver: async (participantId, tagCode) => {
        const officer = get().officer.name
        const time = now()
        try {
          await api('/bags/handover', { method: 'POST', body: { participant_id: participantId, tag_code: tagCode } })
          set((s) => ({
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: 'HANDED_OVER', timeline: [...b.timeline, { event: 'HANDED_OVER', officer, time, note: 'ID verified — bag returned' }] }
                : b
            ),
            online: true,
          }))
          return { ok: true, reason: `${tagCode} handed over` }
        } catch (err) {
          if (isClientError(err)) return { ok: false, reason: err.message }
          set((s) => ({
            bags: s.bags.map((b) =>
              b.tagCode === tagCode
                ? { ...b, status: 'HANDED_OVER', timeline: [...b.timeline, { event: 'HANDED_OVER', officer, time, note: 'ID verified — bag returned' }] }
                : b
            ),
            online: false,
          }))
          get().queueOp({ path: '/bags/handover', method: 'POST', body: { participant_id: participantId, tag_code: tagCode } })
          return { ok: true, reason: `${tagCode} handed over locally — will sync when online` }
        }
      },

      reset: async () => {
        const cleared = {
          bags: [],
          vehicle: { code: 'TRUCK-01', status: 'AT_ORIGIN' },
          vehicles: [],
          nextTagNumber: 1,
        }
        try {
          await api('/bags/reset', { method: 'POST' })
          set({ ...cleared, online: true })
        } catch {
          set({ ...cleared, online: false })
          get().queueOp({ path: '/bags/reset', method: 'POST' })
        }
      },
    }),
    {
      name: 'llm-prototype-v3',
      partialize: (s) => ({
        officer: s.officer,
        participants: s.participants,
        bags: s.bags,
        vehicles: s.vehicles,
        trips: s.trips,
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
  LOST: { label: 'Lost', color: 'bg-red-50 text-red-700 border-red-200' },
}