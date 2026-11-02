import { useLocale } from '@/modules/services'

export default function SessionNotice() {
  const { t } = useLocale()

  return (
    <section className="session-notice" role="status">
      <h1>{t('components.session.title')}</h1>
      <p>{t('components.session.description')}</p>
    </section>
  )
}
