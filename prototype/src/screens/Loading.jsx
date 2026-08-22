import { useState } from 'react'
import { useStore } from '../store'
import BarcodeInput from '../components/BarcodeInput'
import StatusBadge from '../components/StatusBadge'

const VEHICLE_META = {
  AT_ORIGIN: { label: 'AT ORIGIN — loading', color: 'text-sky-600', badge: 'bg-sky-50 border-sky-200' },
  IN_TRANSIT: { label: 'IN TRANSIT', color: 'text-amber-700', badge: 'bg-amber-50 border-amber-200' },
  AT_DESTINATION: { label: 'AT DESTINATION — unloading', color: 'text-teal-700', badge: 'bg-teal-50 border-teal-200' },
}

export default function Loading() {
  const bags = useStore((s) => s.bags) || []
  const vehicles = useStore((s) => s.vehicles) || []
  const vehicle = useStore((s) => s.vehicle) || { code: 'TRUCK-01', status: 'AT_ORIGIN' }
  const loadBags = useStore((s) => s.loadBags)
  const depart = useStore((s) => s.depart)
  const returnToOrigin = useStore((s) => s.returnToOrigin)
  const showToast = useStore((s) => s.showToast)

  const list = vehicles.length ? vehicles : [vehicle]
  const [selected, setSelected] = useState(list[0]?.code ?? 'TRUCK-01')
  const [scan, setScan] = useState('')

  const activeVehicle = list.find((v) => v.code === selected) ?? list[0]
  const onTruck = bags.filter(
    (b) => b?.vehicle === activeVehicle.code && (b?.status === 'LOADED' || b?.status === 'IN_TRANSIT')
  )
  const pending = bags.filter((b) => b?.status === 'CHECKED_IN')

  const onScan = async (code) => {
    const tag = code.trim().toUpperCase()
    setScan('')
    if (!tag) return
    const bag = bags.find((b) => b.tagCode === tag)
    if (!bag) return showToast(`Tag ${tag} not found`)
    if (bag.status !== 'CHECKED_IN') return showToast(`${tag} is ${bag.status} — already loaded`)
    const ok = await loadBags([tag], activeVehicle.code)
    if (ok) showToast(`${tag} loaded onto ${activeVehicle.code} ✓`)
  }

  const confirmDeparture = async () => {
    if (onTruck.length === 0) {
      if (!window.confirm('No bags are loaded on this vehicle. Confirm departure anyway?')) return
    } else if (pending.length > 0) {
      if (!window.confirm(`${pending.length} checked-in bag${pending.length !== 1 ? 's' : ''} are not loaded yet. Depart without them?`)) return
    }
    await depart(activeVehicle.code)
    showToast('Manifest locked — vehicle departed')
  }

  const truckState = VEHICLE_META[activeVehicle.status] ?? VEHICLE_META.AT_ORIGIN

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Load bags onto {activeVehicle.code}</h2>
          <span
            className={`text-xs font-semibold border rounded-full px-2.5 py-1 ${truckState.badge} ${truckState.color}`}
          >
            {truckState.label}
          </span>
        </div>

        {list.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {list.map((v) => {
              const meta = VEHICLE_META[v.status] ?? VEHICLE_META.AT_ORIGIN
              const count = bags.filter(
                (b) => b.vehicle === v.code && (b.status === 'LOADED' || b.status === 'IN_TRANSIT')
              ).length
              return (
                <button
                  key={v.code}
                  onClick={() => setSelected(v.code)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    v.code === activeVehicle.code
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {v.code} · {count} bag{count !== 1 ? 's' : ''}
                  <span className={`ml-2 text-[10px] uppercase font-semibold ${meta.color}`}>
                    {v.status.replace('_', ' ')}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <BarcodeInput
          label="Scan bag tag"
          value={scan}
          onChange={setScan}
          onScan={onScan}
          disabled={activeVehicle.status !== 'AT_ORIGIN'}
        />
        <div className="flex gap-6 mt-4 text-sm">
          <span className="text-slate-500">
            Loaded on {activeVehicle.code}:{' '}
            <b className="text-lg text-slate-900 tabular-nums ml-1">{onTruck.length}</b>
          </span>
          <span className="text-slate-500">
            Awaiting load:{' '}
            <b className="text-lg text-slate-900 tabular-nums ml-1">{pending.length}</b>
          </span>
        </div>
        {activeVehicle.status === 'AT_ORIGIN' && (
          <button
            onClick={confirmDeparture}
            className="mt-4 w-full py-3 bg-amber-500 text-white text-base font-semibold rounded-lg hover:bg-amber-600 active:scale-[0.99] transition-all duration-150"
          >
            Confirm departure (lock manifest)
          </button>
        )}
        {activeVehicle.status === 'AT_DESTINATION' && (
          <button
            onClick={async () => {
              await returnToOrigin(activeVehicle.code)
              showToast(`${activeVehicle.code} returned to origin — ready to load`)
            }}
            className="mt-4 w-full py-3 bg-teal-600 text-white text-base font-semibold rounded-lg hover:bg-teal-700 active:scale-[0.99] transition-all duration-150"
          >
            Return {activeVehicle.code} to origin
          </button>
        )}
      </div>

      {activeVehicle.status !== 'AT_ORIGIN' && (
        <div className="q-rise-sm bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">
            Vehicle manifest — {activeVehicle.code} ({onTruck.length} bags)
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
                {onTruck.map((b) => {
                  const p = useStore.getState().participants.find((x) => x.id === b.participantId)
                  return (
                    <tr key={b.tagCode} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 font-mono text-slate-800">{b.tagCode}</td>
                      <td className="py-2 pr-3 text-slate-700">{p?.name ?? 'Unknown participant'}</td>
                      <td className="py-2 pr-3 text-slate-500">{p?.idNumber ?? '—'}</td>
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