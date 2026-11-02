import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  OrderDraft,
  SymbolId,
  TradingAccount,
  TradingAccountV1,
  TradingState
} from '@/types'
import { createAccount, migrateAccountFromV1 } from './trading.engine'

export const tradingStore = create<TradingState>()(
  persist(
    (set) => ({
      account: createAccount(Date.now()),
      drafts: {},
      lastProcessedAt: 0,
      setAccount(account: TradingAccount) {
        set({ account })
      },
      setLastProcessedAt(lastProcessedAt: number) {
        set({ lastProcessedAt })
      },
      setDraft(symbol: SymbolId, draft: OrderDraft) {
        set((state) => ({ drafts: { ...state.drafts, [symbol]: draft } }))
      }
    }),
    {
      name: 'trading-storage',
      version: 2,
      migrate(persisted, version) {
        if (version >= 2) return persisted as TradingState

        const state = persisted as Omit<TradingState, 'account'> & {
          account: TradingAccountV1
        }

        return {
          ...state,
          account: migrateAccountFromV1(state.account, Date.now())
        }
      },
      partialize: (state) => ({
        account: state.account,
        lastProcessedAt: state.lastProcessedAt
      })
    }
  )
)
