import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { GameScene } from './game/GameScene'
import { Hud } from './game/Hud'

export const App = () => {
  return (
    <div className="app-shell">
      <Canvas shadows="soft" camera={{ fov: 55, position: [0, 8, 16] }}>
        <color attach="background" args={['#8cd3f0']} />
        <fog attach="fog" args={['#8cd3f0', 25, 80]} />
        <Physics gravity={[0, -12, 0]}>
          <GameScene />
        </Physics>
      </Canvas>
      <Hud />
    </div>
  )
}
