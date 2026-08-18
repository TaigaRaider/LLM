import { useState } from 'react'
import { useStore } from '../store'
import BarcodeInput from '../components/BarcodeInput'
import StatusBadge from '../components/StatusBadge'

export default function Handover() {
  const participants = useStore((s) => s.participants)
  const bags = useStore((s) => s.bags)
  const handOver = useStore((s) => s.handOver)
  const unloadBag = useStore((s) => s.unloadBag)
  const unloadAll = useStore((s) => s.unloadAll)
  const showToast = useStore((s) => s.showToast)
  const vehicle = useStore((s) => s.vehicle)

  const [idScan, setIdScan] = useState('')
  const [bagScan, setBagScan] = useState('')
  const [participant, setParticipant] = useState(null)
  const [step, setStep] = useState(1)

  const onIdScan = (code) => {
    const q = code.trim().toLowerCase()
    setIdScan('')
    if (!q) return
    const hit = participants.find((p) => p.idNumber.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
    if (!hit) return showToast('ID not found — check the participant list')
    setParticipant(hit)
    setStep(2)
  }

  const onBagScan = (code) => {
    const tag = code.trim().toUpperCase()
    setBagScan('')
    if (!tag || !participant) return
    const bag = bags.find((b) => b.tagCode === tag)
    if (!bag) return showToast(`Tag ${tag} not found`)
    if (bag.participantId !== participant.id) return showToast(`MISMATCH — ${tag} belongs to a different participant`)
    if (bag.status === 'HANDED_OVER') return showToast(`${tag} already handed over`)
    if (bag.status !== 'UNLOADED') return showToast(`${tag} status is ${bag.status} — cannot hand over yet`)
    handOver(participant.id, tag)
    showToast(`${tag} handed over to ${participant.name} ✓`)
    setStep(1)
    setParticipant(null)
  }

  const outstanding = bags.filter((b) => b.status === 'UNLOADED' && b.participantId === participant?.id)
  const participantBags = participant ? bags.filter((b) => b.participantId === participant.id) : []

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-lg text-slate-900 mb-1">Handover at destination</h2>
        <p className="text-sm text-slate-500 mb-4">
          Step {step} of 2 — {step === 1 ? 'scan participant ID card first' : 'scan a bag to return'}
        </p>

        {step === 1 && (
          <BarcodeInput label="Scan participant ID" value={idScan} onChange={setIdScan} onScan={onIdScan} autoFocus />
        )}

        {step === 2 && participant && (
          <div className="q-rise-sm">
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
              <div>
                <div className="font-semibold text-slate-900">{participant.name}</div>
                <div className="text-sm text-slate-500 mt-0.5">
                  {participant.idNumber} · {participant.group}
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-700 bg-white border border-emerald-200 rounded-full px-2.5 py-1">
                ✓ ID verified
              </span>
            </div>
            <BarcodeInput label="Scan bag tag to return" value={bagScan} onChange={setBagScan} onScan={onBagScan} autoFocus />
            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-1.5">
                Bags belonging to this participant ({participantBags.length})
              </div>
              {participantBags.length === 0 ? (
                <p className="text-sm text-amber-600 font-medium">No bags on record for this participant.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {participantBags.map((b) => (
                    <span
                      key={b.tagCode}
                      className={`inline-flex items-center gap-1.5 text-xs font-mono rounded-md pl-2 pr-1 py-1 border ${
                        b.status === 'UNLOADED'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {b.tagCode}
                      <StatusBadge status={b.status} />
                      {b.status === 'IN_TRANSIT' && (
                        <button
                          onClick={() => {
                            const res = unloadBag(b.tagCode)
                            showToast(
                              res.ok
                                ? res.last
                                  ? `${b.tagCode} offloaded — last bag, truck ready to return`
                                  : `${b.tagCode} offloaded`
                                : res.reason
                            )
                          }}
                          className="ml-0.5 px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 active:scale-[0.97] transition-colors"
                        >
                          Offload
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-between items-center mt-3">
              <span className="text-sm text-slate-500 tabular-nums">
                {outstanding.length} bag{outstanding.length !== 1 ? 's' : ''} outstanding for this participant
              </span>
              <button
                onClick={() => {
                  setStep(1)
                  setParticipant(null)
                }}
                className="text-sm text-slate-500 underline hover:text-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-900">Bag status for {vehicle.code}</h3>
          <span className="text-xs font-semibold text-slate-600">{vehicle.status.replace('_', ' ')}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          {[
            { label: 'On truck (transit)', count: bags.filter((b) => b.status === 'IN_TRANSIT').length },
            { label: 'Unloaded', count: bags.filter((b) => b.status === 'UNLOADED').length },
            { label: 'Handed over', count: bags.filter((b) => b.status === 'HANDED_OVER').length },
            { label: 'Outstanding', count: bags.filter((b) => b.status === 'UNLOADED').length },
          ].map((c) => (
            <div key={c.label} className="bg-slate-50 border border-slate-200/60 rounded-lg p-3">
              <div className="text-2xl font-semibold text-slate-900 tabular-nums">{c.count}</div>
              <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>
        {vehicle.status === 'IN_TRANSIT' && (
          <button
            onClick={() => {
              unloadAll()
              showToast('Truck unloaded — all bags offloaded, ready to return to origin')
            }}
            className="mt-4 w-full py-3 bg-teal-600 text-white text-base font-semibold rounded-lg hover:bg-teal-700 active:scale-[0.99] transition-all duration-150"
          >
            Confirm arrival (offload all bags)
          </button>
        )}
      </div>
    </div>
  )
}
