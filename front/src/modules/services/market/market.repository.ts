import type {
  Candle,
  CandleInterval,
  FetchCandlesOptions,
  IMarketRepository,
  MarketFeed,
  MarketStream,
  MarketStreamHandlers,
  OrderBook,
  OrderBookLevel,
  SymbolId,
  Trade
} from '@/types'
import { SYMBOLS } from '@/utils'

// Spot uses Binance's market-data-only hosts, which more regions can reach.
// Futures split their streams: trades and tickers on one address, the order book
// on another.
const FEEDS: Record<
  MarketFeed,
  { rest: string; streams: { url: string; kinds: string[] }[] }
> = {
  spot: {
    rest: 'https://data-api.binance.vision/api/v3',
    streams: [
      {
        url: 'wss://data-stream.binance.vision/stream',
        kinds: ['aggTrade', 'depth20@100ms', 'ticker']
      }
    ]
  },
  futures: {
    rest: 'https://fapi.binance.com/fapi/v1',
    streams: [
      {
        url: 'wss://fstream.binance.com/market/stream',
        kinds: ['aggTrade', 'ticker']
      },
      {
        url: 'wss://fstream.binance.com/public/stream',
        kinds: ['depth20@100ms']
      }
    ]
  }
}

type BinanceKline = [number, string, string, string, string, string]
type BinanceLevel = [string, string]

interface BinanceAggTrade {
  a: number
  p: string
  q: string
  T: number
  m: boolean
}

interface BinanceDepth {
  bids: BinanceLevel[]
  asks: BinanceLevel[]
}

// The futures stream names the sides "b" and "a".
interface BinanceFuturesDepth {
  b: BinanceLevel[]
  a: BinanceLevel[]
}

interface BinanceTicker {
  P: string
  h: string
  l: string
  v: string
}

const symbolsByStreamName = new Map(
  Object.values(SYMBOLS).map((config) => [
    config.feedSymbol.toLowerCase(),
    config.id
  ])
)

function toTrade(raw: BinanceAggTrade): Trade {
  return {
    id: raw.a,
    price: Number(raw.p),
    qty: Number(raw.q),
    time: raw.T,
    side: raw.m ? 'sell' : 'buy'
  }
}

function toLevel([price, qty]: BinanceLevel): OrderBookLevel {
  return { price: Number(price), qty: Number(qty) }
}

function toCandle([
  time,
  open,
  high,
  low,
  close,
  volume
]: BinanceKline): Candle {
  return {
    time: time / 1000,
    open: Number(open),
    high: Number(high),
    low: Number(low),
    close: Number(close),
    volume: Number(volume)
  }
}

async function getJson<T>(
  symbol: SymbolId,
  path: string,
  params: Record<string, string>
): Promise<T> {
  const { feed, feedSymbol } = SYMBOLS[symbol]
  const response = await fetch(
    `${FEEDS[feed].rest}/${path}?${new URLSearchParams({
      symbol: feedSymbol,
      ...params
    })}`
  )

  if (!response.ok) {
    throw new Error(`${path} request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export default class MarketRepository implements IMarketRepository {
  public async fetchCandles(
    symbol: SymbolId,
    interval: CandleInterval,
    { limit, startTime, endTime }: FetchCandlesOptions
  ): Promise<Candle[]> {
    const klines = await getJson<BinanceKline[]>(symbol, 'klines', {
      interval,
      limit: String(limit),
      ...(startTime === undefined ? {} : { startTime: String(startTime) }),
      ...(endTime === undefined ? {} : { endTime: String(endTime) })
    })

    return klines.map(toCandle)
  }

  public async fetchRecentTrades(
    symbol: SymbolId,
    limit: number
  ): Promise<Trade[]> {
    const trades = await getJson<BinanceAggTrade[]>(symbol, 'aggTrades', {
      limit: String(limit)
    })

    return trades.map(toTrade)
  }

  public async fetchTrades(
    symbol: SymbolId,
    { limit, startTime, endTime }: FetchCandlesOptions
  ): Promise<Trade[]> {
    const trades = await getJson<BinanceAggTrade[]>(symbol, 'aggTrades', {
      limit: String(limit),
      ...(startTime === undefined ? {} : { startTime: String(startTime) }),
      ...(endTime === undefined ? {} : { endTime: String(endTime) })
    })

    return trades.map(toTrade)
  }

  public async fetchOrderBook(
    symbol: SymbolId,
    limit: number
  ): Promise<OrderBook> {
    const { bids, asks } = await getJson<BinanceDepth>(symbol, 'depth', {
      limit: String(limit)
    })

    return { bids: bids.map(toLevel), asks: asks.map(toLevel) }
  }

  public openStream(
    feed: MarketFeed,
    handlers: MarketStreamHandlers
  ): MarketStream {
    const names = Object.values(SYMBOLS)
      .filter((config) => config.feed === feed)
      .map(({ feedSymbol }) => feedSymbol.toLowerCase())
    const sockets = FEEDS[feed].streams.map(
      ({ url, kinds }) =>
        new WebSocket(
          `${url}?streams=${names
            .flatMap((name) => kinds.map((kind) => `${name}@${kind}`))
            .join('/')}`
        )
    )
    let openCount = 0

    const detach = () =>
      sockets.forEach((socket) => {
        socket.onopen = null
        socket.onclose = null
        socket.onmessage = null
        socket.close()
      })

    const handleMessage = (event: MessageEvent<string>) => {
      const { stream, data } = JSON.parse(event.data) as {
        stream: string
        data: unknown
      }
      const [name, kind] = stream.split('@')
      const symbol = symbolsByStreamName.get(name)

      if (!symbol) return

      if (kind === 'aggTrade') {
        handlers.onTrade(symbol, toTrade(data as BinanceAggTrade))
      } else if (kind === 'depth20') {
        const depth = data as BinanceDepth | BinanceFuturesDepth
        const { bids, asks } =
          'b' in depth ? { bids: depth.b, asks: depth.a } : depth

        handlers.onBook(symbol, {
          bids: bids.map(toLevel),
          asks: asks.map(toLevel)
        })
      } else if (kind === 'ticker') {
        const ticker = data as BinanceTicker

        handlers.onTicker(symbol, {
          changePercent: Number(ticker.P),
          high: Number(ticker.h),
          low: Number(ticker.l),
          volume: Number(ticker.v)
        })
      }
    }

    // The feed is only live with all its sockets, and goes down with any of them.
    sockets.forEach((socket) => {
      socket.onopen = () => {
        openCount += 1

        if (openCount === sockets.length) handlers.onOpen()
      }
      socket.onclose = () => {
        detach()
        handlers.onClose()
      }
      socket.onmessage = handleMessage
    })

    return { close: detach }
  }
}
