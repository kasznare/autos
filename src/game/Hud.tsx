import { useEffect } from 'react'
import { MAX_DAMAGE } from './config'
import { resetVirtualInput, setVirtualInput } from './keys'
import { MAP_LABELS, MAP_ORDER } from './maps'
import { unlockAudio } from './sfx'
import { useGameStore } from './store'

type TouchKey = 'forward' | 'backward' | 'left' | 'right' | 'jump' | 'restart'

const TouchButton = ({
  icon,
  ariaLabel,
  keyName,
  active,
}: {
  icon: string
  ariaLabel: string
  keyName: TouchKey
  active: boolean
}) => {
  const onPress = () => {
    void unlockAudio()
    setVirtualInput(keyName, true)
  }

  const onRelease = () => {
    setVirtualInput(keyName, false)
  }

  return (
    <button
      type="button"
      className={`touch-btn${active ? ' active' : ''}`}
      aria-label={ariaLabel}
      onPointerDown={onPress}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onPointerLeave={onRelease}
      onTouchStart={onPress}
      onTouchEnd={onRelease}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  )
}

export const Hud = ({
  onOpenGarage,
}: {
  onOpenGarage: () => void
}) => {
  const damage = useGameStore((state) => state.damage)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const speedKph = useGameStore((state) => state.speedKph)
  const qualityTier = useGameStore((state) => state.qualityTier)
  const renderPerf = useGameStore((state) => state.renderPerf)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const mission = useGameStore((state) => state.mission)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const gamepadConnected = useGameStore((state) => state.gamepadConnected)
  const keyboardInput = useGameStore((state) => state.keyboardInput)
  const physicsTelemetry = useGameStore((state) => state.physicsTelemetry)
  const hitFxToken = useGameStore((state) => state.hitFxToken)
  const lastHitLabel = useGameStore((state) => state.lastHitLabel)
  const restartRun = useGameStore((state) => state.restartRun)
  const toggleEngineMuted = useGameStore((state) => state.toggleEngineMuted)
  const setSelectedMapId = useGameStore((state) => state.setSelectedMapId)
  const rerollProceduralMap = useGameStore((state) => state.rerollProceduralMap)

  const damagePct = Math.min(100, Math.round((damage / MAX_DAMAGE) * 100))
  useEffect(() => {
    return () => {
      resetVirtualInput()
    }
  }, [])

  return (
    <div className="hud-layer">
      {lastHitLabel ? (
        <div key={`hit-label-${hitFxToken}`} className="hit-label">
          {lastHitLabel}
        </div>
      ) : null}
      <div className="hud-panel">
        <div className="hud-top-row">
          <div className="hud-card">Score: {score}</div>
          <div className="hud-card">Best: {bestScore}</div>
          <button type="button" className="hud-toggle" onClick={toggleEngineMuted}>
            Sound: {engineMuted ? 'Off' : 'On'}
          </button>
          <button type="button" className="hud-toggle" onClick={onOpenGarage}>
            Garage
          </button>
        </div>
        <div className="hud-telemetry-row">
          <div className="hud-card hud-card-compact">Speed: {Math.round(speedKph)} km/h</div>
          <div className={`hud-card hud-card-compact${renderPerf.fps < 50 ? ' hud-card-warning' : ''}`}>FPS: {Math.round(renderPerf.fps)}</div>
        </div>
        <div className="hud-telemetry-row">
          <div className={`hud-card hud-card-compact${renderPerf.frameMsWorst > 20 ? ' hud-card-warning' : ''}`}>
            Frame: {renderPerf.frameMsAvg > 0 ? renderPerf.frameMsAvg.toFixed(1) : '0.0'} ms
          </div>
          <div className="hud-card hud-card-compact">Worst: {renderPerf.frameMsWorst > 0 ? renderPerf.frameMsWorst.toFixed(1) : '0.0'} ms</div>
        </div>
        <div className="hud-telemetry-row">
          <div className={`hud-card hud-card-compact${renderPerf.drawCalls > 200 ? ' hud-card-warning' : ''}`}>Draws: {renderPerf.drawCalls}</div>
          <div className={`hud-card hud-card-compact${renderPerf.triangles > 500000 ? ' hud-card-warning' : ''}`}>Tris: {(renderPerf.triangles / 1000).toFixed(0)}k</div>
        </div>
        <div className="hud-telemetry-row">
          <div className="hud-card hud-card-compact">Tier: {qualityTier}</div>
          <div className={`hud-card hud-card-compact${renderPerf.gpuHotspot !== 'none' ? ' hud-card-warning' : ''}`}>GPU: {renderPerf.gpuHotspot}</div>
        </div>
        <div className="hud-telemetry-row">
          <div className="hud-card hud-card-compact">
            Jump: {physicsTelemetry.jumpState === 'grounded' && physicsTelemetry.jumpCooldownRemaining <= 0.001 ? 'Ready' : `${Math.max(0, physicsTelemetry.jumpCooldownRemaining).toFixed(1)}s`} ({physicsTelemetry.jumpState})
          </div>
          <div className="hud-card hud-card-compact">
            Hit: {physicsTelemetry.latestImpactTier} ({physicsTelemetry.latestImpactImpulse.toFixed(1)})
          </div>
        </div>
        <div className="hud-telemetry-row">
          <div className="hud-card hud-card-compact">Drive: {physicsTelemetry.driveMode}</div>
        </div>
        <div className="hud-wheel-debug">
          {physicsTelemetry.wheelDebugRows.map((row, idx) => (
            <div key={`${idx}-${row}`} className="hud-wheel-debug-row">
              {row}
            </div>
          ))}
        </div>
        <div className="mission-card">
          <div className="mission-title">
            Mission: {mission.label}
          </div>
          <div className="mission-progress">
            {Math.round(mission.progress)}/{mission.target} • Reward {mission.reward}
          </div>
          <div className="mission-track" role="progressbar" aria-valuemin={0} aria-valuemax={mission.target} aria-valuenow={mission.progress}>
            <div className="mission-fill" style={{ width: `${Math.min(100, (mission.progress / Math.max(1, mission.target)) * 100)}%` }} />
          </div>
        </div>
        <div className="map-picker">
          <div className="map-picker-header">
            <span>Map</span>
            <strong>{MAP_LABELS[selectedMapId]}</strong>
          </div>
          {MAP_ORDER.map((mapId) => (
            <button
              key={mapId}
              type="button"
              className={`map-chip${selectedMapId === mapId ? ' active' : ''}`}
              onClick={() => setSelectedMapId(mapId)}
            >
              {MAP_LABELS[mapId]}
            </button>
          ))}
          {selectedMapId === 'procedural' ? (
            <button type="button" className="map-reroll" onClick={rerollProceduralMap}>
              New
            </button>
          ) : null}
        </div>
        <div className="multiplayer-row">
          <span className="multiplayer-state">Controller: {gamepadConnected ? 'Connected' : 'Not Connected'}</span>
        </div>

        <div className="instructions">Drive: WASD / Arrows • Jump: Space • Restart: R</div>
      </div>
      <div className="damage-wrap damage-wrap-center">
        <div className="damage-label">Damage: {damagePct}%</div>
        <div className="damage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={damagePct}>
          <div className="damage-fill" style={{ width: `${damagePct}%` }} />
        </div>
      </div>
      <div className="touch-controls">
        <div className="touch-row">
          <TouchButton icon="⤒" ariaLabel="Jump" keyName="jump" active={keyboardInput.jump} />
          <TouchButton icon="▲" ariaLabel="Forward" keyName="forward" active={keyboardInput.forward} />
        </div>
        <div className="touch-row">
          <TouchButton icon="◀" ariaLabel="Left" keyName="left" active={keyboardInput.left} />
          <TouchButton icon="▼" ariaLabel="Backward" keyName="backward" active={keyboardInput.backward} />
          <TouchButton icon="▶" ariaLabel="Right" keyName="right" active={keyboardInput.right} />
        </div>
      </div>

      {status === 'lost' ? (
        <div className="lose-overlay">
          <div className="lose-panel">
            <h1>Pit Stop Time!</h1>
            <p>The car is too damaged. Tap to restart.</p>
            <button type="button" onClick={restartRun}>
              Try Again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
