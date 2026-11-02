import type {
  Candle,
  FetchCandlesOptions,
  IMarketRepository,
  MarketStream,
  MarketStreamHandlers,
  OrderBookLevel,
  SymbolId,
  Timeframe,
  Trade
} from '@/types'
import { SYMBOLS } from '@/utils'

const REST_URL = 'https://data-api.binance.vision/api/v3'
const STREAM_URL = 'wss://data-stream.binance.vision/stream'
const STREAM_KINDS = ['aggTrade', 'depth20@100ms', 'ticker']

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
  path: string,
  params: Record<string, string>
): Promise<T> {
  const response = await fetch(
    `${REST_URL}/${path}?${new URLSearchParams(params)}`
  )

  if (!response.ok) {
    throw new Error(`${path} request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export default class MarketRepository implements IMarketRepository {
  public async fetchCandles(
    symbol: SymbolId,
    timeframe: Timeframe,
    { limit, endTime }: FetchCandlesOptions
  ): Promise<Candle[]> {
    const klines = await getJson<BinanceKline[]>('klines', {
      symbol: SYMBOLS[symbol].feedSymbol,
      interval: timeframe,
      limit: String(limit),
      ...(endTime === undefined ? {} : { endTime: String(endTime) })
    })

    return klines.map(toCandle)
  }

  public async fetchRecentTrades(
    symbol: SymbolId,
    limit: number
  ): Promise<Trade[]> {
    const trades = await getJson<BinanceAggTrade[]>('aggTrades', {
      symbol: SYMBOLS[symbol].feedSymbol,
      limit: String(limit)
    })

    return trades.map(toTrade)
  }

  public openStream(handlers: MarketStreamHandlers): MarketStream {
    const streams = [...symbolsByStreamName.keys()]
      .flatMap((name) => STREAM_KINDS.map((kind) => `${name}@${kind}`))
      .join('/')
    const socket = new WebSocket(`${STREAM_URL}?streams=${streams}`)

    socket.onopen = () => handlers.onOpen()
    socket.onclose = () => handlers.onClose()
    socket.onmessage = (event: MessageEvent<string>) => {
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
        const { bids, asks } = data as BinanceDepth

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

    return {
      close() {
        socket.onopen = null
        socket.onclose = null
        socket.onmessage = null
        socket.close()
      }
    }
  }
}
