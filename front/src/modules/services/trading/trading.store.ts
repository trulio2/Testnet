import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  OrderDraft,
  SymbolId,
  TradingAccount,
  TradingAccountV1,
  TradingAccountV2,
  TradingAccountV3,
  TradingState
} from '@/types'
import {
  createAccount,
  migrateAccountFromV1,
  migrateAccountFromV2,
  migrateAccountFromV3
} from './trading.engine'

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
      version: 4,
      migrate(persisted, version) {
        const state = persisted as Omit<TradingState, 'account'> & {
          account: unknown
        }
        const now = Date.now()
        const v2 =
          version < 2
            ? migrateAccountFromV1(state.account as TradingAccountV1, now)
            : (state.account as TradingAccountV2)
        const v3 =
          version < 3
            ? migrateAccountFromV2(v2, now)
            : (state.account as TradingAccountV3)

        return { ...state, account: migrateAccountFromV3(v3) }
      },
      partialize: (state) => ({
        account: state.account,
        lastProcessedAt: state.lastProcessedAt
      })
    }
  )
)
