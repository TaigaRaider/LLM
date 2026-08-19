import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api } from '../api'
import StatusBadge from '../components/StatusBadge'

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += c
    }
  }
  row.push(cell)
  if (row.some((v) => v.trim() !== '')) rows.push(row)

  const header = rows[0].map((h) => h.toLowerCase())
  return rows.slice(1).map((r) => {
    const get = (name) => {
      const i = header.indexOf(name)
      return i >= 0 ? r[i] ?? '' : ''
    }
    return {
      name: get('name'),
      idNumber: get('id number'),
      phone: get('phone'),
      group: get('group'),
    }
  })
}

export default function Dashboard() {
  const bags = useStore((s) => s.bags)
  const participants = useStore((s) => s.participants)
  const vehicle = useStore((s) => s.vehicle)
  const reset = useStore((s) => s.reset)
  const reloadParticipants = useStore((s) => s.reloadParticipants)
  const importParticipants = useStore((s) => s.importParticipants)
  const showToast = useStore((s) => s.showToast)
  const officer = useStore((s) => s.officer)
  const fileRef = useRef(null)

  const [officerList, setOfficerList] = useState([])
  const [newOfficer, setNewOfficer] = useState({ name: '', username: '', role: 'Check-in Officer', password: '' })
  const [officerError, setOfficerError] = useState(null)

  const reloadOfficers = async () => {
    try {
      const list = await api('/officers')
      setOfficerList(list)
    } catch (err) {
      showToast(err.message)
    }
  }

  useEffect(() => {
    reloadOfficers()
  }, [])

  const createOfficer = async (e) => {
    e.preventDefault()
    setOfficerError(null)
    if (!newOfficer.name.trim() || !newOfficer.username.trim() || !newOfficer.password) {
      return setOfficerError('Name, username and password are required')
    }
    if (newOfficer.password.length < 6) return setOfficerError('Password must be at least 6 characters')
    try {
      await api('/officers', { method: 'POST', body: { ...newOfficer, name: newOfficer.name.trim(), username: newOfficer.username.trim() } })
      setNewOfficer({ name: '', username: '', role: 'Check-in Officer', password: '' })
      showToast(`Officer ${newOfficer.username} created — will be asked to set a password on first login`)
      await reloadOfficers()
    } catch (err) {
      setOfficerError(err.message)
    }
  }

  const updateOfficer = async (o) => {
    try {
      await api(`/officers/${o.id}`, { method: 'PUT', body: { active: !o.active } })
      showToast(`${o.name} ${o.active ? 'disabled' : 'enabled'}`)
      await reloadOfficers()
    } catch (err) {
      showToast(err.message)
    }
  }

  const resetPassword = async (o) => {
    if (!window.confirm(`Reset password for ${o.name}? They will be forced to change it on next login.`)) return
    try {
      await api(`/officers/${o.id}`, { method: 'PUT', body: { password: 'officer123' } })
      showToast(`Password reset to officer123 for ${o.name}`)
      await reloadOfficers()
    } catch (err) {
      showToast(err.message)
    }
  }


  const checkedIn = bags.length
  const handedOver = bags.filter((b) => b.status === 'HANDED_OVER').length
  const inTransit = bags.filter((b) => b.status === 'IN_TRANSIT').length
  const unloaded = bags.filter((b) => b.status === 'UNLOADED').length
  const loaded = bags.filter((b) => b.status === 'LOADED').length
  const atOrigin = bags.filter((b) => b.status === 'CHECKED_IN').length
  const outstanding = unloaded
  const discrepancy = checkedIn - handedOver - inTransit - unloaded - loaded - atOrigin

  const stats = [
    { label: 'Checked in', value: checkedIn, color: 'text-sky-600' },
    { label: 'Handed over', value: handedOver, color: 'text-emerald-600' },
    { label: 'In transit', value: inTransit, color: 'text-amber-600' },
    { label: 'Unloaded', value: unloaded, color: 'text-teal-600' },
    { label: 'Outstanding', value: outstanding, color: 'text-red-600' },
  ]

  const reconciliationOk = discrepancy === 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className={`text-3xl font-semibold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-1 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>

      <div
        className={`q-rise-sm rounded-xl border p-5 border-l-4 ${
          reconciliationOk ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'
        }`}
      >
        <div className="font-semibold text-lg text-slate-900">
          {reconciliationOk ? '✓ Reconciliation OK' : '✗ Discrepancy detected'}
        </div>
        <p className="text-sm text-slate-600 mt-1">
          Checked in ({checkedIn}) = Handed over ({handedOver}) + In transit ({inTransit}) + Unloaded ({unloaded}) +
          On truck ({loaded}) + At origin ({atOrigin}){' '}
          {reconciliationOk ? '' : `— missing ${Math.abs(discrepancy)} bag(s)`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Truck {vehicle.code}</h3>
          <span className="text-sm font-medium text-slate-600">{vehicle.status.replace('_', ' ')}</span>
        </div>
        <p className="text-sm text-slate-500 tabular-nums">
          {bags.filter((b) => b.vehicle === vehicle.code).length} bags assigned · {participants.length} registered
          participants
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Outstanding bags (not yet returned)</h3>
        {outstanding === 0 ? (
          <p className="text-sm text-emerald-600 font-medium">All unloaded bags have been returned ✓</p>
        ) : (
          <div className="space-y-2">
            {bags
              .filter((b) => b.status === 'UNLOADED')
              .map((b) => {
                const p = participants.find((x) => x.id === b.participantId)
                return (
                  <div
                    key={b.tagCode}
                    className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                  >
                    <div>
                      <span className="font-mono font-semibold text-slate-900">{b.tagCode}</span>
                      <span className="text-sm text-slate-600 ml-3">{p?.name ?? 'Unknown participant'}</span>
                    </div>
                    <StatusBadge status={b.status} />
                  </div>
                )
              })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-slate-900">Participants</h3>
            <p className="text-sm text-slate-500 mt-0.5 tabular-nums">
              {participants.length} registered — supplied by the Registration app (shared storage)
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const list = await reloadParticipants()
                showToast(`Reloaded ${list.length} participants from backend`)
              }}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              Reload from registration
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                try {
                  const text = await file.text()
                  const raw = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text)
                  if (!Array.isArray(raw) || !raw.length) throw new Error('empty file')
                  const loaded = await importParticipants(raw)
                  showToast(`Imported ${loaded.length} participant${loaded.length !== 1 ? 's' : ''}`)
                } catch {
                  showToast('Import failed — not valid JSON/CSV')
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Officers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <ul className="divide-y divide-slate-100">
              {officerList.map((o) => (
                <li key={o.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">
                      {o.name}
                      {o.id === officer.id && <span className="ml-2 text-[10px] text-sky-600 font-semibold uppercase">You</span>}
                    </div>
                    <div className="text-sm text-slate-500">
                      {o.role} · <span className="font-mono">{o.username}</span>
                    </div>
                    {o.must_change_password && (
                      <div className="text-xs text-amber-600 font-medium">Password change pending</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${
                        o.active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}
                    >
                      {o.active ? 'Active' : 'Disabled'}
                    </span>
                    <button
                      onClick={() => resetPassword(o)}
                      className="px-2 py-1 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Reset password
                    </button>
                    <button
                      onClick={() => updateOfficer(o)}
                      className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      {o.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <form onSubmit={createOfficer} className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-700">Add officer</h4>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full name</label>
              <input
                value={newOfficer.name}
                onChange={(e) => setNewOfficer({ ...newOfficer, name: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Username</label>
              <input
                value={newOfficer.username}
                onChange={(e) => setNewOfficer({ ...newOfficer, username: e.target.value })}
                autoCapitalize="none"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Role</label>
              <select
                value={newOfficer.role}
                onChange={(e) => setNewOfficer({ ...newOfficer, role: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              >
                <option>Check-in Officer</option>
                <option>Handover Officer</option>
                <option>Logistics Manager</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Initial password</label>
              <input
                type="password"
                value={newOfficer.password}
                onChange={(e) => setNewOfficer({ ...newOfficer, password: e.target.value })}
                placeholder="min 6 characters"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            {officerError && <p className="text-sm text-red-600 font-medium">{officerError}</p>}
            <button
              type="submit"
              className="w-full py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all duration-150"
            >
              Create officer
            </button>
          </form>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Every bag must belong to a registered participant.</p>
        <button
          onClick={async () => {
            if (!window.confirm('Empty the entire bag database? This cannot be undone.')) return
            await reset()
            showToast('Database emptied — ready for fresh check-in')
          }}
          className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
        >
          Empty database
        </button>
      </div>
    </div>
  )
}
