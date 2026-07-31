import { useState } from 'react'
import { useStore } from '../store'
import BarcodeInput from '../components/BarcodeInput'
import StatusBadge from '../components/StatusBadge'

export default function Loading() {
  const bags = useStore((s) => s.bags)
  const vehicle = useStore((s) => s.vehicle)
  const loadBags = useStore((s) => s.loadBags)
  const depart = useStore((s) => s.depart)
  const showToast = useStore((s) => s.showToast)

  const [scan, setScan] = useState('')

  const loaded = bags.filter((b) => b.status === 'LOADED' || b.status === 'IN_TRANSIT' || b.status === 'UNLOADED' || b.status === 'HANDED_OVER')
  const pending = bags.filter((b) => b.status === 'CHECKED_IN')

  const onScan = (code) => {
    const tag = code.trim().toUpperCase()
    setScan('')
    if (!tag) return
    const bag = bags.find((b) => b.tagCode === tag)
    if (!bag) return showToast(`Tag ${tag} not found`)
    if (bag.status !== 'CHECKED_IN') return showToast(`${tag} is ${bag.status} — already loaded`)
    loadBags([tag])
    showToast(`${tag} loaded onto ${vehicle.code} ✓`)
  }

  const truckState = {
    AT_ORIGIN: { label: 'AT ORIGIN — loading', color: 'text-sky-600', badge: 'bg-sky-50 border-sky-200' },
    IN_TRANSIT: { label: 'IN TRANSIT', color: 'text-amber-700', badge: 'bg-amber-50 border-amber-200' },
    AT_DESTINATION: { label: 'AT DESTINATION — unloading', color: 'text-teal-700', badge: 'bg-teal-50 border-teal-200' },
  }[vehicle.status]

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Load bags onto {vehicle.code}</h2>
          <span
            className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${truckState.badge} ${truckState.color}`}
          >
            {truckState.label}
          </span>
        </div>
        <BarcodeInput
          label="Scan bag tag"
          value={scan}
          onChange={setScan}
          onScan={onScan}
          disabled={vehicle.status !== 'AT_ORIGIN'}
        />
        <div className="flex gap-6 mt-4 text-sm">
          <span className="text-slate-500">
            Loaded on truck:{' '}
            <b className="text-lg text-slate-900 tabular-nums ml-1">{loaded.length}</b>
          </span>
          <span className="text-slate-500">
            Awaiting load:{' '}
            <b className="text-lg text-slate-900 tabular-nums ml-1">{pending.length}</b>
          </span>
        </div>
        {vehicle.status === 'AT_ORIGIN' && (
          <button
            onClick={() => {
              depart()
              showToast('Manifest locked — truck departed')
            }}
            className="mt-4 w-full py-3 bg-amber-500 text-white text-base font-semibold rounded-lg hover:bg-amber-600 active:scale-[0.99] transition-all duration-150"
          >
            Confirm departure (lock manifest)
          </button>
        )}
      </div>

      {vehicle.status !== 'AT_ORIGIN' && (
        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">
            Vehicle manifest — {vehicle.code} ({loaded.length} bags)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                  <th className="py-2 pr-3 font-semibold">Tag</th>
                  <th className="py-2 pr-3 font-semibold">Participant</th>
                  <th className="py-2 pr-3 font-semibold">ID</th>
                  <th className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {loaded.map((b) => {
                  const p = useStore.getState().participants.find((x) => x.id === b.participantId)
                  return (
                    <tr key={b.tagCode} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-mono text-slate-800">{b.tagCode}</td>
                      <td className="py-2 pr-3 text-slate-700">{p.name}</td>
                      <td className="py-2 pr-3 text-slate-500">{p.idNumber}</td>
                      <td className="py-2">
                        <StatusBadge status={b.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
