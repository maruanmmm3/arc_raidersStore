import { useTranslation } from 'react-i18next'
import { rarityBg, rarityText } from './styles'

// El color siempre va acompañado del nombre de la rareza
export function RarityBadge({ rarity }) {
  const { t } = useTranslation('catalog')
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider ${rarityText[rarity]}`}>
      <span className={`size-2 rotate-45 ${rarityBg[rarity]}`} aria-hidden="true" />
      {t(`rarity.${rarity}`)}
    </span>
  )
}
