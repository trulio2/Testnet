import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  OrderDraft,
  SymbolId,
  TradingAccount,
  TradingState
} from '@/types'
import { createAccount } from './trading.engine'

export const tradingStore = create<TradingState>()(
  persist(
    (set) => ({
      account: createAccount(),
      drafts: {},
      setAccount(account: TradingAccount) {
        set({ account })
      },
      setDraft(symbol: SymbolId, draft: OrderDraft) {
        set((state) => ({ drafts: { ...state.drafts, [symbol]: draft } }))
      }
    }),
    {
      name: 'trading-storage',
      version: 1,
      partialize: (state) => ({ account: state.account })
    }
  )
)
