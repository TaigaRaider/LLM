import { useEffect, useRef, useState } from 'react'
import CameraScanner from './CameraScanner'

export default function BarcodeInput({ label, value, onChange, onScan, placeholder, disabled, autoFocus }) {
  const ref = useRef(null)
  const [scanning, setScanning] = useState(false)

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
          className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2.5 text-lg tracking-wider focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          onClick={() => setScanning(true)}
          disabled={disabled || !onScan}
          className="px-3 py-2 bg-sky-50 text-sky-700 border border-sky-300 rounded-lg hover:bg-sky-100 hover:border-sky-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Scan with camera"
          aria-label="Scan with camera"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg font-medium text-sm hover:bg-slate-800 transition-colors disabled:opacity-40"
        >
          Go
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        USB scanner: focus this field and scan. Or use the camera button.
      </p>
      {scanning && onScan && (
        <CameraScanner
          onScan={(code) => {
            onChange(code)
            onScan(code)
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  )
}
