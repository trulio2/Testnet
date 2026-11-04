import { create } from 'zustand'
import type { SimulationRun } from '@/types'

interface SimulationState {
  run: SimulationRun | null
  setRun: (run: SimulationRun | null) => void
}

export const simulationStore = create<SimulationState>()((set) => ({
  run: null,
  setRun(run: SimulationRun | null) {
    set({ run })
  }
}))
