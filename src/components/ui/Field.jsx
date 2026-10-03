import { useId } from 'react'

const control =
  'w-full rounded-sm border border-carbon-500 bg-carbon-850 px-3 py-2.5 text-concrete-50 placeholder:text-concrete-500 focus:border-monitor focus:outline-none aria-[invalid=true]:border-signal'

// Etiqueta + control + ayuda/error con los atributos ARIA conectados
export function Field({ label, hint, error, children }) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-concrete-300">
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-signal-hover">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-concrete-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Input(props) {
  return <input className={control} {...props} />
}

export function Select({ children, ...props }) {
  return (
    <select className={control} {...props}>
      {children}
    </select>
  )
}

export function Alert({ tone = 'error', children }) {
  const tones = {
    error: 'border-signal/60 bg-signal/10 text-concrete-50',
    success: 'border-valve/60 bg-valve/10 text-concrete-50',
    info: 'border-monitor/60 bg-monitor/10 text-concrete-50',
  }
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-sm border px-4 py-3 text-sm ${tones[tone]}`}>
      {children}
    </div>
  )
}
