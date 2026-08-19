import { useEffect, useRef, useState } from 'react'
import { useStore, sampleParticipants } from './store'
import Login from './screens/Login'
import ChangePassword from './screens/ChangePassword'

function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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

const GROUP_COLORS = {
  'Bus A': 'bg-sky-50 text-sky-700 border-sky-200',
  'Bus B': 'bg-violet-50 text-violet-700 border-violet-200',
  'Bus C': 'bg-amber-50 text-amber-700 border-amber-200',
  'Bus D': 'bg-teal-50 text-teal-700 border-teal-200',
}

export default function App() {
  const participants = useStore((s) => s.participants)
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const importAll = useStore((s) => s.importAll)
  const loadSample = useStore((s) => s.loadSample)
  const nextIdNumber = useStore((s) => s.nextIdNumber)

  const fileRef = useRef(null)
  const [form, setForm] = useState({ id: null, name: '', idNumber: '', phone: '', group: '' })
  const [query, setQuery] = useState('')
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const online = useStore((s) => s.online)
  const pendingCount = useStore((s) => s.pendingCount)
  const bootstrap = useStore((s) => s.bootstrap)
  const refresh = useStore((s) => s.refresh)
  const officer = useStore((s) => s.officer)
  const logout = useStore((s) => s.logout)
  const mustChangePassword = useStore((s) => s.mustChangePassword)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  if (!officer || !Array.isArray(officer.permissions)) return <Login />
  if (mustChangePassword || officer.must_change_password) return <ChangePassword />
  if (!(officer.permissions || []).includes('admin'))
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="q-rise w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Access denied</h1>
          <p className="text-sm text-slate-500 mb-5">
            {officer.name} ({officer.role}) — participant registration requires the Logistics Manager role.
          </p>
          <button
            onClick={() => logout()}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const isEdit = !!form.id

  const startEdit = (p) => {
    setError(null)
    setForm({ id: p.id, name: p.name, idNumber: p.idNumber, phone: p.phone, group: p.group })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetForm = () => {
    setForm({ id: '', name: '', idNumber: '', phone: '', group: '' })
    setError(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    const name = form.name.trim()
    if (!name) return setError('Name is required')
    const idNumber = form.idNumber.trim() || nextIdNumber()
    const dup = participants.find(
      (p) => p.idNumber.toLowerCase() === idNumber.toLowerCase() && p.id !== form.id
    )
    if (dup) return setError(`ID number ${idNumber} is already registered to ${dup.name}`)
    try {
      if (isEdit) {
        await update(form.id, { name, idNumber, phone: form.phone.trim(), group: form.group.trim() })
        showToast(`${name} updated`)
      } else {
        await add({ name, idNumber, phone: form.phone.trim(), group: form.group.trim() })
        showToast(`${name} registered — ID ${idNumber}`)
      }
      resetForm()
    } catch (err) {
      setError(err.message)
    }
  }

  const onDelete = async (p) => {
    if (!window.confirm(`Delete ${p.name} (${p.idNumber})?`)) return
    try {
      await remove(p.id)
      showToast(`${p.name} removed`)
    } catch (err) {
      showToast(err.message)
    }
  }

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Name', 'ID Number', 'Phone', 'Group'].join(','),
      ...participants.map((p) => [p.name, p.idNumber, p.phone, p.group].map(esc).join(',')),
    ]
    download(new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }), 'llm-participants.csv')
    showToast('Exported CSV')
  }

  const exportJson = () => {
    download(new Blob([JSON.stringify(participants, null, 2)], { type: 'application/json' }), 'llm-participants.json')
    showToast('Exported JSON')
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const raw = file.name.toLowerCase().endsWith('.csv') ? parseCsv(text) : JSON.parse(text)
      if (!Array.isArray(raw)) throw new Error('Not a list of participants')
      if (!raw.length) throw new Error('File contains no participants')
      const imported = await importAll(raw)
      showToast(`Imported ${imported.length} participant${imported.length !== 1 ? 's' : ''}`)
    } catch (err) {
      showToast(`Import failed — ${err.message}`)
    }
  }

  const q = query.trim().toLowerCase()
  const filtered = q
    ? participants.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.idNumber.toLowerCase().includes(q) ||
          p.phone.includes(q) ||
          p.group.toLowerCase().includes(q)
      )
    : participants

  const groups = {}
  for (const p of participants) groups[p.group || 'Unassigned'] = (groups[p.group || 'Unassigned'] || 0) + 1

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="./icon.svg" alt="" className="w-7 h-7" />
            <div>
              <div className="font-semibold leading-tight text-slate-900 tracking-tight">LLM Registration</div>
              <div className="text-[10px] text-slate-400 leading-tight">Participant registry — feeds LLM</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right leading-tight mr-1">
              <div className="text-sm font-medium text-slate-800">{officer.name}</div>
              <div className="text-[10px] text-slate-400">{officer.role}</div>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              Sign out
            </button>
            <button
              onClick={exportJson}
              disabled={!participants.length}
              className="hidden sm:inline-flex px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-40"
            >
              Export JSON
            </button>
            <button
              onClick={exportCsv}
              disabled={!participants.length}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-40"
            >
              Export CSV
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-sm bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              Import
            </button>
            <input ref={fileRef} type="file" accept=".json,.csv" className="hidden" onChange={handleFile} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="q-rise">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <div className="text-3xl font-semibold tabular-nums text-slate-900">{participants.length}</div>
              <div className="text-xs text-slate-500 mt-1 uppercase tracking-wide">Total</div>
            </div>
            {Object.entries(groups)
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([g, n]) => (
                <div key={g} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <div className="text-3xl font-semibold tabular-nums text-slate-900">{n}</div>
                  <div className="text-xs text-slate-500 mt-1">{g}</div>
                </div>
              ))}
          </div>
        </div>

        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5" id="form-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">{isEdit ? 'Edit participant' : 'Register participant'}</h2>
            {isEdit && (
              <button onClick={resetForm} className="text-sm text-slate-500 underline hover:text-slate-700 transition-colors">
                Cancel editing
              </button>
            )}
          </div>
          <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Full name as on ID card"
                autoFocus={!isEdit}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">ID number</label>
              <input
                value={form.idNumber}
                onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                placeholder={`Blank = auto (${nextIdNumber()})`}
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 0241001001"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Group / bus</label>
              <input
                list="group-options"
                value={form.group}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
                placeholder="e.g. Bus A"
                className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
              <datalist id="group-options">
                {['Bus A', 'Bus B', 'Bus C', 'Bus D', 'Unassigned'].map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </div>
            {error && <p className="sm:col-span-2 text-sm text-red-600 font-medium">{error}</p>}
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="w-full py-3 bg-slate-900 text-white text-base font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all duration-150"
              >
                {isEdit ? 'Save changes' : `Register participant`}
              </button>
            </div>
          </form>
        </div>

        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, ID, phone, group…"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              />
            </div>
            <span className="ml-3 text-sm text-slate-500 whitespace-nowrap tabular-nums">{filtered.length} shown</span>
          </div>

          {participants.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-500 mb-3">No participants registered yet.</p>
              <button
                onClick={() => {
                  loadSample()
                  showToast(`Loaded ${sampleParticipants.length} sample participants`)
                }}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
              >
                Load sample participants
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No matches for “{query}”</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <li key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{p.name}</div>
                    <div className="text-sm text-slate-500">
                      <span className="font-mono">{p.idNumber}</span> · {p.phone}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${
                        GROUP_COLORS[p.group] ?? 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {p.group || 'Unassigned'}
                    </span>
                    <button
                      onClick={() => startEdit(p)}
                      className="px-2.5 py-1 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(p)}
                      className="px-2.5 py-1 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-slate-400 text-center">
          Participants are stored on the LLM server. Offline edits are saved locally and sync when
          the server is reachable again.
        </p>
      </main>

      {!online && (
        <div className="q-rise-sm fixed bottom-16 left-1/2 -translate-x-1/2 z-40 bg-amber-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2">
          <span>Offline — changes saved locally</span>
          {pendingCount > 0 && (
            <button
              onClick={() => bootstrap()}
              className="bg-white/20 hover:bg-white/30 rounded px-2 py-0.5 font-semibold"
            >
              Sync {pendingCount} pending
            </button>
          )}
        </div>
      )}

      {toast && (
        <div className="q-rise-sm fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  )
}