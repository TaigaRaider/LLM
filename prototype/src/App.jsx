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
    const poll = setInterval(() => {
      if (getToken() && officer && document.visibilityState === 'visible') refreshAll()
    }, 10000)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onFocus)
      clearInterval(poll)
    }
  }, [reloadParticipants, refreshAll, officer])

  if (!officer || !Array.isArray(officer.permissions) || !getToken()) return <Login />

  const perms = new Set(officer.permissions || [])
  const visibleTabs = TABS.filter((t) => perms.has(t.perm))
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : visibleTabs[0]?.id

  if (mustChangePassword || officer.must_change_password) return <ChangePassword />

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 bg-slate-900 flex-col z-30">
        <div className="px-5 py-5 flex items-center gap-2.5 border-b border-slate-800">
          <img src="/icon.svg" alt="" className="w-8 h-8" />
          <div>
            <div className="font-semibold text-white leading-tight tracking-tight">LLM</div>
            <div className="text-[10px] text-slate-400 leading-tight">Luggage Logistics Manager</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto no-scrollbar">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? 'bg-sky-500/15 text-sky-400'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-slate-800">
          <div className="text-sm font-medium text-slate-200">{officer.name}</div>
          <div className="text-[10px] text-slate-400 mb-2.5">{officer.role}</div>
          <button
            onClick={() => logout()}
            className="w-full px-3 py-1.5 text-sm border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <header className="md:hidden sticky top-0 z-20 bg-slate-900 border-b border-slate-800">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="w-7 h-7" />
            <div>
              <div className="font-semibold leading-tight text-white tracking-tight">LLM</div>
              <div className="text-[10px] text-slate-400 leading-tight">Luggage Logistics Manager</div>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="px-3 py-1.5 text-xs border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main key={activeTab} className="q-rise max-w-5xl mx-auto px-4 py-6 pb-24 md:pb-6 md:pl-60">
        {activeTab === 'checkin' && <CheckIn />}
        {activeTab === 'loading' && <Loading />}
        {activeTab === 'handover' && <Handover />}
        {activeTab === 'lookup' && <Lookup />}
        {activeTab === 'dashboard' && <Dashboard />}
      </main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
              activeTab === t.id
                ? 'text-sky-700 border-t-2 border-sky-600 -mt-px'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

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
