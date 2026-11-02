import type { ChangelogEntry, IChangelogRepository } from '@/types'

export default class ChangelogRepository implements IChangelogRepository {
  public getEntries(): ChangelogEntry[] {
    return [
      {
        version: '0.2.0',
        date: '2026-11-02',
        items: [
          {
            type: 'added',
            text: 'Leverage from 1x to 50x, set per symbol, with margin and buying power shown on the order form.'
          },
          {
            type: 'added',
            text: 'Liquidation: positions close when equity falls to the 0.5% maintenance margin, and balances stop at zero after a price gap.'
          },
          {
            type: 'added',
            text: 'Liquidation price on open positions and on the chart, and a notice when a position is liquidated, including while you were away.'
          }
        ]
      },
      {
        version: '0.1.0',
        date: '2026-11-02',
        items: [
          {
            type: 'added',
            text: 'Live BTC/USD and USD/BRL market screen: chart, order book, recent trades and 24h stats, using Binance data.'
          },
          {
            type: 'added',
            text: 'Simulated trading: market and limit orders, long and short positions, and fees, saved in your browser.'
          },
          {
            type: 'added',
            text: 'Wallet page with separate USD and BRL balances, an option to add funds, and a funds history.'
          },
          {
            type: 'added',
            text: 'Limit orders the price reached while you were away fill when you come back.'
          },
          {
            type: 'added',
            text: 'The account runs in one tab at a time, and another open tab takes over when that one closes.'
          }
        ]
      },
      {
        version: '0.0.1',
        date: '2026-10-30',
        items: []
      }
    ]
  }
}
