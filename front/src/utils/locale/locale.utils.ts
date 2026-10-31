import type { Locale, ITranslations } from '@/types'
import { en, pt } from './languages'

export const locales: Record<Locale, ITranslations> = { en, pt }

export function interpolate(
  message: string,
  values?: Record<string, unknown>
): string {
  return message.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const parts = key.split(',').map((p: string) => p.trim())
    if (parts[1] === 'plural') {
      const count = Number(values?.[parts[0]])
      const form = count === 1 ? 'one' : 'other'
      const match = key.match(new RegExp(`${form}\\s*\\{([^}]*)\\}`))
      return match ? match[1] : String(count)
    }
    return String(values?.[parts[0]] ?? '')
  })
}

export function resolve(
  translations: ITranslations,
  path: string
): string | null {
  const keys = path.split('.')
  let current: unknown = translations
  for (const k of keys) {
    if (current && typeof current === 'object' && k in current) {
      current = (current as Record<string, unknown>)[k]
    } else {
      return null
    }
  }
  return typeof current === 'string' ? current : null
}
