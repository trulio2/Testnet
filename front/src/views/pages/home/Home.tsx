import { Navigate } from 'react-router-dom'
import {
  AccountSummary,
  OrderBook,
  OrderForm,
  OrdersPanel,
  PriceChart,
  RecentTrades
} from '@/components'
import { useActiveSymbol } from '@/modules/services'
import './Home.css'

function Home() {
  const symbol = useActiveSymbol()

  if (!symbol) return <Navigate to="/" replace />

  return (
    <div className="trade-page">
      <div className="trade-grid">
        <aside className="trade-panel order-panel">
          <OrderForm key={symbol} symbol={symbol} />
          <AccountSummary />
        </aside>
        <div className="trade-center">
          <PriceChart symbol={symbol} />
          <OrdersPanel />
        </div>
        <div className="market-panels">
          <OrderBook symbol={symbol} />
          <RecentTrades symbol={symbol} />
        </div>
      </div>
    </div>
  )
}

export default Home
