import { useState } from 'react'
import {
  useAccountSummary,
  useConnectionStatus,
  useFeeRates,
  useLeverage,
  useLocale,
  useMarkPrice,
  useMoneyFormat,
  useOrderDraft,
  useSpendable,
  useSpotHolding,
  useSymbol,
  useTradeMode,
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
  const { leverage, options: leverageOptions } = useLeverage(symbol)
  const { makerLabel, takerLabel } = useFeeRates(symbol)
  const { availableMargin } = useAccountSummary(config.quote)
  const tradeMode = useTradeMode(symbol)
  const spendable = useSpendable(config.quote)
  const spotHolding = useSpotHolding(symbol)
  const { placeOrder, setLeverage, setTradeMode, updateOrderDraft } =
    useTradingActions()
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const isLimit = draft.type === 'limit'
  const qty = parseDecimal(draft.qty)
  const referencePrice = isLimit ? parseDecimal(draft.price) : markPrice
  const orderValue = referencePrice === undefined ? NaN : qty * referencePrice
  const isLive = status === 'live'
  const isSpot = tradeMode === 'spot'
  const buyingPower = Math.max(availableMargin, 0) * leverage

  const selectLeverage = (option: number) => {
    const result = setLeverage(symbol, option)

    if (result.ok) setTradeMode(symbol, 'margin')

    setFeedback(
      result.ok
        ? null
        : {
            isError: true,
            text: t('components.orderForm.leverageRejected', {
              quote: config.quote,
              leverage: option
            })
          }
    )
  }

  const selectSpot = () => {
    setTradeMode(symbol, 'spot')
    setFeedback(null)
  }

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
      market: tradeMode,
      qty,
      price: isLimit ? parseDecimal(draft.price) : undefined
    })

    if (!result.ok) {
      setFeedback({
        isError: true,
        text: t(`components.orderForm.errors.${result.reason}`, {
          min: config.minNotional,
          quote: config.quote,
          base: config.base,
          available: formatQty(spotHolding.availableQty)
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
        <div className="order-leverage">
          <span id="order-leverage-label">
            {t('components.orderForm.mode')}
          </span>
          <div role="group" aria-labelledby="order-leverage-label">
            <button
              type="button"
              className={isSpot ? 'active' : undefined}
              aria-pressed={isSpot}
              onClick={selectSpot}
            >
              {t('components.orderForm.spot')}
            </button>
            {leverageOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  !isSpot && option === leverage ? 'active' : undefined
                }
                aria-pressed={!isSpot && option === leverage}
                onClick={() => selectLeverage(option)}
              >
                {option}x
              </button>
            ))}
          </div>
        </div>

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
          {isSpot ? (
            <>
              <dt>
                {t('components.orderForm.canSpend', { asset: config.quote })}
              </dt>
              <dd>{formatMoney(spendable)}</dd>
              <dt>
                {t('components.orderForm.spotBalance', { asset: config.base })}
              </dt>
              <dd>{formatQty(spotHolding.qty)}</dd>
              <dt>
                {t('components.orderForm.canSell', { asset: config.base })}
              </dt>
              <dd>{formatQty(spotHolding.availableQty)}</dd>
            </>
          ) : (
            <>
              <dt>{t('components.orderForm.margin')}</dt>
              <dd>
                {Number.isFinite(orderValue)
                  ? `${formatMoney(orderValue / leverage)} ${config.quote}`
                  : '—'}
              </dd>
              <dt>{t('components.orderForm.buyingPower')}</dt>
              <dd>
                {formatMoney(buyingPower)} {config.quote}
              </dd>
            </>
          )}
          <dt>{t('components.orderForm.fees')}</dt>
          <dd>
            {makerLabel}% / {takerLabel}%
          </dd>
        </dl>

        <div className="order-actions">
          <button
            type="button"
            className="order-submit order-submit-buy"
            disabled={!isLive}
            onClick={() => submit('buy')}
          >
            {t(`components.orderForm.${isSpot ? 'buySpot' : 'buy'}`)}
          </button>
          <button
            type="button"
            className="order-submit order-submit-sell"
            disabled={!isLive}
            onClick={() => submit('sell')}
          >
            {t(`components.orderForm.${isSpot ? 'sellSpot' : 'sell'}`)}
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
