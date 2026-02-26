import { useEffect } from 'react'
import { CAR_COLOR_OPTIONS, MAX_DAMAGE } from './config'
import { resetVirtualInput, setVirtualInput } from './keys'
import { unlockAudio } from './sfx'
import { useGameStore } from './store'

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

export const Hud = () => {
  const damage = useGameStore((state) => state.damage)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const selectedCarColor = useGameStore((state) => state.selectedCarColor)
  const keyboardInput = useGameStore((state) => state.keyboardInput)
  const hitFxToken = useGameStore((state) => state.hitFxToken)
  const lastHitLabel = useGameStore((state) => state.lastHitLabel)
  const restartRun = useGameStore((state) => state.restartRun)
  const toggleEngineMuted = useGameStore((state) => state.toggleEngineMuted)
  const setSelectedCarColor = useGameStore((state) => state.setSelectedCarColor)

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
        </div>

        <div className="color-picker">
          {CAR_COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-swatch${selectedCarColor === color ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => setSelectedCarColor(color)}
              aria-label={`Select car color ${color}`}
            />
          ))}
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
