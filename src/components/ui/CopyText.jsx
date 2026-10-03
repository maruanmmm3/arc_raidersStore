import { useState } from 'react'

// Texto seleccionable con botón "Copiar" (si el navegador no deja copiar, el texto sigue a mano)
export function CopyText({ text, label = 'Copiar', className = '' }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Sin permiso de portapapeles
    }
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="select-all font-mono">{text}</span>
      <button type="button" onClick={copy} className="label hover:text-concrete-50" aria-label={`${label} ${text}`}>
        {copied ? 'Copiado' : label}
      </button>
    </span>
  )
}
