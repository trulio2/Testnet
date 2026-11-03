import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChartPreferencesState, SymbolId, Timeframe } from '@/types'

// Separate from marketStore, which updates every frame: persist writes to
// localStorage on every set.
export const chartPreferencesStore = create<ChartPreferencesState>()(
  persist(
    (set) => ({
      timeframe: '1m',
      bookSteps: {},
      setTimeframe(timeframe: Timeframe) {
        set({ timeframe })
      },
      setBookStep(symbol: SymbolId, step: number) {
        set((state) => ({ bookSteps: { ...state.bookSteps, [symbol]: step } }))
      }
    }),
    {
      name: 'chart-preferences-storage'
    }
  )
)
