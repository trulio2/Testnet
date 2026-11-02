import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChartPreferencesState, Timeframe } from '@/types'

// Separate from marketStore, which updates every frame: persist writes to
// localStorage on every set.
export const chartPreferencesStore = create<ChartPreferencesState>()(
  persist(
    (set) => ({
      timeframe: '1m',
      setTimeframe(timeframe: Timeframe) {
        set({ timeframe })
      }
    }),
    {
      name: 'chart-preferences-storage'
    }
  )
)
