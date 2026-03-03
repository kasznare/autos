import { useMemo, useState } from 'react'
import { CAR_COLOR_OPTIONS, VEHICLE_PRESET_ORDER, VEHICLE_PRESETS } from '../../config'
import { useGameStore } from '../../store'

const toPct = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}%`

export const VehicleBuilder = () => {
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
  const vehicleSpecEvaluation = useGameStore((state) => state.vehicleSpecEvaluation)
  const vehiclePhysicsTuning = useGameStore((state) => state.vehiclePhysicsTuning)
  const savedBuilds = useGameStore((state) => state.savedBuilds)
  const setVehicleSpec = useGameStore((state) => state.setVehicleSpec)
  const applyVehiclePreset = useGameStore((state) => state.applyVehiclePreset)
  const saveCurrentBuild = useGameStore((state) => state.saveCurrentBuild)
  const loadSavedBuild = useGameStore((state) => state.loadSavedBuild)
  const deleteSavedBuild = useGameStore((state) => state.deleteSavedBuild)
  const [draftName, setDraftName] = useState(vehicleSpec.name)

  const handlingScore = useMemo(
    () => vehicleSpec.handling.grip * 0.55 + vehicleSpec.handling.brake * 0.35 - vehicleSpec.handling.drift * 0.12,
    [vehicleSpec],
  )
  const driftScore = useMemo(
    () => vehicleSpec.handling.drift * 0.9 + (100 - vehicleSpec.handling.grip) * 0.2,
    [vehicleSpec],
  )
  const paceScore = useMemo(() => vehicleSpec.power.acceleration * 0.52 + vehicleSpec.power.topSpeed * 0.48, [vehicleSpec])
  const durabilityScore = useMemo(
    () => (2 - vehiclePhysicsTuning.damageTakenMult) * 60 + vehiclePhysicsTuning.mass * 20,
    [vehiclePhysicsTuning],
  )

  const patchSpec = (next: Partial<typeof vehicleSpec>) => {
    setVehicleSpec({ ...vehicleSpec, ...next })
  }

  const onSave = () => {
    const nextName = draftName.trim() || vehicleSpec.name
    const normalized = nextName.slice(0, 28)
    setDraftName(normalized)
    setVehicleSpec({ ...vehicleSpec, name: normalized })
    saveCurrentBuild(normalized)
  }

  return (
    <div className="builder-panel">
      <div className="builder-title-row">
        <span className="builder-title">Custom Builder</span>
        <span className="builder-budget">Budget: {vehicleSpecEvaluation.budgetUsage}/78</span>
      </div>

      <div className="builder-presets">
        {VEHICLE_PRESET_ORDER.map((presetId) => (
          <button
            key={presetId}
            type="button"
            className={`builder-chip${vehicleSpec.name === VEHICLE_PRESETS[presetId].name ? ' active' : ''}`}
            onClick={() => {
              applyVehiclePreset(presetId)
              setDraftName(VEHICLE_PRESETS[presetId].name)
            }}
          >
            {VEHICLE_PRESETS[presetId].name}
          </button>
        ))}
      </div>

      <div className="builder-row">
        <label className="builder-field-label" htmlFor="build-name">
          Build Name
        </label>
        <input
          id="build-name"
          className="builder-input"
          value={draftName}
          maxLength={28}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={() => patchSpec({ name: draftName })}
        />
      </div>

      <div className="builder-row">
        <span className="builder-field-label">Chassis</span>
        <div className="builder-inline">
          {(['compact', 'standard', 'large'] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`builder-chip${vehicleSpec.chassisSize === size ? ' active' : ''}`}
              onClick={() => patchSpec({ chassisSize: size })}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-row">
        <span className="builder-field-label">Mass Class</span>
        <div className="builder-inline">
          {(['light', 'balanced', 'heavy'] as const).map((massClass) => (
            <button
              key={massClass}
              type="button"
              className={`builder-chip${vehicleSpec.massClass === massClass ? ' active' : ''}`}
              onClick={() => patchSpec({ massClass })}
            >
              {massClass}
            </button>
          ))}
        </div>
      </div>

      <div className="builder-color-row">
        {CAR_COLOR_OPTIONS.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-swatch${vehicleSpec.cosmetics.bodyColor === color ? ' active' : ''}`}
            style={{ background: color }}
            onClick={() => patchSpec({ cosmetics: { ...vehicleSpec.cosmetics, bodyColor: color } })}
            aria-label={`Select car color ${color}`}
          />
        ))}
      </div>

      <label className="builder-slider">
        <span>Acceleration {Math.round(vehicleSpec.power.acceleration)}</span>
        <input
          type="range"
          min={20}
          max={85}
          step={1}
          value={vehicleSpec.power.acceleration}
          onChange={(event) =>
            patchSpec({
              power: { ...vehicleSpec.power, acceleration: Number(event.target.value) },
            })
          }
        />
      </label>

      <label className="builder-slider">
        <span>Top Speed {Math.round(vehicleSpec.power.topSpeed)}</span>
        <input
          type="range"
          min={20}
          max={90}
          step={1}
          value={vehicleSpec.power.topSpeed}
          onChange={(event) =>
            patchSpec({
              power: { ...vehicleSpec.power, topSpeed: Number(event.target.value) },
            })
          }
        />
      </label>

      <label className="builder-slider">
        <span>Grip {Math.round(vehicleSpec.handling.grip)}</span>
        <input
          type="range"
          min={25}
          max={90}
          step={1}
          value={vehicleSpec.handling.grip}
          onChange={(event) =>
            patchSpec({
              handling: { ...vehicleSpec.handling, grip: Number(event.target.value) },
            })
          }
        />
      </label>

      <label className="builder-slider">
        <span>Drift Tendency {Math.round(vehicleSpec.handling.drift)}</span>
        <input
          type="range"
          min={10}
          max={85}
          step={1}
          value={vehicleSpec.handling.drift}
          onChange={(event) =>
            patchSpec({
              handling: { ...vehicleSpec.handling, drift: Number(event.target.value) },
            })
          }
        />
      </label>

      <label className="builder-slider">
        <span>Brake Strength {Math.round(vehicleSpec.handling.brake)}</span>
        <input
          type="range"
          min={25}
          max={90}
          step={1}
          value={vehicleSpec.handling.brake}
          onChange={(event) =>
            patchSpec({
              handling: { ...vehicleSpec.handling, brake: Number(event.target.value) },
            })
          }
        />
      </label>

      <div className="builder-stats">
        <div className="builder-stat">
          <span>Pace</span>
          <div className="builder-bar"><i style={{ width: toPct(paceScore) }} /></div>
        </div>
        <div className="builder-stat">
          <span>Stable Handling</span>
          <div className="builder-bar"><i style={{ width: toPct(handlingScore) }} /></div>
        </div>
        <div className="builder-stat">
          <span>Drift Bias</span>
          <div className="builder-bar"><i style={{ width: toPct(driftScore) }} /></div>
        </div>
        <div className="builder-stat">
          <span>Durability</span>
          <div className="builder-bar"><i style={{ width: toPct(durabilityScore) }} /></div>
        </div>
      </div>

      {vehicleSpecEvaluation.warnings.map((warning) => (
        <div key={warning} className="builder-warning">{warning}</div>
      ))}

      <div className="builder-save-row">
        <button type="button" className="builder-save" onClick={onSave}>
          Save Build
        </button>
      </div>

      {savedBuilds.length ? (
        <div className="builder-saved-list">
          {savedBuilds.map((build) => (
            <div key={build.id} className="builder-saved-item">
              <button
                type="button"
                className="builder-load"
                onClick={() => {
                  loadSavedBuild(build.id)
                  setDraftName(build.spec.name)
                }}
              >
                {build.spec.name}
              </button>
              <button type="button" className="builder-delete" onClick={() => deleteSavedBuild(build.id)}>
                x
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
