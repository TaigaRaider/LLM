import { useState } from 'react'
import { useStore } from '../store'

export default function Login() {
  const login = useStore((s) => s.login)
  const loginError = useStore((s) => s.loginError)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    try {
      await login(username.trim(), password)
    } catch {
      /* error shown from store */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="q-rise w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <img src="./icon.svg" alt="" className="w-9 h-9" />
          <div>
            <div className="font-semibold text-slate-900 tracking-tight leading-tight">LLM Registration</div>
            <div className="text-[10px] text-slate-400 leading-tight">Participant registry — feeds LLM</div>
          </div>
        </div>
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Officer sign in</h1>
        <p className="text-sm text-slate-500 mb-5">Registration is restricted to the Logistics Manager role.</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
            />
          </div>
          {loginError && <p className="text-sm text-red-600 font-medium">{loginError}</p>}
          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all duration-150 disabled:opacity-40"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}