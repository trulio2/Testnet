import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { LocaleState, Locale } from '@/types'

export const localeStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale(locale: Locale) {
        set({ locale })
      }
    }),
    {
      name: 'locale-storage'
    }
  )
)
