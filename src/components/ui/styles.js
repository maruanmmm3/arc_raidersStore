// Clases compartidas. Van en un archivo sin componentes para no romper el Fast Refresh.

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-sm font-display text-lg font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const buttonVariants = {
  primary: 'bg-signal text-carbon-950 hover:bg-signal-hover',
  secondary: 'border border-carbon-500 text-concrete-100 hover:border-concrete-400 hover:bg-carbon-700',
  ghost: 'text-concrete-300 hover:text-concrete-50 hover:bg-carbon-700',
  discord: 'bg-[#5865F2] text-white hover:bg-[#4752c4]',
}

const buttonSizes = {
  sm: 'h-9 px-3 text-base',
  md: 'h-11 px-5',
  lg: 'h-13 px-7 text-xl',
}

export function buttonClasses({ variant = 'primary', size = 'md', className = '' } = {}) {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`
}

// Clases completas (no interpoladas) para que Tailwind las detecte
export const rarityText = {
  common: 'text-rarity-common',
  uncommon: 'text-rarity-uncommon',
  rare: 'text-rarity-rare',
  epic: 'text-rarity-epic',
  legendary: 'text-rarity-legendary',
}

export const rarityBorder = {
  common: 'border-rarity-common',
  uncommon: 'border-rarity-uncommon',
  rare: 'border-rarity-rare',
  epic: 'border-rarity-epic',
  legendary: 'border-rarity-legendary',
}

export const rarityBg = {
  common: 'bg-rarity-common',
  uncommon: 'bg-rarity-uncommon',
  rare: 'bg-rarity-rare',
  epic: 'bg-rarity-epic',
  legendary: 'bg-rarity-legendary',
}
