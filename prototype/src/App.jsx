import { useEffect, useState } from 'react'
import { useStore, STATUS_META } from './store'
import { getToken } from './api'
import CheckIn from './screens/CheckIn'
import Loading from './screens/Loading'
import Handover from './screens/Handover'
import Lookup from './screens/Lookup'
import Dashboard from './screens/Dashboard'
import Login from './screens/Login'
import ChangePassword from './screens/ChangePassword'

const TABS = [
  { id: 'checkin', label: 'Check-in', perm: 'check_in' },
  { id: 'loading', label: 'Loading', perm: 'load' },
  { id: 'handover', label: 'Handover', perm: 'handover' },
  { id: 'lookup', label: 'Lookup', perm: 'lookup' },
  { id: 'dashboard', label: 'Dashboard', perm: 'admin' },
]

export default function App() {
  const [tab, setTab] = useState('checkin')
  const officer = useStore((s) => s.officer)
  const logout = useStore((s) => s.logout)
  const mustChangePassword = useStore((s) => s.mustChangePassword)
  const toast = useStore((s) => s.toast)
  const online = useStore((s) => s.online)
  const pendingCount = useStore((s) => s.pendingCount)
  const bootstrap = useStore((s) => s.bootstrap)
  const reloadParticipants = useStore((s) => s.reloadParticipants)
  const refreshAll = useStore((s) => s.refreshAll)

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'llm-participants-v1' && e.newValue !== e.oldValue) reloadParticipants()
    }
    const onFocus = () => {
      refreshAll()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
    }
  }, [reloadParticipants, refreshAll])

  if (!officer || !Array.isArray(officer.permissions) || !getToken()) return <Login />

  const perms = new Set(officer.permissions || [])
  const visibleTabs = TABS.filter((t) => perms.has(t.perm))
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id

  if (mustChangePassword || officer.must_change_password) return <ChangePassword />

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
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium text-slate-800">{officer.name}</div>
              <div className="text-[10px] text-slate-400">{officer.role}</div>
            </div>
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
        {visibleTabs.length > 0 && (
          <nav className="border-t border-slate-100 overflow-x-auto">
            <div className="flex max-w-5xl mx-auto">
              {visibleTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === t.id
                      ? 'border-sky-600 text-sky-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      <main key={activeTab} className="q-rise max-w-5xl mx-auto px-4 py-6">
        {activeTab === 'checkin' && <CheckIn />}
        {activeTab === 'loading' && <Loading />}
        {activeTab === 'handover' && <Handover />}
        {activeTab === 'lookup' && <Lookup />}
        {activeTab === 'dashboard' && <Dashboard />}
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
