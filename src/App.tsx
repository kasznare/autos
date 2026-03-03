import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { useEffect, useMemo, useState } from 'react'
import { GameScene } from './game/GameScene'
import { getMapVisualTheme, getTrackMap } from './game/maps'
import { createRoomId, getRoomIdFromUrl, isMultiplayerConfigured, setRoomIdInUrl } from './game/multiplayer'
import { stopEngineSound } from './game/sfx'
import { useGameStore } from './game/store'
import { Hud } from './game/Hud'

export const App = () => {
  const batterySaverMode = useGameStore((state) => state.batterySaverMode)
  const [manualPaused, setManualPaused] = useState(false)
  const [tabInactive, setTabInactive] = useState(() => (typeof document !== 'undefined' ? document.hidden : false))
  const [roomId, setRoomId] = useState<string | null>(() => getRoomIdFromUrl())
  const [isRoomHost, setIsRoomHost] = useState(false)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)

  const touchDevice = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(pointer: coarse)').matches
  }, [])
  const lowPowerMode = batterySaverMode === 'on' || (batterySaverMode === 'auto' && touchDevice)
  const paused = manualPaused || tabInactive
  const map = useMemo(() => getTrackMap(selectedMapId, proceduralMapSeed), [selectedMapId, proceduralMapSeed])
  const mapVisualTheme = useMemo(() => getMapVisualTheme(map), [map])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.repeat) {
        return
      }
      event.preventDefault()
      setManualPaused((current) => !current)
    }

    const onVisibility = () => {
      setTabInactive(document.hidden)
    }

    const onBlur = () => {
      setTabInactive(true)
    }

    const onFocus = () => {
      setTabInactive(document.hidden)
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    if (!paused) {
      return
    }
    stopEngineSound()
  }, [paused])

  const createRoom = () => {
    const next = createRoomId()
    setRoomIdInUrl(next)
    setRoomId(next)
    setIsRoomHost(true)
  }

  return (
    <div className="app-shell">
      <Canvas
        frameloop={paused ? 'never' : 'always'}
        shadows={lowPowerMode ? false : 'soft'}
        dpr={lowPowerMode ? [0.8, 1.2] : [1, 1.8]}
        gl={{ antialias: !lowPowerMode, powerPreference: lowPowerMode ? 'low-power' : 'high-performance' }}
        camera={{ fov: 55, position: [0, 8, 16] }}
      >
        <color attach="background" args={[mapVisualTheme.sky]} />
        <fog attach="fog" args={[mapVisualTheme.fog, mapVisualTheme.fogNear, mapVisualTheme.fogFar]} />
        <Physics gravity={[0, -12, 0]}>
          <GameScene lowPowerMode={lowPowerMode} roomId={roomId} isRoomHost={isRoomHost} />
        </Physics>
      </Canvas>
      <Hud
        roomId={roomId}
        isRoomHost={isRoomHost}
        multiplayerEnabled={isMultiplayerConfigured()}
        onCreateRoom={createRoom}
      />
    </div>
  )
}
