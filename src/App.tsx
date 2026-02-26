import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { useMemo } from 'react'
import { GameScene } from './game/GameScene'
import { useGameStore } from './game/store'
import { Hud } from './game/Hud'

export const App = () => {
  const batterySaverMode = useGameStore((state) => state.batterySaverMode)

  const touchDevice = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(pointer: coarse)').matches
  }, [])
  const lowPowerMode = batterySaverMode === 'on' || (batterySaverMode === 'auto' && touchDevice)

  return (
    <div className="app-shell">
      <Canvas
        shadows={lowPowerMode ? false : 'soft'}
        dpr={lowPowerMode ? [0.8, 1.2] : [1, 1.8]}
        gl={{ antialias: !lowPowerMode, powerPreference: lowPowerMode ? 'low-power' : 'high-performance' }}
        camera={{ fov: 55, position: [0, 8, 16] }}
      >
        <color attach="background" args={['#8cd3f0']} />
        <fog attach="fog" args={['#8cd3f0', 25, 80]} />
        <Physics gravity={[0, -12, 0]}>
          <GameScene lowPowerMode={lowPowerMode} />
        </Physics>
      </Canvas>
      <Hud />
    </div>
  )
}
