import { useState } from 'react'
import {
  useFills,
  useLocale,
  useOpenOrders,
  usePositions,
  useSpotHoldings,
  useSymbol,
  useTradingActions,
  useMoneyFormat
} from '@/modules/services'
import type { Fill, Order, PositionView, SpotHoldingView } from '@/types'

type PanelTab = 'positions' | 'spot' | 'orders' | 'fills'

function getPnlClass(value: number) {
  if (value === 0) return undefined

  return value > 0 ? 'pnl-up' : 'pnl-down'
}

function PositionRow({ position }: { position: PositionView }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(position.symbol)
  const { formatSignedMoney } = useMoneyFormat()
  const { closePosition } = useTradingActions()
  const isLong = position.qty > 0

  return (
    <tr>
      <td>{config.label}</td>
      <td className={isLong ? 'pnl-up' : 'pnl-down'}>
        {t(`components.ordersPanel.${isLong ? 'long' : 'short'}`)}
      </td>
      <td>{formatQty(Math.abs(position.qty))}</td>
      <td>{formatPrice(position.avgEntry)}</td>
      <td>
        {position.markPrice === undefined
          ? '—'
          : formatPrice(position.markPrice)}
      </td>
      <td>
        {position.liquidationPrice === undefined
          ? '—'
          : formatPrice(position.liquidationPrice)}
      </td>
      <td className={getPnlClass(position.unrealizedPnl)}>
        {formatSignedMoney(position.unrealizedPnl)} {config.quote}
      </td>
      <td>
        <button
          type="button"
          className="panel-action"
          onClick={() => closePosition(position.symbol)}
        >
          {t('components.ordersPanel.close')}
        </button>
      </td>
    </tr>
  )
}

function SpotRow({ holding }: { holding: SpotHoldingView }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty } = useSymbol(holding.symbol)
  const { formatMoney, formatSignedMoney } = useMoneyFormat()
  const { sellSpotHolding } = useTradingActions()

  return (
    <tr>
      <td>{config.label}</td>
      <td>
        {formatQty(holding.qty)} {config.base}
      </td>
      <td>{formatQty(holding.availableQty)}</td>
      <td>{formatPrice(holding.avgCost)}</td>
      <td>
        {holding.markPrice === undefined ? '—' : formatPrice(holding.markPrice)}
      </td>
      <td>
        {holding.value === undefined
          ? '—'
          : `${formatMoney(holding.value)} ${config.quote}`}
      </td>
      <td className={getPnlClass(holding.unrealizedPnl)}>
        {formatSignedMoney(holding.unrealizedPnl)} {config.quote}
      </td>
      <td>
        <button
          type="button"
          className="panel-action"
          disabled={holding.availableQty <= 0}
          onClick={() => sellSpotHolding(holding.symbol)}
        >
          {t('components.ordersPanel.sellAll')}
        </button>
      </td>
    </tr>
  )
}

function OrderRow({ order }: { order: Order }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty, formatTime } = useSymbol(order.symbol)
  const { cancelOrder } = useTradingActions()

  return (
    <tr>
      <td>{config.label}</td>
      <td>{t(`components.ordersPanel.${order.market}`)}</td>
      <td className={order.side === 'buy' ? 'pnl-up' : 'pnl-down'}>
        {t(`components.ordersPanel.${order.side}`)}
      </td>
      <td>{formatQty(order.qty)}</td>
      <td>{formatPrice(order.price)}</td>
      <td>{formatTime(order.createdAt)}</td>
      <td>
        <button
          type="button"
          className="panel-action"
          onClick={() => cancelOrder(order.id)}
        >
          {t('components.ordersPanel.cancel')}
        </button>
      </td>
    </tr>
  )
}

function FillRow({ fill }: { fill: Fill }) {
  const { t } = useLocale()
  const { config, formatPrice, formatQty, formatTime } = useSymbol(fill.symbol)
  const { formatMoney, formatSignedMoney } = useMoneyFormat()

  return (
    <tr>
      <td>{formatTime(fill.time)}</td>
      <td>{config.label}</td>
      <td>{t(`components.ordersPanel.${fill.market}`)}</td>
      <td className={fill.side === 'buy' ? 'pnl-up' : 'pnl-down'}>
        {t(`components.ordersPanel.${fill.side}`)}
      </td>
      <td>{formatQty(fill.qty)}</td>
      <td>{formatPrice(fill.price)}</td>
      {fill.isLiquidation ? (
        <td className="pnl-down">{t('components.ordersPanel.liquidation')}</td>
      ) : (
        <td>{t(`components.ordersPanel.${fill.liquidity}`)}</td>
      )}
      <td>
        {formatMoney(fill.fee)} {config.quote}
      </td>
      <td className={getPnlClass(fill.realizedPnl)}>
        {formatSignedMoney(fill.realizedPnl)} {config.quote}
      </td>
    </tr>
  )
}

export default function OrdersPanel() {
  const { t } = useLocale()
  const [tab, setTab] = useState<PanelTab>('positions')
  const positions = usePositions()
  const spotHoldings = useSpotHoldings()
  const orders = useOpenOrders()
  const fills = useFills()

  const counts: Record<PanelTab, number> = {
    positions: positions.length,
    spot: spotHoldings.length,
    orders: orders.length,
    fills: fills.length
  }
  const tabs: PanelTab[] = ['positions', 'spot', 'orders', 'fills']
  const label = (key: string) => t(`components.ordersPanel.${key}`)

  return (
    <section className="trade-panel orders-panel">
      <div className="orders-tabs" role="tablist">
        {tabs.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={option === tab}
            className={`orders-tab${option === tab ? ' active' : ''}`}
            onClick={() => setTab(option)}
          >
            {label(option)} ({counts[option]})
          </button>
        ))}
      </div>
      <div className="orders-content" role="tabpanel">
        {counts[tab] === 0 ? (
          <p className="trade-empty">{label(`${tab}Empty`)}</p>
        ) : (
          <table className="orders-table">
            {tab === 'positions' && (
              <>
                <thead>
                  <tr>
                    <th>{label('symbol')}</th>
                    <th>{label('side')}</th>
                    <th>{label('size')}</th>
                    <th>{label('entry')}</th>
                    <th>{label('mark')}</th>
                    <th>{label('liquidationPrice')}</th>
                    <th>{label('unrealizedPnl')}</th>
                    <th aria-label={label('close')} />
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <PositionRow key={position.symbol} position={position} />
                  ))}
                </tbody>
              </>
            )}
            {tab === 'spot' && (
              <>
                <thead>
                  <tr>
                    <th>{label('symbol')}</th>
                    <th>{label('balance')}</th>
                    <th>{label('available')}</th>
                    <th>{label('avgCost')}</th>
                    <th>{label('mark')}</th>
                    <th>{label('value')}</th>
                    <th>{label('unrealizedPnl')}</th>
                    <th aria-label={label('sellAll')} />
                  </tr>
                </thead>
                <tbody>
                  {spotHoldings.map((holding) => (
                    <SpotRow key={holding.symbol} holding={holding} />
                  ))}
                </tbody>
              </>
            )}
            {tab === 'orders' && (
              <>
                <thead>
                  <tr>
                    <th>{label('symbol')}</th>
                    <th>{label('market')}</th>
                    <th>{label('side')}</th>
                    <th>{label('size')}</th>
                    <th>{label('price')}</th>
                    <th>{label('time')}</th>
                    <th aria-label={label('cancel')} />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <OrderRow key={order.id} order={order} />
                  ))}
                </tbody>
              </>
            )}
            {tab === 'fills' && (
              <>
                <thead>
                  <tr>
                    <th>{label('time')}</th>
                    <th>{label('symbol')}</th>
                    <th>{label('market')}</th>
                    <th>{label('side')}</th>
                    <th>{label('size')}</th>
                    <th>{label('price')}</th>
                    <th>{label('liquidity')}</th>
                    <th>{label('fee')}</th>
                    <th>{label('realizedPnl')}</th>
                  </tr>
                </thead>
                <tbody>
                  {fills.map((fill) => (
                    <FillRow key={fill.id} fill={fill} />
                  ))}
                </tbody>
              </>
            )}
          </table>
        )}
      </div>
    </section>
  )
}
