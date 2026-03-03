import { useEffect } from 'react'
import { MAX_DAMAGE } from './config'
import { resetVirtualInput, setVirtualInput } from './keys'
import { MAP_LABELS, MAP_ORDER } from './maps'
import { unlockAudio } from './sfx'
import { useGameStore } from './store'
import { VehicleBuilder } from './ui/builder/VehicleBuilder'

type TouchKey = 'forward' | 'backward' | 'left' | 'right' | 'restart'

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
  roomId,
  isRoomHost,
  multiplayerEnabled,
  onCreateRoom,
}: {
  roomId: string | null
  isRoomHost: boolean
  multiplayerEnabled: boolean
  onCreateRoom: () => void
}) => {
  const damage = useGameStore((state) => state.damage)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const speedKph = useGameStore((state) => state.speedKph)
  const steeringDeg = useGameStore((state) => state.steeringDeg)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const batterySaverMode = useGameStore((state) => state.batterySaverMode)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const mission = useGameStore((state) => state.mission)
  const gamepadConnected = useGameStore((state) => state.gamepadConnected)
  const keyboardInput = useGameStore((state) => state.keyboardInput)
  const hitFxToken = useGameStore((state) => state.hitFxToken)
  const lastHitLabel = useGameStore((state) => state.lastHitLabel)
  const restartRun = useGameStore((state) => state.restartRun)
  const toggleEngineMuted = useGameStore((state) => state.toggleEngineMuted)
  const setBatterySaverMode = useGameStore((state) => state.setBatterySaverMode)
  const setSelectedMapId = useGameStore((state) => state.setSelectedMapId)
  const rerollProceduralMap = useGameStore((state) => state.rerollProceduralMap)

  const damagePct = Math.min(100, Math.round((damage / MAX_DAMAGE) * 100))

  useEffect(() => {
    return () => {
      resetVirtualInput()
    }
  }, [])

  const copyInviteLink = async () => {
    if (!roomId || typeof window === 'undefined') {
      return
    }
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // Clipboard may fail on insecure origins; ignore and keep gameplay uninterrupted.
    }
  }

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
        </div>
        <div className="hud-telemetry-row">
          <div className="hud-card hud-card-compact">Speed: {Math.round(speedKph)} km/h</div>
          <div className="hud-card hud-card-compact">Steer: {steeringDeg >= 0 ? '+' : ''}{Math.round(steeringDeg)}°</div>
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
        <div className="battery-saver-row">
          <span className="battery-saver-label">Battery Saver</span>
          <div className="battery-saver-picker">
            <button
              type="button"
              className={`battery-chip${batterySaverMode === 'auto' ? ' active' : ''}`}
              onClick={() => setBatterySaverMode('auto')}
            >
              Auto
            </button>
            <button
              type="button"
              className={`battery-chip${batterySaverMode === 'off' ? ' active' : ''}`}
              onClick={() => setBatterySaverMode('off')}
            >
              Off
            </button>
            <button
              type="button"
              className={`battery-chip${batterySaverMode === 'on' ? ' active' : ''}`}
              onClick={() => setBatterySaverMode('on')}
            >
              On
            </button>
          </div>
        </div>

        <VehicleBuilder />

        <div className="map-picker">
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
          <span className="multiplayer-state">
            Multiplayer: {multiplayerEnabled ? (roomId ? `${isRoomHost ? 'Host' : 'Guest'} • ${roomId}` : 'Off') : 'Not Configured'}
          </span>
          {multiplayerEnabled ? (
            <div className="multiplayer-actions">
              {roomId ? (
                <button type="button" className="map-reroll" onClick={copyInviteLink}>
                  Copy Link
                </button>
              ) : (
                <button type="button" className="map-reroll" onClick={onCreateRoom}>
                  Create Room
                </button>
              )}
            </div>
          ) : null}
        </div>
        <div className="multiplayer-row">
          <span className="multiplayer-state">Controller: {gamepadConnected ? 'Connected' : 'Not Connected'}</span>
        </div>

        <div className="instructions">Drive: WASD / Arrows • Restart: R or Space</div>
      </div>
      <div className="damage-wrap damage-wrap-center">
        <div className="damage-label">Damage: {damagePct}%</div>
        <div className="damage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={damagePct}>
          <div className="damage-fill" style={{ width: `${damagePct}%` }} />
        </div>
      </div>
      <div className="touch-controls">
        <div className="touch-row">
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
