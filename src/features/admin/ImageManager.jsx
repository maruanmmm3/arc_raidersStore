import { useState } from 'react'
import { publicImageUrl } from '@/lib/supabase'
import { Alert } from '@/components/ui/Field'
import { IMAGE_TYPES, MAX_IMAGE_BYTES, useImageActions, useUploadImage } from './productsApi'

// Imágenes del producto: subir (PNG, JPG o WebP hasta 5 MB), texto alternativo, orden y borrar
export function ImageManager({ productId, images }) {
  const upload = useUploadImage(productId)
  const actions = useImageActions()
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(0)
  const sorted = [...images].sort((a, b) => a.sort - b.sort)

  const onFiles = async (fileList) => {
    setError(null)
    const files = [...fileList]
    const invalid = files.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE_BYTES)
    if (invalid) {
      setError(`"${invalid.name}" no es válida: usa PNG, JPG o WebP de hasta 5 MB.`)
      return
    }
    let sort = sorted.length ? sorted[sorted.length - 1].sort + 1 : 0
    setUploading(files.length)
    for (const file of files) {
      try {
        await upload.mutateAsync({ file, alt: '', sort: sort++ })
      } catch {
        setError(`No se ha podido subir "${file.name}".`)
      }
      setUploading((n) => n - 1)
    }
  }

  // Intercambia el orden con la vecina
  const move = (index, dir) => {
    const a = sorted[index]
    const b = sorted[index + dir]
    if (!a || !b) return
    actions.mutate({ op: 'update', image: a, values: { sort: b.sort } })
    actions.mutate({ op: 'update', image: b, values: { sort: a.sort } })
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-2 rounded-sm bg-carbon-850 p-2">
              <div className="flex aspect-square items-center justify-center rounded-sm bg-carbon-800">
                <img src={publicImageUrl(img.storage_path)} alt={img.alt || ''} className="max-h-full max-w-full object-contain" />
              </div>
              {i === 0 && <span className="label text-ember">Principal</span>}
              <label className="sr-only" htmlFor={`alt-${img.id}`}>Texto alternativo</label>
              <input
                id={`alt-${img.id}`}
                defaultValue={img.alt ?? ''}
                placeholder="Texto alternativo"
                onBlur={(e) => {
                  if (e.target.value !== (img.alt ?? '')) actions.mutate({ op: 'update', image: img, values: { alt: e.target.value || null } })
                }}
                className="rounded-sm border border-carbon-500 bg-carbon-900 px-2 py-1 text-xs text-concrete-50 focus:border-monitor focus:outline-none"
              />
              <div className="flex justify-between gap-1">
                <button type="button" className="label disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Mover antes">←</button>
                <button type="button" className="label disabled:opacity-30" disabled={i === sorted.length - 1} onClick={() => move(i, 1)} aria-label="Mover después">→</button>
                <button type="button" className="label hover:text-signal-hover" onClick={() => actions.mutate({ op: 'delete', image: img })}>Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-sm border border-dashed border-carbon-500 px-4 py-8 text-center hover:border-concrete-400">
        <span className="text-sm text-concrete-300">
          {uploading > 0 ? `Subiendo ${uploading}…` : 'Haz clic para subir imágenes (PNG, JPG o WebP, máx. 5 MB)'}
        </span>
        <input
          type="file"
          accept={IMAGE_TYPES.join(',')}
          multiple
          className="sr-only"
          disabled={uploading > 0}
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {error && <Alert>{error}</Alert>}
      {actions.isError && <Alert>No se ha podido actualizar la imagen.</Alert>}
    </div>
  )
}
