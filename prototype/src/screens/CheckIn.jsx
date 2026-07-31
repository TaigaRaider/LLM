import { useState } from 'react'
import { useStore } from '../store'
import BarcodeInput from '../components/BarcodeInput'
import TagModal from '../components/TagModal'
import StatusBadge from '../components/StatusBadge'

export default function CheckIn() {
  const participants = useStore((s) => s.participants)
  const bags = useStore((s) => s.bags)
  const checkIn = useStore((s) => s.checkIn)
  const showToast = useStore((s) => s.showToast)

  const [query, setQuery] = useState('')
  const [found, setFound] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [bagCount, setBagCount] = useState(1)
  const [result, setResult] = useState(null)

  const search = () => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const hit = participants.find((p) => p.name.toLowerCase().includes(q) || p.idNumber.includes(q) || p.phone.includes(q))
    if (hit) {
      setFound(hit)
      setNotFound(false)
    } else {
      setFound(null)
      setNotFound(true)
      showToast(`No participant found for “${query.trim()}”`)
    }
  }

  const doCheckIn = () => {
    const newBags = checkIn(found.id, bagCount)
    setResult({ bags: newBags, participant: found })
    setBagCount(1)
    setQuery('')
  }

  const participantBags = found ? bags.filter((b) => b.participantId === found.id) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">
          {found ? 'Step 2 of 2 · Register bags' : 'Step 1 of 2 · Find participant'}
        </span>
        <div className="flex gap-1">
          <span className={`h-0.5 w-8 rounded-full transition-colors duration-300 ${found ? 'bg-sky-600' : 'bg-slate-200'}`} />
          <span className={`h-0.5 w-8 rounded-full transition-colors duration-300 ${found ? 'bg-sky-600' : 'bg-slate-200'}`} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <BarcodeInput label="Scan ID card or search" value={query} onChange={setQuery} onScan={search} autoFocus />
        {notFound && (
          <p className="q-rise-sm mt-3 text-sm text-red-600 font-medium">
            No participant found for “{query.trim()}” — check the registration list.
          </p>
        )}
        {found && (
          <div className="q-rise-sm mt-4 border border-sky-200 bg-sky-50/60 rounded-lg p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{found.name}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {found.idNumber} · {found.phone} · {found.group}
                </div>
              </div>
              <span className="text-xs font-semibold text-sky-700 bg-sky-100 rounded-full px-2.5 py-1">Found</span>
            </div>
            {participantBags.length > 0 && (
              <div className="mt-3 pt-3 border-t border-sky-200/70">
                <div className="text-xs text-slate-500 mb-1.5">Already tagged ({participantBags.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {participantBags.map((b) => (
                    <span
                      key={b.tagCode}
                      className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1"
                    >
                      {b.tagCode}
                      <StatusBadge status={b.status} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {found && (
        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5">
          <label className="block text-sm font-medium text-slate-700 mb-3">Bags to register</label>
          <div className="flex items-center justify-center gap-5">
            <button
              onClick={() => setBagCount(Math.max(1, bagCount - 1))}
              className="w-11 h-11 rounded-lg border border-slate-300 text-xl text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
              aria-label="Fewer bags"
            >
              −
            </button>
            <div className="w-16 text-center">
              <div key={bagCount} className="q-count text-4xl font-semibold text-slate-900 tabular-nums">
                {bagCount}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-slate-400 mt-1">bags</div>
            </div>
            <button
              onClick={() => setBagCount(Math.min(9, bagCount + 1))}
              className="w-11 h-11 rounded-lg border border-slate-300 text-xl text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors"
              aria-label="More bags"
            >
              +
            </button>
          </div>
          <button
            onClick={doCheckIn}
            className="mt-5 w-full py-3 bg-slate-900 text-white text-base font-semibold rounded-lg hover:bg-slate-800 active:scale-[0.99] transition-all duration-150"
          >
            Check in {bagCount} bag{bagCount > 1 ? 's' : ''}
          </button>
          <p className="text-xs text-slate-400 mt-2.5 text-center">
            Tag codes auto-generated · officer &amp; timestamp recorded
          </p>
        </div>
      )}

      {result && <TagModal bags={result.bags} participant={result.participant} onClose={() => setResult(null)} />}
    </div>
  )
}
