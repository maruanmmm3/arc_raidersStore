import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/styles'
import { usePublicSettings } from '@/features/settings/useSettings'

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true'

// Devuelve siempre un array, aunque falte la clave en un idioma
function useList(key) {
  const { t } = useTranslation('legal')
  const value = t(key, { returnObjects: true })
  return Array.isArray(value) ? value : []
}

function PageHeader({ title, lede, showUpdated }) {
  const { t } = useTranslation('legal')
  return (
    <header className="flex flex-col gap-4">
      <h1 className="font-display text-5xl font-extrabold uppercase md:text-6xl">{title}</h1>
      <p className="max-w-2xl text-lg text-concrete-300">{lede}</p>
      {showUpdated && <p className="label">{t('updated')}</p>}
      {DEMO && (
        <p className="max-w-2xl rounded-sm border border-ember/50 bg-ember/10 px-4 py-3 text-sm text-concrete-100">{t('demoNotice')}</p>
      )}
    </header>
  )
}

export function HowItWorksPage() {
  const { t } = useTranslation('legal')
  const steps = useList('howItWorks.steps')
  const prepare = useList('howItWorks.prepare')
  const times = useList('howItWorks.times')
  return (
    <div className="flex max-w-4xl flex-col gap-12">
      <PageHeader title={t('howItWorks.title')} lede={t('howItWorks.lede')} />
      <ol className="flex flex-col gap-6">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[48px_minmax(0,1fr)] gap-4">
            <span className="flex size-12 items-center justify-center rounded-sm border border-carbon-500 font-mono text-lg text-signal">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="flex flex-col gap-1 pt-1">
              <h2 className="font-display text-2xl font-semibold uppercase">{s.title}</h2>
              <p className="max-w-prose text-concrete-300">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-sm bg-carbon-800 p-5">
          <h2 className="font-display text-2xl font-semibold uppercase">{t('howItWorks.prepareTitle')}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-concrete-300">
            {prepare.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="flex flex-col gap-3 rounded-sm bg-carbon-800 p-5">
          <h2 className="font-display text-2xl font-semibold uppercase">{t('howItWorks.timesTitle')}</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-concrete-300">
            {times.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
      <ButtonLink to="/tienda" size="lg" className="self-start">{t('howItWorks.cta')}</ButtonLink>
    </div>
  )
}

export function FaqPage() {
  const { t } = useTranslation('legal')
  const items = useList('faq.items')
  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <PageHeader title={t('faq.title')} lede={t('faq.lede')} />
      <div className="flex flex-col divide-y divide-carbon-600 border-y border-carbon-600">
        {items.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-concrete-50 marker:hidden">
              {item.q}
              <span aria-hidden="true" className="font-mono text-concrete-400 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 max-w-prose text-concrete-300">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  )
}

// Términos, reembolsos y privacidad comparten estructura: { title, lede, sections: [{ title, body: [] }] }
export function LegalPage({ doc }) {
  const { t } = useTranslation('legal')
  const sections = useList(`${doc}.sections`)
  const anchor = (i) => `s${i + 1}`
  const { hash } = useLocation()

  // Enlaces como /terminos#s5 llevan directamente a esa sección
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])
  return (
    <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav className="hidden lg:block" aria-label={t('toc')}>
        <div className="sticky top-24 flex flex-col gap-2">
          <p className="label">{t('toc')}</p>
          {sections.map((s, i) => (
            <a key={s.title} href={`#${anchor(i)}`} className="text-sm text-concrete-400 hover:text-concrete-50">{s.title}</a>
          ))}
        </div>
      </nav>
      <div className="flex max-w-3xl flex-col gap-10">
        <PageHeader title={t(`${doc}.title`)} lede={t(`${doc}.lede`)} showUpdated />
        {sections.map((s, i) => (
          <section key={s.title} id={anchor(i)} className="flex scroll-mt-24 flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold uppercase">
              <span className="mr-3 font-mono text-base text-signal">{i + 1}.</span>{s.title}
            </h2>
            {s.body.map((p) => <p key={p} className="max-w-prose text-concrete-300">{p}</p>)}
          </section>
        ))}
        <p className="text-sm text-concrete-500">
          <Link to="/terminos" className="hover:text-concrete-50">{t('terms.title')}</Link> ·{' '}
          <Link to="/reembolsos" className="hover:text-concrete-50">{t('refunds.title')}</Link> ·{' '}
          <Link to="/privacidad" className="hover:text-concrete-50">{t('privacy.title')}</Link>
        </p>
      </div>
    </div>
  )
}

export function ContactPage() {
  const { t } = useTranslation('legal')
  const { data: settings } = usePublicSettings()
  const invite = settings?.discord_invite_url
  const email = settings?.contact_email
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // El email sigue visible y seleccionable
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <PageHeader title={t('contact.title')} lede={t('contact.lede')} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-sm bg-carbon-800 p-5">
          <h2 className="font-display text-2xl font-semibold uppercase">{t('contact.discordTitle')}</h2>
          <p className="text-concrete-300">{t('contact.discordText')}</p>
          {invite ? (
            <a href={invite} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'discord', className: 'self-start' })}>
              {t('contact.discordCta')}
            </a>
          ) : (
            <p className="text-sm text-concrete-500">{t('contact.discordMissing')}</p>
          )}
        </section>
        {email && (
          <section className="flex flex-col gap-3 rounded-sm bg-carbon-800 p-5">
            <h2 className="font-display text-2xl font-semibold uppercase">{t('contact.emailTitle')}</h2>
            <p className="text-concrete-300">{t('contact.emailText')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <a href={`mailto:${email}`} className="select-all font-mono text-monitor hover:text-concrete-50">{email}</a>
              <button type="button" onClick={copy} className="label hover:text-concrete-50">
                {copied ? t('contact.copied') : t('contact.copy')}
              </button>
            </div>
          </section>
        )}
      </div>
      <section className="flex flex-col gap-2 rounded-sm border border-signal/40 p-5">
        <h2 className="font-display text-xl font-semibold uppercase">{t('contact.safetyTitle')}</h2>
        <p className="text-concrete-300">{t('contact.safety')}</p>
      </section>
    </div>
  )
}
