import { useState } from 'react'
import { useStore } from '../store'
import BarcodeInput from '../components/BarcodeInput'
import StatusBadge from '../components/StatusBadge'

const EVENT_COLORS = {
  CHECKED_IN: 'bg-sky-500',
  LOADED: 'bg-violet-500',
  IN_TRANSIT: 'bg-amber-500',
  UNLOADED: 'bg-teal-500',
  HANDED_OVER: 'bg-emerald-500',
  LOST: 'bg-red-500',
}

export default function Lookup() {
  const bags = useStore((s) => s.bags) || []
  const participants = useStore((s) => s.participants) || []
  const markLost = useStore((s) => s.markLost)
  const recoverBag = useStore((s) => s.recoverBag)
  const showToast = useStore((s) => s.showToast)
  const officer = useStore((s) => s.officer)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const canManageLost = (officer?.permissions || []).some((p) => p === 'handover' || p === 'admin')

  const search = (code) => {
    const q = (code ?? query).trim()
    if (!q) return
    const qUpper = q.toUpperCase()
    const qLower = q.toLowerCase()
    const qDigits = q.replace(/\D/g, '')
    const bag = bags.find((b) => b.tagCode === qUpper)
    const participant = participants.find((p) => {
      const nameMatch = p.name.toLowerCase().includes(qLower)
      const idMatch = p.idNumber.toLowerCase().includes(qLower) || (qDigits && p.idNumber.replace(/\D/g, '').includes(qDigits))
      return nameMatch || idMatch
    })
    if (bag || participant) {
      setResult({ bag, participant })
      setError(null)
      setQuery('')
    } else {
      setResult(null)
      setError(`Nothing found for “${q}”`)
    }
  }

  const ownerOf = (id) => participants.find((p) => p.id === id) ?? { name: 'Unknown participant', idNumber: '—' }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-lg text-slate-900 mb-4">Audit lookup</h2>
        <BarcodeInput label="Scan bag tag or search participant (name / ID)" value={query} onChange={setQuery} onScan={search} autoFocus />
        {error && (
          <p className="q-rise-sm mt-3 text-sm text-red-600 font-medium">{error}</p>
        )}
      </div>

      {result?.bag && (
        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-mono font-bold text-xl text-slate-900">{result.bag.tagCode}</h3>
              <p className="text-sm text-slate-500 mt-0.5">
                Owner: {ownerOf(result.bag.participantId).name} ({ownerOf(result.bag.participantId).idNumber})
              </p>
            </div>
            <StatusBadge status={result.bag.status} />
          </div>
          {canManageLost && (
            <div className="flex gap-2 mb-4">
              {result.bag.status === 'LOST' ? (
                <button
                  onClick={async () => {
                    const res = await recoverBag(result.bag.tagCode)
                    showToast(res.reason)
                    setResult({ ...result, bag: { ...result.bag, status: 'UNLOADED' } })
                  }}
                  className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
                >
                  Recover bag
                </button>
              ) : (
                result.bag.status !== 'HANDED_OVER' && (
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Mark ${result.bag.tagCode} as lost?`)) return
                      const res = await markLost(result.bag.tagCode, 'Marked lost in lookup')
                      showToast(res.reason)
                      setResult({ ...result, bag: { ...result.bag, status: 'LOST' } })
                    }}
                    className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                  >
                    Mark lost
                  </button>
                )
              )}
            </div>
          )}
          <div className="relative pl-6">
            {result.bag.timeline.map((e, i) => (
              <div key={i} className="relative pb-5 last:pb-0">
                <span className={`absolute -left-6 top-1 w-3 h-3 rounded-full ${EVENT_COLORS[e.event]} ring-4 ring-white`} />
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-slate-800">{e.event.replace('_', ' ')}</span>
                  <span className="text-xs text-slate-400 font-mono tabular-nums">{e.time}</span>
                </div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {e.officer} — {e.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result?.participant && (
        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-lg text-slate-900 mb-1">{result.participant.name}</h3>
          <p className="text-sm text-slate-500 mb-4">
            {result.participant.idNumber} · {result.participant.phone} · {result.participant.group}
          </p>
          <div className="space-y-2">
            {bags
              .filter((b) => b.participantId === result.participant.id)
              .map((b) => (
                <div key={b.tagCode} className="flex items-center justify-between bg-slate-50 border border-slate-200/60 rounded-lg px-3 py-2">
                  <span className="font-mono text-slate-800">{b.tagCode}</span>
                  <StatusBadge status={b.status} />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
