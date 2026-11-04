import type { ChangelogEntry, IChangelogRepository } from '@/types'

export default class ChangelogRepository implements IChangelogRepository {
  public getEntries(): ChangelogEntry[] {
    return [
      {
        version: '0.6.0',
        items: [
          {
            type: 'added',
            text: 'When you come back with open orders or positions, the time you were away is replayed in the order it happened, and a window shows what was filled or liquidated.'
          }
        ]
      },
      {
        version: '0.5.0',
        items: [
          {
            type: 'added',
            text: 'Spot trading: buy and sell BTC outright, held apart from long and short positions, and buy or sell USD for BRL using your USD balance.'
          }
        ]
      },
      {
        version: '0.4.2',
        items: [
          {
            type: 'added',
            text: 'Plus and minus buttons around the order book spread group the book into wider price steps, up to a maximum for each symbol.'
          }
        ]
      },
      {
        version: '0.4.1',
        items: [
          {
            type: 'added',
            text: 'Collapse the indicator list, and hide or show every indicator at once.'
          },
          {
            type: 'fixed',
            text: 'Pivots for the current period now extend to the end of the period instead of stopping at the last candle.'
          }
        ]
      },
      {
        version: '0.4.0',
        items: [
          {
            type: 'added',
            text: 'Chart indicators: moving averages, Ichimoku Cloud and pivots, each with its own settings, and more than one of the same kind at a time.'
          }
        ]
      },
      {
        version: '0.3.1',
        items: [
          {
            type: 'changed',
            text: 'The browser tab shows the current page, or the symbol and live price on a trading page.'
          }
        ]
      },
      {
        version: '0.3.0',
        items: [
          {
            type: 'added',
            text: 'Configurable maker and taker fees per symbol on the wallet page, including negative maker fees as rebates.'
          }
        ]
      },
      {
        version: '0.2.1',
        items: [
          {
            type: 'changed',
            text: 'The chart remembers your selected timeframe after a reload.'
          }
        ]
      },
      {
        version: '0.2.0',
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
        items: []
      }
    ]
  }
}
