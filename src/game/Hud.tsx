import { useEffect } from 'react'
import { MAX_DAMAGE } from './config'
import { resetVirtualInput, setVirtualInput } from './keys'
import { unlockAudio } from './sfx'
import { useGameStore } from './store'

type TouchKey = 'forward' | 'backward' | 'left' | 'right' | 'restart'

const TouchButton = ({ icon, ariaLabel, keyName }: { icon: string; ariaLabel: string; keyName: TouchKey }) => {
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
      className="touch-btn"
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
  const hitFxToken = useGameStore((state) => state.hitFxToken)
  const hitFxStrength = useGameStore((state) => state.hitFxStrength)
  const restartRun = useGameStore((state) => state.restartRun)

  const damagePct = Math.min(100, Math.round((damage / MAX_DAMAGE) * 100))
  const hitOpacity = hitFxToken === 0 ? 0 : Math.min(0.38, 0.12 + hitFxStrength * 0.24)

  useEffect(() => {
    return () => {
      resetVirtualInput()
    }
  }, [])

  return (
    <div className="hud-layer">
      <div
        key={hitFxToken}
        className="hit-flash"
        style={{ ['--hit-opacity' as string]: `${hitOpacity}` }}
      />
      <div className="hud-top-row">
        <div className="hud-card">Score: {score}</div>
        <div className="hud-card">Best: {bestScore}</div>
      </div>

      <div className="damage-wrap">
        <div className="damage-label">Damage: {damagePct}%</div>
        <div className="damage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={damagePct}>
          <div className="damage-fill" style={{ width: `${damagePct}%` }} />
        </div>
      </div>

      <div className="instructions">Drive: WASD / Arrows • Restart: R or Space</div>
      <div className="touch-controls">
        <div className="touch-row">
          <TouchButton icon="▲" ariaLabel="Forward" keyName="forward" />
        </div>
        <div className="touch-row">
          <TouchButton icon="◀" ariaLabel="Left" keyName="left" />
          <TouchButton icon="▼" ariaLabel="Backward" keyName="backward" />
          <TouchButton icon="▶" ariaLabel="Right" keyName="right" />
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
