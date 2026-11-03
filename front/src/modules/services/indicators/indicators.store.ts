import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Indicator, IndicatorsState } from '@/types'

export const indicatorsStore = create<IndicatorsState>()(
  persist(
    (set) => ({
      indicators: [],
      nextId: 1,
      setIndicators(indicators: Indicator[], nextId?: number) {
        set((state) => ({ indicators, nextId: nextId ?? state.nextId }))
      }
    }),
    {
      name: 'indicators-storage'
    }
  )
)
