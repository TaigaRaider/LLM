import { useState } from 'react'
import { useStore } from '../store'
import BarcodeInput from '../components/BarcodeInput'

export default function Handover() {
  const participants = useStore((s) => s.participants)
  const bags = useStore((s) => s.bags)
  const handOver = useStore((s) => s.handOver)
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
        <h3 className="font-semibold text-slate-900 mb-3">Bag status for {vehicle.code}</h3>
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
      </div>
    </div>
  )
}
