import { useEffect, useRef, useState } from 'react'
import {
  useIndicatorActions,
  useIndicatorOptions,
  useLocale
} from '@/modules/services'
import type {
  IchimokuSettings,
  Indicator,
  IndicatorSettings,
  MovingAverageSettings,
  PivotLevelName,
  PivotSettings
} from '@/types'

type Tab = 'inputs' | 'style'

function NumberRow({
  label,
  value,
  limits,
  onChange
}: {
  label: string
  value: number
  limits: { min: number; max: number }
  onChange: (value: number) => void
}) {
  const [text, setText] = useState(String(value))

  const handleChange = (next: string) => {
    const parsed = Number(next)

    setText(next)

    if (
      next.trim() !== '' &&
      Number.isInteger(parsed) &&
      parsed >= limits.min &&
      parsed <= limits.max
    ) {
      onChange(parsed)
    }
  }

  return (
    <label className="indicator-row">
      <span>{label}</span>
      <input
        inputMode={limits.min < 0 ? 'text' : 'numeric'}
        autoComplete="off"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => setText(String(value))}
      />
    </label>
  )
}

function SelectRow<T extends string>({
  label,
  value,
  options,
  getOptionLabel,
  onChange
}: {
  label: string
  value: T
  options: T[]
  getOptionLabel: (option: T) => string
  onChange: (value: T) => void
}) {
  return (
    <label className="indicator-row">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {getOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  )
}

function ColorRow({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="indicator-row">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function CheckRow({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="indicator-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function useLabels() {
  const { t } = useLocale()

  return (key: string) => t(`components.indicators.${key}`)
}

function MovingAverageFields({
  tab,
  settings,
  onChange
}: {
  tab: Tab
  settings: MovingAverageSettings
  onChange: (changes: Partial<MovingAverageSettings>) => void
}) {
  const label = useLabels()
  const { methods, sources, limits } = useIndicatorOptions()

  if (tab === 'style') {
    return (
      <>
        <ColorRow
          label={label('fields.color')}
          value={settings.color}
          onChange={(color) => onChange({ color })}
        />
        <NumberRow
          label={label('fields.lineWidth')}
          value={settings.lineWidth}
          limits={limits.lineWidth}
          onChange={(lineWidth) => onChange({ lineWidth })}
        />
      </>
    )
  }

  return (
    <>
      <SelectRow
        label={label('fields.method')}
        value={settings.method}
        options={methods}
        getOptionLabel={(option) => label(`methods.${option}`)}
        onChange={(method) => onChange({ method })}
      />
      <NumberRow
        label={label('fields.length')}
        value={settings.length}
        limits={limits.length}
        onChange={(length) => onChange({ length })}
      />
      <SelectRow
        label={label('fields.source')}
        value={settings.source}
        options={sources}
        getOptionLabel={(option) => label(`sources.${option}`)}
        onChange={(source) => onChange({ source })}
      />
      <NumberRow
        label={label('fields.offset')}
        value={settings.offset}
        limits={limits.offset}
        onChange={(offset) => onChange({ offset })}
      />
    </>
  )
}

function IchimokuFields({
  tab,
  settings,
  onChange
}: {
  tab: Tab
  settings: IchimokuSettings
  onChange: (changes: Partial<IchimokuSettings>) => void
}) {
  const label = useLabels()
  const { limits } = useIndicatorOptions()

  if (tab === 'style') {
    const colors = [
      ['conversionColor', 'conversionLine'],
      ['baseColor', 'baseLine'],
      ['laggingColor', 'laggingSpan'],
      ['leadingAColor', 'leadingSpanA'],
      ['leadingBColor', 'leadingSpanB'],
      ['cloudUpColor', 'cloudUp'],
      ['cloudDownColor', 'cloudDown']
    ] as const

    return (
      <>
        {colors.map(([key, name]) => (
          <ColorRow
            key={key}
            label={label(`fields.${name}`)}
            value={settings[key]}
            onChange={(color) => onChange({ [key]: color })}
          />
        ))}
        <NumberRow
          label={label('fields.lineWidth')}
          value={settings.lineWidth}
          limits={limits.lineWidth}
          onChange={(lineWidth) => onChange({ lineWidth })}
        />
      </>
    )
  }

  const periods = [
    ['conversionPeriods', 'conversionPeriods'],
    ['basePeriods', 'basePeriods'],
    ['laggingPeriods', 'laggingPeriods'],
    ['displacement', 'displacement']
  ] as const

  return (
    <>
      {periods.map(([key, name]) => (
        <NumberRow
          key={key}
          label={label(`fields.${name}`)}
          value={settings[key]}
          limits={limits.ichimokuPeriods}
          onChange={(value) => onChange({ [key]: value })}
        />
      ))}
    </>
  )
}

function PivotFields({
  tab,
  settings,
  onChange
}: {
  tab: Tab
  settings: PivotSettings
  onChange: (changes: Partial<PivotSettings>) => void
}) {
  const label = useLabels()
  const { pivotTypes, pivotTimeframes, labelPositions, levelNames, limits } =
    useIndicatorOptions()

  if (tab === 'style') {
    const changeLevel = (
      name: PivotLevelName,
      changes: Partial<PivotSettings['levels'][PivotLevelName]>
    ) =>
      onChange({
        levels: {
          ...settings.levels,
          [name]: { ...settings.levels[name], ...changes }
        }
      })

    return (
      <>
        <NumberRow
          label={label('fields.lineWidth')}
          value={settings.lineWidth}
          limits={limits.lineWidth}
          onChange={(lineWidth) => onChange({ lineWidth })}
        />
        <h3 className="indicator-section">{label('fields.levels')}</h3>
        <div className="indicator-levels">
          {levelNames.map((name) => (
            <div key={name} className={`indicator-level is-${name[0]}`}>
              <span>{name}</span>
              <input
                type="color"
                aria-label={`${name} ${label('fields.color')}`}
                value={settings.levels[name].color}
                onChange={(event) =>
                  changeLevel(name, { color: event.target.value })
                }
              />
              <input
                type="checkbox"
                aria-label={`${name} ${label('show')}`}
                checked={settings.levels[name].visible}
                onChange={(event) =>
                  changeLevel(name, { visible: event.target.checked })
                }
              />
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <SelectRow
        label={label('fields.type')}
        value={settings.pivotType}
        options={pivotTypes}
        getOptionLabel={(option) => label(`pivotTypes.${option}`)}
        onChange={(pivotType) => onChange({ pivotType })}
      />
      <SelectRow
        label={label('fields.pivotsTimeframe')}
        value={settings.timeframe}
        options={pivotTimeframes}
        getOptionLabel={(option) => label(`pivotTimeframes.${option}`)}
        onChange={(timeframe) => onChange({ timeframe })}
      />
      <NumberRow
        label={label('fields.pivotsBack')}
        value={settings.pivotsBack}
        limits={limits.pivotsBack}
        onChange={(pivotsBack) => onChange({ pivotsBack })}
      />
      <h3 className="indicator-section">{label('fields.labels')}</h3>
      <CheckRow
        label={label('fields.showLabels')}
        checked={settings.showLabels}
        onChange={(showLabels) => onChange({ showLabels })}
      />
      <CheckRow
        label={label('fields.showPrices')}
        checked={settings.showPrices}
        onChange={(showPrices) => onChange({ showPrices })}
      />
      <SelectRow
        label={label('fields.labelsPosition')}
        value={settings.labelsPosition}
        options={labelPositions}
        getOptionLabel={(option) => label(`positions.${option}`)}
        onChange={(labelsPosition) => onChange({ labelsPosition })}
      />
    </>
  )
}

// Changes apply to the chart as they're made, so Cancel restores the settings the
// window opened with.
export default function IndicatorSettingsDialog({
  indicator,
  onClose
}: {
  indicator: Indicator
  onClose: () => void
}) {
  const label = useLabels()
  const { updateIndicator } = useIndicatorActions()
  const { createDefaultSettings } = useIndicatorOptions()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [original] = useState<IndicatorSettings>(indicator.settings)
  const [tab, setTab] = useState<Tab>('inputs')
  const [formVersion, setFormVersion] = useState(0)

  useEffect(() => {
    const dialog = dialogRef.current

    if (dialog && !dialog.open) dialog.showModal()

    return () => dialog?.close()
  }, [])

  const change = (changes: Partial<IndicatorSettings>) =>
    updateIndicator(indicator.id, {
      ...indicator.settings,
      ...changes
    } as IndicatorSettings)

  const cancel = () => {
    updateIndicator(indicator.id, original)
    onClose()
  }

  const restoreDefaults = () => {
    updateIndicator(indicator.id, createDefaultSettings(indicator.type))
    setFormVersion((version) => version + 1)
  }

  return (
    <dialog
      ref={dialogRef}
      className="indicator-dialog"
      aria-labelledby="indicator-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        cancel()
      }}
    >
      <header>
        <h2 id="indicator-dialog-title">{label(`names.${indicator.type}`)}</h2>
        <button
          type="button"
          className="indicator-dialog-close"
          aria-label={label('cancel')}
          onClick={cancel}
        >
          ×
        </button>
      </header>
      <div className="indicator-tabs" role="tablist">
        {(['inputs', 'style'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={option === tab}
            className={option === tab ? 'active' : undefined}
            onClick={() => setTab(option)}
          >
            {label(`tabs.${option}`)}
          </button>
        ))}
      </div>
      <div
        key={`${tab}:${formVersion}`}
        className="indicator-dialog-body"
        role="tabpanel"
      >
        {indicator.type === 'movingAverage' && (
          <MovingAverageFields
            tab={tab}
            settings={indicator.settings}
            onChange={change}
          />
        )}
        {indicator.type === 'ichimoku' && (
          <IchimokuFields
            tab={tab}
            settings={indicator.settings}
            onChange={change}
          />
        )}
        {indicator.type === 'pivots' && (
          <PivotFields
            tab={tab}
            settings={indicator.settings}
            onChange={change}
          />
        )}
      </div>
      <footer>
        <button
          type="button"
          className="indicator-button"
          onClick={restoreDefaults}
        >
          {label('defaults')}
        </button>
        <span />
        <button type="button" className="indicator-button" onClick={cancel}>
          {label('cancel')}
        </button>
        <button
          type="button"
          className="indicator-button is-primary"
          onClick={onClose}
        >
          {label('ok')}
        </button>
      </footer>
    </dialog>
  )
}
