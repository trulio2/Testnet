import type { ChangelogEntry, IChangelogRepository } from '@/types'

export default class ChangelogRepository implements IChangelogRepository {
  public getEntries(): ChangelogEntry[] {
    return [
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
            text: 'Simulated trading: market and limit orders, long and short positions, fees and a 100,000 USD account saved in your browser.'
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
