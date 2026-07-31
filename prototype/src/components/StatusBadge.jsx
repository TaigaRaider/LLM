import { STATUS_META } from '../store'

export default function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'bg-slate-50 text-slate-700 border-slate-200' }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.color}`}
    >
      {meta.label}
    </span>
  )
}
