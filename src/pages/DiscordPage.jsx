import { useTranslation } from 'react-i18next'
import { buttonClasses } from '@/components/ui/styles'
import { usePublicSettings } from '@/features/settings/useSettings'

export function DiscordPage() {
  const { t } = useTranslation()
  const { data: settings } = usePublicSettings()
  const invite = settings?.discord_invite_url
  const rules = t('discord.rules', { returnObjects: true })

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-6xl font-extrabold uppercase">{t('discord.title')}</h1>
        <p className="text-lg text-concrete-300">{t('discord.lede')}</p>
        {invite ? (
          <a href={invite} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'discord', size: 'lg', className: 'self-start' })}>
            {t('discord.join')}
          </a>
        ) : (
          <p className="text-sm text-concrete-500">{t('discord.notConfigured')}</p>
        )}
      </div>
      <section className="flex flex-col gap-3 rounded-sm border border-carbon-600 p-5">
        <h2 className="font-display text-2xl font-semibold uppercase">{t('discord.rulesTitle')}</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-concrete-300">
          {Array.isArray(rules) && rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      </section>
    </div>
  )
}
