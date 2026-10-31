import { useLocale } from '@/modules/services'

function Home() {
  const { t } = useLocale()

  return (
    <div>
      <p>{t('pages.home.home')}</p>
    </div>
  )
}

export default Home
