import { type FormEvent, useState } from 'react'
import {
  useFeeRates,
  useLocale,
  useMoneyFormat,
  useSymbol,
  useSymbols,
  useTradingActions,
  useWallet
} from '@/modules/services'
import type { SymbolId } from '@/types'

interface Feedback {
  isError: boolean
  text: string
}

type ShowFeedback = (feedback: Feedback) => void

function FeeForm({
  symbol,
  initialMaker,
  initialTaker,
  onFeedback
}: {
  symbol: SymbolId
  initialMaker: string
  initialTaker: string
  onFeedback: ShowFeedback
}) {
  const { t } = useLocale()
  const { config } = useSymbol(symbol)
  const { feeLimits } = useWallet()
  const { parseDecimal } = useMoneyFormat()
  const { setFeeRates, resetFeeRates } = useTradingActions()
  const [maker, setMaker] = useState(initialMaker)
  const [taker, setTaker] = useState(initialTaker)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    const result = setFeeRates(symbol, {
      maker: parseDecimal(maker) / 100,
      taker: parseDecimal(taker) / 100
    })

    onFeedback(
      result.ok
        ? {
            isError: false,
            text: t('components.feeSettings.saved', { symbol: config.label })
          }
        : {
            isError: true,
            text: t('components.feeSettings.invalid', {
              minMaker: feeLimits.minMakerPercent,
              max: feeLimits.maxPercent
            })
          }
    )
  }

  const handleDefaults = () => {
    resetFeeRates(symbol)
    onFeedback({
      isError: false,
      text: t('components.feeSettings.restored', { symbol: config.label })
    })
  }

  return (
    <form className="fee-form" onSubmit={handleSubmit}>
      <span className="fee-form-symbol">{config.label}</span>
      <label className="deposit-field">
        <span>{t('components.feeSettings.maker')}</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          value={maker}
          onChange={(event) => setMaker(event.target.value)}
        />
      </label>
      <label className="deposit-field">
        <span>{t('components.feeSettings.taker')}</span>
        <input
          inputMode="decimal"
          autoComplete="off"
          value={taker}
          onChange={(event) => setTaker(event.target.value)}
        />
      </label>
      <button type="submit" className="wallet-action">
        {t('components.feeSettings.save')}
      </button>
      <button type="button" className="wallet-action" onClick={handleDefaults}>
        {t('components.feeSettings.defaults')}
      </button>
    </form>
  )
}

function SymbolFees({
  symbol,
  onFeedback
}: {
  symbol: SymbolId
  onFeedback: ShowFeedback
}) {
  const { makerInput, takerInput } = useFeeRates(symbol)

  // Keyed by the saved rates so the inputs follow them after a save or restore.
  return (
    <FeeForm
      key={`${makerInput}:${takerInput}`}
      symbol={symbol}
      initialMaker={makerInput}
      initialTaker={takerInput}
      onFeedback={onFeedback}
    />
  )
}

export default function FeeSettings() {
  const { t } = useLocale()
  const { symbols } = useSymbols()
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  return (
    <section
      className="wallet-panel fee-settings"
      aria-label={t('components.feeSettings.title')}
    >
      <h2 className="wallet-panel-title">
        {t('components.feeSettings.title')}
      </h2>
      <p className="fee-settings-note">{t('components.feeSettings.note')}</p>
      {symbols.map(({ id }) => (
        <SymbolFees key={id} symbol={id} onFeedback={setFeedback} />
      ))}
      {feedback && (
        <p
          className={`deposit-feedback${feedback.isError ? ' deposit-feedback-error' : ''}`}
          role="status"
        >
          {feedback.text}
        </p>
      )}
    </section>
  )
}
