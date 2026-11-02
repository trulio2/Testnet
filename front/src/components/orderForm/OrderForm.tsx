import { useState } from 'react'
import {
  useConnectionStatus,
  useLocale,
  useMarkPrice,
  useMoneyFormat,
  useOrderDraft,
  useSymbol,
  useTradingActions
} from '@/modules/services'
import type { OrderType, SymbolId, TradeSide } from '@/types'

const ORDER_TYPES: OrderType[] = ['market', 'limit']

interface Feedback {
  isError: boolean
  text: string
}

export default function OrderForm({ symbol }: { symbol: SymbolId }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(symbol)
  const { formatMoney, parseDecimal } = useMoneyFormat()
  const draft = useOrderDraft(symbol)
  const markPrice = useMarkPrice(symbol)
  const status = useConnectionStatus()
  const { placeOrder, updateOrderDraft } = useTradingActions()
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const isLimit = draft.type === 'limit'
  const qty = parseDecimal(draft.qty)
  const referencePrice = isLimit ? parseDecimal(draft.price) : markPrice
  const orderValue = referencePrice === undefined ? NaN : qty * referencePrice
  const isLive = status === 'live'

  const selectType = (type: OrderType) => {
    const price =
      type === 'limit' && !draft.price && markPrice !== undefined
        ? markPrice.toFixed(config.priceDecimals)
        : draft.price

    updateOrderDraft(symbol, { type, price })
  }

  const submit = (side: TradeSide) => {
    const result = placeOrder({
      symbol,
      side,
      type: draft.type,
      qty,
      price: isLimit ? parseDecimal(draft.price) : undefined
    })

    if (!result.ok) {
      setFeedback({
        isError: true,
        text: t(`components.orderForm.errors.${result.reason}`, {
          min: config.minNotional,
          quote: config.quote
        })
      })
    } else if (result.fill) {
      setFeedback({
        isError: false,
        text: t('components.orderForm.filled', {
          qty: formatQty(result.fill.qty),
          price: formatPrice(result.fill.price)
        })
      })
    } else {
      setFeedback({ isError: false, text: t('components.orderForm.placed') })
    }
  }

  return (
    <section
      className="order-form"
      aria-label={t('components.orderForm.title')}
    >
      <h2 className="trade-panel-title">{t('components.orderForm.title')}</h2>
      <div className="order-form-body">
        <div
          className="order-type-tabs"
          role="group"
          aria-label={t('components.orderForm.type')}
        >
          {ORDER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={`order-type-tab${type === draft.type ? ' active' : ''}`}
              aria-pressed={type === draft.type}
              onClick={() => selectType(type)}
            >
              {t(`components.orderForm.${type}`)}
            </button>
          ))}
        </div>

        <label className="order-field">
          <span>{t('components.orderForm.size', { unit: config.base })}</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={draft.qty}
            onChange={(event) =>
              updateOrderDraft(symbol, { qty: event.target.value })
            }
          />
        </label>

        {isLimit ? (
          <label className="order-field">
            <span>
              {t('components.orderForm.price', { unit: config.quote })}
            </span>
            <input
              inputMode="decimal"
              autoComplete="off"
              value={draft.price}
              onChange={(event) =>
                updateOrderDraft(symbol, { price: event.target.value })
              }
            />
          </label>
        ) : (
          <p className="order-market-note">
            {t('components.orderForm.marketNote')}
          </p>
        )}

        <dl className="order-preview">
          <dt>{t('components.orderForm.orderValue')}</dt>
          <dd>
            {Number.isFinite(orderValue)
              ? `${formatMoney(orderValue)} ${config.quote}`
              : '—'}
          </dd>
        </dl>

        <div className="order-actions">
          <button
            type="button"
            className="order-submit order-submit-buy"
            disabled={!isLive}
            onClick={() => submit('buy')}
          >
            {t('components.orderForm.buy')}
          </button>
          <button
            type="button"
            className="order-submit order-submit-sell"
            disabled={!isLive}
            onClick={() => submit('sell')}
          >
            {t('components.orderForm.sell')}
          </button>
        </div>

        {feedback && (
          <p
            className={`order-feedback${feedback.isError ? ' order-feedback-error' : ''}`}
            role="status"
          >
            {feedback.text}
          </p>
        )}
      </div>
    </section>
  )
}
