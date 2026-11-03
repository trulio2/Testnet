import { useState } from 'react'
import {
  useIndicatorActions,
  useIndicators,
  useLocale
} from '@/modules/services'
import type { Indicator } from '@/types'
import IndicatorSettingsDialog from './IndicatorSettingsDialog'

function getSwatchColor(indicator: Indicator) {
  switch (indicator.type) {
    case 'movingAverage':
      return indicator.settings.color
    case 'ichimoku':
      return indicator.settings.conversionColor
    default:
      return indicator.settings.levels.P.color
  }
}

function useIndicatorLabel() {
  const { t } = useLocale()

  return (indicator: Indicator) => {
    switch (indicator.type) {
      case 'movingAverage': {
        const { method, length, source, offset } = indicator.settings
        const parts = [
          method.toUpperCase(),
          length,
          t(`components.indicators.sources.${source}`)
        ]

        return (offset ? [...parts, offset] : parts).join(' ')
      }
      case 'ichimoku': {
        const { conversionPeriods, basePeriods, laggingPeriods, displacement } =
          indicator.settings

        return [
          t('components.indicators.names.ichimoku'),
          conversionPeriods,
          basePeriods,
          laggingPeriods,
          displacement
        ].join(' ')
      }
      default: {
        const { pivotType, timeframe } = indicator.settings

        return [
          t('components.indicators.names.pivots'),
          t(`components.indicators.pivotTypes.${pivotType}`),
          t(`components.indicators.pivotTimeframes.${timeframe}`)
        ].join(' ')
      }
    }
  }
}

export default function IndicatorLegend() {
  const { t } = useLocale()
  const indicators = useIndicators()
  const getLabel = useIndicatorLabel()
  const { removeIndicator, setIndicatorVisible } = useIndicatorActions()
  const [editingId, setEditingId] = useState<number | null>(null)

  const editing = indicators.find((indicator) => indicator.id === editingId)

  if (indicators.length === 0) return null

  return (
    <>
      <ul className="indicator-legend">
        {indicators.map((indicator) => (
          <li
            key={indicator.id}
            className={indicator.visible ? undefined : 'is-hidden'}
          >
            <span
              className="indicator-swatch"
              style={{ background: getSwatchColor(indicator) }}
            />
            <span className="indicator-label">{getLabel(indicator)}</span>
            <button
              type="button"
              aria-pressed={!indicator.visible}
              onClick={() =>
                setIndicatorVisible(indicator.id, !indicator.visible)
              }
            >
              {t(
                `components.indicators.${indicator.visible ? 'hide' : 'show'}`
              )}
            </button>
            <button type="button" onClick={() => setEditingId(indicator.id)}>
              {t('components.indicators.settings')}
            </button>
            <button type="button" onClick={() => removeIndicator(indicator.id)}>
              {t('components.indicators.remove')}
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <IndicatorSettingsDialog
          key={editing.id}
          indicator={editing}
          onClose={() => setEditingId(null)}
        />
      )}
    </>
  )
}
