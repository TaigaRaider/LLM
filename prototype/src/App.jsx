import { useState } from 'react'
import { useStore, STATUS_META } from './store'
import CheckIn from './screens/CheckIn'
import Loading from './screens/Loading'
import Handover from './screens/Handover'
import Lookup from './screens/Lookup'
import Dashboard from './screens/Dashboard'

const TABS = [
  { id: 'checkin', label: 'Check-in' },
  { id: 'loading', label: 'Loading' },
  { id: 'handover', label: 'Handover' },
  { id: 'lookup', label: 'Lookup' },
  { id: 'dashboard', label: 'Dashboard' },
]

export default function App() {
  const [tab, setTab] = useState('checkin')
  const officer = useStore((s) => s.officer)
  const setOfficer = useStore((s) => s.setOfficer)
  const officers = useStore((s) => s.officers)
  const toast = useStore((s) => s.toast)

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            <div>
              <div className="font-semibold leading-tight text-slate-900 tracking-tight">LLM</div>
              <div className="text-[10px] text-slate-400 leading-tight">Luggage Logistics Manager</div>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 hidden sm:inline text-xs font-medium uppercase tracking-wide">
              Officer
            </span>
            <select
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
              value={officer.id}
              onChange={(e) => setOfficer(officers.find((o) => o.id === e.target.value))}
            >
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {o.role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav className="border-t border-slate-100 overflow-x-auto">
          <div className="flex max-w-5xl mx-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main key={tab} className="q-rise max-w-5xl mx-auto px-4 py-6">
        {tab === 'checkin' && <CheckIn />}
        {tab === 'loading' && <Loading />}
        {tab === 'handover' && <Handover />}
        {tab === 'lookup' && <Lookup />}
        {tab === 'dashboard' && <Dashboard />}
      </main>

      {toast && (
        <div
          key={toast}
          className="q-toast fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm z-50"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

export { STATUS_META }
