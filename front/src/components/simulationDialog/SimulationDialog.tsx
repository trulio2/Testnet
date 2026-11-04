import { useEffect, useRef } from 'react'
import {
  useLocale,
  useMoneyFormat,
  useSimulation,
  useSymbol,
  useTradingActions,
  useWallet
} from '@/modules/services'
import type { SimulationEvent, SimulationRun } from '@/types'

function EventRow({ event }: { event: SimulationEvent }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(event.symbol)
  const { formatDateTime } = useWallet()
  const price = formatPrice(event.price)

  return (
    <li>
      <time>{formatDateTime(event.time)}</time>
      <span>
        {event.kind === 'fill'
          ? t('components.simulation.fill', {
              market: t(`components.ordersPanel.${event.market}`),
              side: t(`components.ordersPanel.${event.side}`),
              qty: formatQty(event.qty),
              base: config.base,
              symbol: config.label,
              price,
              quote: config.quote
            })
          : t('components.liquidation.message', {
              side: t(
                `components.ordersPanel.${event.qty > 0 ? 'long' : 'short'}`
              ).toLowerCase(),
              symbol: config.label,
              qty: formatQty(Math.abs(event.qty)),
              price,
              quote: config.quote
            })}
        {event.kind === 'liquidation' && event.cancelledOrders > 0 && (
          <small>
            {t('components.simulation.cancelled', {
              count: event.cancelledOrders
            })}
          </small>
        )}
        {event.estimated && (
          <small>{t('components.simulation.estimated')}</small>
        )}
      </span>
    </li>
  )
}

function SimulationWindow({ run }: { run: SimulationRun }) {
  const { t } = useLocale()
  const { formatDateTime } = useWallet()
  const { formatMoney, formatSignedMoney } = useMoneyFormat()
  const { dismissSimulation, retrySimulation } = useTradingActions()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const logRef = useRef<HTMLOListElement>(null)
  const isDone = run.status === 'done'
  const eventCount = run.events.length

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    const log = logRef.current

    if (log) log.scrollTop = log.scrollHeight
  }, [eventCount])

  return (
    <dialog
      ref={dialogRef}
      className={`simulation-dialog${run.isVisible ? '' : ' is-silent'}`}
      aria-labelledby="simulation-title"
      aria-busy={run.status === 'running'}
      closedby={isDone ? 'closerequest' : 'none'}
      onCancel={(event) => {
        event.preventDefault()

        if (isDone) dismissSimulation()
      }}
      onClose={() => dialogRef.current?.showModal()}
    >
      <h2 id="simulation-title">{t('components.simulation.title')}</h2>
      {run.status === 'running' && (
        <div className="simulation-status" role="status">
          <span className="spinner" aria-hidden="true" />
          <p>
            {t('components.simulation.running')}
            <small>
              {t('components.simulation.checkedUpTo', {
                time: formatDateTime(run.checkedUpTo)
              })}
            </small>
          </p>
        </div>
      )}
      {run.status === 'failed' && (
        <div className="simulation-status" role="alert">
          <p>{t('components.simulation.failed')}</p>
          <button type="button" onClick={retrySimulation}>
            {t('components.simulation.retry')}
          </button>
        </div>
      )}
      {eventCount > 0 ? (
        <ol ref={logRef} className="simulation-log">
          {run.events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </ol>
      ) : (
        isDone && <p>{t('components.simulation.nothingHappened')}</p>
      )}
      {isDone && run.balances.length > 0 && (
        <dl className="simulation-balances">
          {run.balances.map(({ currency, before, after }) => (
            <div key={currency}>
              <dt>{currency}</dt>
              <dd>
                {formatMoney(after)}
                <small>{formatSignedMoney(after - before)}</small>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {isDone && (
        <footer>
          <button type="button" onClick={dismissSimulation}>
            {t('components.simulation.close')}
          </button>
        </footer>
      )}
    </dialog>
  )
}

export default function SimulationDialog() {
  const run = useSimulation()

  return run && <SimulationWindow run={run} />
}
