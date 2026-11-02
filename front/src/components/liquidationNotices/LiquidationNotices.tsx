import {
  useLiquidationNotices,
  useLocale,
  useSymbol,
  useTradingActions
} from '@/modules/services'
import type { LiquidationNotice } from '@/types'

function NoticeRow({ notice }: { notice: LiquidationNotice }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(notice.symbol)

  return (
    <li>
      {t('components.liquidation.message', {
        side: t(
          `components.ordersPanel.${notice.qty > 0 ? 'long' : 'short'}`
        ).toLowerCase(),
        symbol: config.label,
        qty: formatQty(Math.abs(notice.qty)),
        price: formatPrice(notice.price),
        quote: config.quote
      })}
    </li>
  )
}

export default function LiquidationNotices() {
  const { t } = useLocale()
  const notices = useLiquidationNotices()
  const { dismissLiquidationNotices } = useTradingActions()

  if (notices.length === 0) return null

  return (
    <div className="liquidation-notices" role="alert">
      <ul>
        {notices.map((notice) => (
          <NoticeRow key={notice.id} notice={notice} />
        ))}
      </ul>
      <button type="button" onClick={dismissLiquidationNotices}>
        {t('components.liquidation.dismiss')}
      </button>
    </div>
  )
}
