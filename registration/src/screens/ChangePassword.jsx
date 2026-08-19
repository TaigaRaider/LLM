import { useState } from 'react'
import { useStore } from '../store'

export default function ChangePassword() {
  const officer = useStore((s) => s.officer)
  const changePassword = useStore((s) => s.changePassword)
  const logout = useStore((s) => s.logout)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (next.length < 6) return setError('New password must be at least 6 characters')
    if (next !== confirm) return setError('Passwords do not match')
    setBusy(true)
    try {
      await changePassword(current, next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="q-rise w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <h1 className="text-lg font-semibold text-slate-900 mb-1">Change your password</h1>
        <p className="text-sm text-slate-500 mb-5">
          {officer?.name} — your password was issued by an administrator and must be changed before you can continue.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Current password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">New password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
            />
          </div>
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          <button
            type="submit"
            disabled={busy || !current || !next || !confirm}
            className="w-full py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all duration-150 disabled:opacity-40"
          >
            {busy ? 'Saving…' : 'Save new password'}
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full py-2 text-sm text-slate-500 underline hover:text-slate-700 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}