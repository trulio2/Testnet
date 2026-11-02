import { useState } from 'react'
import {
  useLedger,
  useLocale,
  useMoneyFormat,
  useSymbols,
  useWallet
} from '@/modules/services'
import type { Currency } from '@/types'

type CurrencyFilter = Currency | 'all'

export default function FundsHistory() {
  const { t } = useLocale()
  const { symbols } = useSymbols()
  const { currencies, formatDateTime } = useWallet()
  const { formatMoney, formatSignedMoney } = useMoneyFormat()
  const ledger = useLedger()
  const [filter, setFilter] = useState<CurrencyFilter>('all')

  const filters: CurrencyFilter[] = ['all', ...currencies]
  const entries =
    filter === 'all'
      ? ledger
      : ledger.filter((entry) => entry.currency === filter)
  const label = (key: string) => t(`components.fundsHistory.${key}`)
  const getSymbolLabel = (id?: string) =>
    symbols.find((symbol) => symbol.id === id)?.label ?? '—'

  return (
    <section className="wallet-panel funds-history" aria-label={label('title')}>
      <header className="funds-history-header">
        <h2 className="wallet-panel-title">{label('title')}</h2>
        <div
          className="wallet-segments"
          role="group"
          aria-label={label('filter')}
        >
          {filters.map((option) => (
            <button
              key={option}
              type="button"
              className={`wallet-segment${option === filter ? ' active' : ''}`}
              aria-pressed={option === filter}
              onClick={() => setFilter(option)}
            >
              {option === 'all' ? label('all') : option}
            </button>
          ))}
        </div>
      </header>
      {entries.length === 0 ? (
        <p className="funds-history-empty">{label('empty')}</p>
      ) : (
        <div className="funds-history-scroll">
          <table className="funds-history-table">
            <thead>
              <tr>
                <th>{label('time')}</th>
                <th>{label('type')}</th>
                <th>{label('market')}</th>
                <th>{label('currency')}</th>
                <th className="numeric">{label('amount')}</th>
                <th className="numeric">{label('balance')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.time)}</td>
                  <td>{label(entry.type)}</td>
                  <td>{getSymbolLabel(entry.symbol)}</td>
                  <td>{entry.currency}</td>
                  <td
                    className={`numeric ${entry.amount >= 0 ? 'pnl-up' : 'pnl-down'}`}
                  >
                    {formatSignedMoney(entry.amount)}
                  </td>
                  <td className="numeric">{formatMoney(entry.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
