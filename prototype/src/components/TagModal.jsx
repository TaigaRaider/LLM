import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

export function TagItem({ bag, participant }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const available = (el.parentElement?.clientWidth ?? 400) - 40
    const barWidth = Math.max(0.8, Math.min(2, available / 128))
    JsBarcode(el, bag.tagCode, { format: 'CODE128', width: barWidth, height: 50, displayValue: false, margin: 8 })
  }, [bag.tagCode])
  return (
    <div className="border-2 border-dashed border-slate-300 rounded-lg p-3 text-center break-inside-avoid">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Luggage tag</div>
      <div className="font-mono text-xl font-bold text-slate-900">{bag.tagCode}</div>
      <svg ref={ref} className="mx-auto my-2 block" />
      <div className="text-sm font-medium text-slate-700">{participant.name}</div>
      <div className="text-xs text-slate-500">{participant.idNumber}</div>
    </div>
  )
}

export default function TagModal({ bags, participant, onClose }) {
  return (
    <div className="q-fade fixed inset-0 bg-slate-900/30 z-40 flex items-center justify-center p-4">
      <div className="q-pop bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-lg text-slate-900">Tags &amp; receipt</h3>
            <p className="text-sm text-slate-500">
              {participant.name} · {bags.length} bag{bags.length > 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none px-2 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div id="print-area" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bags.map((bag) => (
            <TagItem key={bag.tagCode} bag={bag} participant={participant} />
          ))}
          <div className="col-span-full border-t border-slate-200 pt-3 text-sm">
            <div className="font-semibold text-slate-800">Receipt</div>
            <p className="text-slate-600 mt-0.5">
              {bags.map((b) => b.tagCode).join(', ')} — keep this for handover at destination.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => window.print()}
            className="flex-1 py-2.5 bg-slate-900 text-white rounded-lg font-semibold text-sm hover:bg-slate-800 transition-colors"
          >
            Print tags
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-slate-300 rounded-lg font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}