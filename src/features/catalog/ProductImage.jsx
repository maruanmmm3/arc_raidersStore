import { publicImageUrl } from '@/lib/supabase'

// Silueta por categoría mientras el producto no tenga imagen propia
const silhouettes = {
  weapon: (
    <path d="M6 30h34l4-4h10v-4h6v8h-4v4H44l-2 4H30l-2 8h-8l2-8H10l-4-4z" />
  ),
  mod: (
    <path d="M22 18h20v8h6v12h-6v8H22v-8h-6V26h6zM28 26v12h8V26z" />
  ),
  blueprint: (
    <path d="M14 12h28l8 8v32H14zm6 10v4h18v-4zm0 9v4h24v-4zm0 9v4h14v-4z" />
  ),
  bundle: (
    <path d="M12 22l20-10 20 10v22L32 54 12 44zm20 0l-12-6v0l12 6 12-6zm-2 4L16 19v23l14 7z" />
  ),
}

export function ProductImage({ image, kind, alt, className = '' }) {
  const src = image ? publicImageUrl(image.storage_path) : null
  if (src) {
    return <img src={src} alt={image.alt || alt} loading="lazy" className={`h-full w-full object-contain ${className}`} />
  }
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={alt} className={`h-2/3 w-2/3 fill-carbon-500 ${className}`}>
      {silhouettes[kind] ?? silhouettes.weapon}
    </svg>
  )
}
