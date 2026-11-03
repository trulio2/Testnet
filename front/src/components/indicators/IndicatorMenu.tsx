import { useState } from 'react'
import { useIndicatorActions, useLocale } from '@/modules/services'
import type { IndicatorType } from '@/types'

const INDICATOR_TYPES: IndicatorType[] = ['movingAverage', 'ichimoku', 'pivots']

export default function IndicatorMenu() {
  const { t } = useLocale()
  const { addIndicator } = useIndicatorActions()
  const [isOpen, setIsOpen] = useState(false)

  const add = (type: IndicatorType) => {
    addIndicator(type)
    setIsOpen(false)
  }

  return (
    <div
      className="indicator-menu"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setIsOpen(false)
      }}
    >
      <button
        type="button"
        className="indicator-menu-button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        {t('components.indicators.title')}
      </button>
      {isOpen && (
        <>
          <div
            className="indicator-menu-backdrop"
            onClick={() => setIsOpen(false)}
          />
          <ul className="indicator-menu-list">
            {INDICATOR_TYPES.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  autoFocus={type === INDICATOR_TYPES[0]}
                  onClick={() => add(type)}
                >
                  {t(`components.indicators.names.${type}`)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
