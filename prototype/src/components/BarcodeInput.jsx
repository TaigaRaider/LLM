import { useEffect, useRef } from 'react'

export default function BarcodeInput({ label, value, onChange, onScan, placeholder, disabled, autoFocus }) {
  const ref = useRef(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

  const submit = () => {
    if (value.trim() && onScan) onScan(value)
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder ?? 'Scan or type…'}
          disabled={disabled}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium text-sm hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          Go
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">USB scanner: focus this field and scan. Enter submits.</p>
    </div>
  )
}
