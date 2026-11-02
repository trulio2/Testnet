import { create } from 'zustand'
import type { CandleSeries, ConnectionStatus, MarketState } from '@/types'

export const marketStore = create<MarketState>()((set) => ({
  status: 'connecting',
  tickers: {},
  books: {},
  trades: {},
  series: {},
  setStatus(status: ConnectionStatus) {
    set({ status })
  },
  applyStreamBatch(batch) {
    set(batch)
  },
  setSeries(key: string, series: CandleSeries) {
    set((state) => ({ series: { ...state.series, [key]: series } }))
  },
  removeSeries(key: string) {
    set((state) => {
      const series = { ...state.series }

      delete series[key]

      return { series }
    })
  }
}))
