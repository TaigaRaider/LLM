import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { api, getToken } from '../api'
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

async function downloadFile(path, fallbackName) {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}${path}`, {
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    })
    if (!res.ok) {
      const msg = res.status === 401 ? 'Session expired — please log in again'
        : res.status === 403 ? 'Permission denied'
        : await res.text().catch(() => res.statusText)
      throw new Error(msg)
    }
    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const match = disposition.match(/filename="?([^";]+)"?/)
    const filename = match ? match[1] : fallbackName
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (err) {
    throw new Error(err.message || 'Download failed')
  }
}

function validateExcelFile(file) {
  if (!file) return 'No file selected'
  const name = file.name.toLowerCase()
  if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm')) return 'File must be .xlsx or .xlsm'
  if (file.size > 5 * 1024 * 1024) return 'File too large (max 5 MB)'
  return null
}

function validateJsonCsvFile(file) {
  if (!file) return 'No file selected'
  const name = file.name.toLowerCase()
  if (!name.endsWith('.json') && !name.endsWith('.csv')) return 'File must be .json or .csv'
  if (file.size > 2 * 1024 * 1024) return 'File too large (max 2 MB)'
  return null
}

const VEHICLE_META = {
  AT_ORIGIN: { label: 'At origin', color: 'bg-sky-50 text-sky-700 border-sky-200' },
  IN_TRANSIT: { label: 'In transit', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  AT_DESTINATION: { label: 'At destination', color: 'bg-teal-50 text-teal-700 border-teal-200' },
}

export default function Dashboard() {
  const bags = useStore((s) => s.bags) || []
  const participants = useStore((s) => s.participants) || []
  const vehicles = useStore((s) => s.vehicles) || []
  const vehicle = useStore((s) => s.vehicle) || { code: 'TRUCK-01', status: 'AT_ORIGIN' }
  const trips = useStore((s) => s.trips) || []
  const reset = useStore((s) => s.reset)
  const resetAll = useStore((s) => s.resetAll)
  const reloadParticipants = useStore((s) => s.reloadParticipants)
  const importParticipants = useStore((s) => s.importParticipants)
  const recoverBag = useStore((s) => s.recoverBag)
  const refreshAll = useStore((s) => s.refreshAll)
  const showToast = useStore((s) => s.showToast)
  const officer = useStore((s) => s.officer)
  const fileRef = useRef(null)
  const excelRef = useRef(null)

  const [officerList, setOfficerList] = useState([])
  const [newOfficer, setNewOfficer] = useState({ name: '', username: '', role: 'Check-in Officer', password: '' })
  const [officerError, setOfficerError] = useState(null)
  const [newVehicle, setNewVehicle] = useState('')
  const [alerts, setAlerts] = useState(null)

  const reloadOfficers = async () => {
    try {
      const list = await api('/officers')
      setOfficerList(list)
    } catch (err) {
      showToast(err.message)
    }
  }

  const reloadAlerts = async () => {
    try {
      const data = await api('/reports/alerts')
      setAlerts(data)
    } catch {
      /* not fatal */
    }
  }

  useEffect(() => {
    reloadOfficers()
    reloadAlerts()
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

  const createVehicle = async (e) => {
    e.preventDefault()
    const code = newVehicle.trim().toUpperCase()
    if (!code) return
    try {
      await api('/vehicles', { method: 'POST', body: { code } })
      setNewVehicle('')
      showToast(`Vehicle ${code} added`)
      await refreshAll()
    } catch (err) {
      showToast(err.message)
    }
  }

  const deleteVehicle = async (v) => {
    if (!window.confirm(`Remove vehicle ${v.code}? Only possible when no bags are assigned.`)) return
    try {
      await api(`/vehicles/${encodeURIComponent(v.code)}`, { method: 'DELETE' })
      showToast(`Vehicle ${v.code} removed`)
      await refreshAll()
    } catch (err) {
      showToast(err.message)
    }
  }

  const doDownload = async (path, fallback) => {
    try {
      await downloadFile(path, fallback)
    } catch (err) {
      showToast(err.message)
    }
  }

  const checkedIn = bags.length
  const handedOver = bags.filter((b) => b?.status === 'HANDED_OVER').length
  const inTransit = bags.filter((b) => b?.status === 'IN_TRANSIT').length
  const unloaded = bags.filter((b) => b?.status === 'UNLOADED').length
  const loaded = bags.filter((b) => b?.status === 'LOADED').length
  const atOrigin = bags.filter((b) => b?.status === 'CHECKED_IN').length
  const lost = bags.filter((b) => b?.status === 'LOST').length
  const outstanding = unloaded
  const discrepancy = checkedIn - handedOver - inTransit - unloaded - loaded - atOrigin - lost

  const stats = [
    { label: 'Checked in', value: checkedIn, color: 'text-sky-600' },
    { label: 'Handed over', value: handedOver, color: 'text-emerald-600' },
    { label: 'In transit', value: inTransit, color: 'text-amber-600' },
    { label: 'Unloaded', value: unloaded, color: 'text-teal-600' },
    { label: 'Lost', value: lost, color: 'text-red-600' },
  ]

  const reconciliationOk = discrepancy === 0
  const vehicleList = vehicles.length ? vehicles : [vehicle]

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
          On truck ({loaded}) + At origin ({atOrigin}) + Lost ({lost}){' '}
          {reconciliationOk ? '' : `— missing ${Math.abs(discrepancy)} bag(s)`}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Vehicles ({vehicleList.length})</h3>
          <form onSubmit={createVehicle} className="flex gap-2">
            <input
              value={newVehicle}
              onChange={(e) => setNewVehicle(e.target.value)}
              placeholder="e.g. TRUCK-02"
              className="w-36 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
            >
              Add
            </button>
          </form>
        </div>
        <div className="space-y-2">
          {vehicleList.map((v) => {
            const meta = VEHICLE_META[v?.status] ?? VEHICLE_META.AT_ORIGIN
            const onTruck = bags.filter(
              (b) => b?.vehicle === v.code && (b?.status === 'LOADED' || b?.status === 'IN_TRANSIT')
            ).length
            return (
              <div key={v.code} className="flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">{v.code}</span>
                  <span className={`text-xs font-semibold border rounded-full px-2.5 py-0.5 ${meta.color}`}>
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 tabular-nums">
                    {onTruck} on truck · {bags.filter((b) => b?.vehicle === v.code && b?.status === 'UNLOADED').length} unloaded
                  </span>
                  <button
                    onClick={() => deleteVehicle(v)}
                    className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-sm text-slate-500 mt-3 tabular-nums">
          {participants.length} registered participants
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Alerts & outstanding</h3>
          <button
            onClick={reloadAlerts}
            className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Bags on truck ({alerts?.bags_on_truck?.length ?? 0})
            </h4>
            {(alerts?.bags_on_truck?.length ?? 0) === 0 ? (
              <p className="text-sm text-emerald-600 font-medium">Nothing on trucks ✓</p>
            ) : (
              <div className="space-y-1.5">
                {alerts.bags_on_truck.map((a) => (
                  <div key={a.tag_code} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900 text-sm">{a.tag_code}</span>
                      <span className="text-sm text-slate-600 ml-2">{a.participant?.name ?? 'Unknown'}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono shrink-0">{a.vehicle_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Unloaded, not returned ({alerts?.overdue_unloaded?.length ?? 0})
            </h4>
            {(alerts?.overdue_unloaded?.length ?? 0) === 0 ? (
              <p className="text-sm text-emerald-600 font-medium">All unloaded bags returned ✓</p>
            ) : (
              <div className="space-y-1.5">
                {alerts.overdue_unloaded.map((a) => (
                  <div key={a.tag_code} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900 text-sm">{a.tag_code}</span>
                      <span className="text-sm text-slate-600 ml-2">{a.participant?.name ?? 'Unknown'}</span>
                    </div>
                    <span className={`text-[10px] font-semibold shrink-0 ${a.overdue ? 'text-red-600' : 'text-slate-500'}`}>
                      {a.overdue ? `OVERDUE ${Math.floor(a.minutes_unloaded / 60)}h` : `${a.minutes_unloaded}m`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Lost ({alerts?.lost?.length ?? 0})
            </h4>
            {(alerts?.lost?.length ?? 0) === 0 ? (
              <p className="text-sm text-emerald-600 font-medium">No lost bags ✓</p>
            ) : (
              <div className="space-y-1.5">
                {alerts.lost.map((a) => (
                  <div key={a.tag_code} className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-slate-900 text-sm">{a.tag_code}</span>
                      <span className="text-sm text-slate-600 ml-2">{a.participant?.name ?? 'Unknown'}</span>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await recoverBag(a.tag_code)
                        showToast(res.reason)
                        reloadAlerts()
                      }}
                      className="px-2 py-1 text-[11px] bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors shrink-0"
                    >
                      Recover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Exports</h3>
          <span className="text-xs text-slate-400">CSV & Excel downloads</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => doDownload('/reports/checkin-manifest.csv', 'checkin-manifest.csv')}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Manifest CSV
          </button>
          <button
            onClick={() => doDownload('/reports/checkin-manifest.xlsx', 'checkin-manifest.xlsx')}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Manifest Excel
          </button>
          <button
            onClick={() => doDownload('/reports/handover-log.csv', 'handover-log.csv')}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Handover log
          </button>
          <button
            onClick={() => doDownload('/reports/handover-log.xlsx', 'handover-log.xlsx')}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Handover Excel
          </button>
          <button
            onClick={() => doDownload('/reports/participants.csv', 'participants.csv')}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Participants
          </button>
          <button
            onClick={() => doDownload('/reports/reconciliation.csv', 'reconciliation.csv')}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Reconciliation
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Recent trips</h3>
        {trips.length === 0 ? (
          <p className="text-sm text-slate-500">No trips recorded yet — departures are logged automatically.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">Vehicle</th>
                  <th className="py-2 pr-3 font-semibold">Departed</th>
                  <th className="py-2 pr-3 font-semibold">Arrived</th>
                  <th className="py-2 pr-3 font-semibold">Returned</th>
                  <th className="py-2 pr-3 font-semibold">Bags</th>
                  <th className="py-2 pr-3 font-semibold">Departed by</th>
                  <th className="py-2 pr-3 font-semibold">Arrived by</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {trips.slice(0, 10).map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-3 font-mono font-semibold text-slate-800">{t.vehicleCode}</td>
                    <td className="py-2 pr-3 text-slate-600">{t.departedAt}</td>
                    <td className="py-2 pr-3 text-slate-600">{t.arrivedAt ?? '—'}</td>
                    <td className="py-2 pr-3 text-slate-600">{t.returnedAt ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">{t.bagCount}</td>
                    <td className="py-2 pr-3 text-slate-500">{t.departedBy || '—'}</td>
                    <td className="py-2 pr-3 text-slate-500">{t.arrivedBy || '—'}</td>
                    <td className="py-2">
                      {t.returnedAt ? (
                        <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2.5 py-1">
                          Completed
                        </span>
                      ) : t.arrivedAt ? (
                        <span className="text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-1">
                          At destination
                        </span>
                      ) : (
                        <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2.5 py-1">
                          In transit
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
          <div className="flex flex-wrap gap-2">
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
              Import JSON/CSV
            </button>
            <button
              onClick={() => excelRef.current?.click()}
              className="px-3 py-2 text-sm bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition-colors"
            >
              Import Excel
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
                const validation = validateJsonCsvFile(file)
                if (validation) return showToast(validation)
                try {
                  const text = await file.text()
                  const raw = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text)
                  if (!Array.isArray(raw) || !raw.length) throw new Error('File is empty or has no valid rows')
                  const loaded = await importParticipants(raw)
                  showToast(`Imported ${loaded.length} participant${loaded.length !== 1 ? 's' : ''}`)
                } catch (err) {
                  showToast(`Import failed — ${err.message}`)
                }
              }}
            />
            <input
              ref={excelRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const validation = validateExcelFile(file)
                if (validation) return showToast(validation)
                const form = new FormData()
                form.append('file', file)
                try {
                  const res = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}/participants/import-excel`, {
                    method: 'POST',
                    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
                    body: form,
                  })
                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}))
                    const msg = j.detail || (res.status === 401 ? 'Session expired — please log in again'
                      : res.status === 403 ? 'Admin permission required'
                      : res.statusText)
                    throw new Error(msg)
                  }
                  const result = await res.json()
                  const skippedMsg = result.skipped.length
                    ? ` — ${result.skipped.length} skipped${result.skipped.length <= 5 ? `: ${result.skipped.join('; ')}` : ''}`
                    : ''
                  showToast(`Excel: ${result.created} created of ${result.total} rows${skippedMsg}`)
                  await refreshAll()
                } catch (err) {
                  showToast(`Excel import failed — ${err.message}`)
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
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!window.confirm('Empty the entire bag database? This cannot be undone.')) return
              await reset()
              showToast('Database emptied — ready for fresh check-in')
            }}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Empty bags only
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Empty EVERYTHING including participants? This cannot be undone.')) return
              await resetAll()
              showToast('Database fully emptied — fresh start')
            }}
            className="px-4 py-2 text-sm border border-red-300 rounded-lg text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors"
          >
            Empty everything
          </button>
        </div>
      </div>
    </div>
  )
}