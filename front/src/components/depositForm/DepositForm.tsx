import { type FormEvent, useState } from 'react'
import {
  useLocale,
  useMoneyFormat,
  useTradingActions,
  useWallet
} from '@/modules/services'
import type { Currency } from '@/types'

const QUICK_AMOUNTS = [1_000, 10_000, 100_000]
const MIN_AMOUNT = 0.01

interface Feedback {
  isError: boolean
  text: string
}

export default function DepositForm() {
  const { t } = useLocale()
  const { currencies, maxDeposit } = useWallet()
  const { formatMoney, formatCompactMoney, parseDecimal } = useMoneyFormat()
  const { depositFunds } = useTradingActions()
  const [currency, setCurrency] = useState<Currency>(currencies[0])
  const [amount, setAmount] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()

    const result = depositFunds(currency, parseDecimal(amount))

    if (!result.ok) {
      setFeedback({
        isError: true,
        text: t('components.depositForm.invalidAmount', {
          min: formatMoney(MIN_AMOUNT),
          max: formatMoney(maxDeposit)
        })
      })
      return
    }

    setAmount('')
    setFeedback({
      isError: false,
      text: t('components.depositForm.added', {
        amount: formatMoney(result.entry.amount),
        currency
      })
    })
  }

  return (
    <section
      className="wallet-panel deposit-form"
      aria-label={t('components.depositForm.title')}
    >
      <h2 className="wallet-panel-title">
        {t('components.depositForm.title')}
      </h2>
      <form onSubmit={handleSubmit}>
        <div
          className="wallet-segments"
          role="group"
          aria-label={t('components.depositForm.currency')}
        >
          {currencies.map((option) => (
            <button
              key={option}
              type="button"
              className={`wallet-segment${option === currency ? ' active' : ''}`}
              aria-pressed={option === currency}
              onClick={() => setCurrency(option)}
            >
              {option}
            </button>
          ))}
        </div>
        <label className="deposit-field">
          <span>{t('components.depositForm.amount', { currency })}</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <div className="deposit-quick">
          {QUICK_AMOUNTS.map((option) => (
            <button
              key={option}
              type="button"
              className="wallet-action"
              onClick={() => setAmount(String(option))}
            >
              {formatCompactMoney(option)}
            </button>
          ))}
        </div>
        <button type="submit" className="deposit-submit">
          {t('components.depositForm.submit')}
        </button>
      </form>
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
