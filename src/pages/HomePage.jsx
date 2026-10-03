import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ButtonLink } from '@/components/ui/Button'
import { ProductCard } from '@/features/catalog/ProductCard'
import { useFeatured } from '@/features/catalog/hooks'

const steps = ['pick', 'book', 'room', 'play']

export function HomePage() {
  const { t } = useTranslation()
  const featured = useFeatured()

  return (
    <div className="flex flex-col gap-20">
      <section className="flex flex-col gap-6 pt-6 md:pt-12">
        <p className="label">{t('home.eyebrow')}</p>
        <h1 className="max-w-4xl font-display text-6xl font-extrabold uppercase leading-[0.9] text-concrete-50 md:text-8xl">
          {t('home.title')}
        </h1>
        <p className="max-w-2xl text-lg text-concrete-300">{t('home.lede')}</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/tienda" size="lg">{t('home.ctaShop')}</ButtonLink>
          <ButtonLink to="/discord" size="lg" variant="secondary">{t('home.ctaDiscord')}</ButtonLink>
        </div>
      </section>

      <section className="flex flex-col gap-6" aria-labelledby="featured-title">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="featured-title" className="font-display text-4xl font-extrabold uppercase">{t('home.featured')}</h2>
          <Link to="/tienda" className="label text-monitor hover:text-concrete-50">{t('home.seeAll')}</Link>
        </div>
        {featured.isPending ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="aspect-3/4 animate-pulse rounded-sm bg-carbon-800" />
            ))}
          </div>
        ) : featured.data?.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.data.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-8" aria-labelledby="steps-title">
        <h2 id="steps-title" className="font-display text-4xl font-extrabold uppercase">{t('home.stepsTitle')}</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step} className="flex flex-col gap-2 border-l-2 border-carbon-500 pl-4">
              <span className="font-mono text-sm text-signal">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="font-display text-2xl font-semibold uppercase">{t(`home.steps.${step}.title`)}</h3>
              <p className="text-sm text-concrete-400">{t(`home.steps.${step}.text`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
