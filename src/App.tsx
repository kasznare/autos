import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { useEffect, useMemo, useState } from 'react'
import { GameScene } from './game/GameScene'
import { getTrackMap } from './game/maps'
import { createRoomId, getRoomIdFromUrl, isMultiplayerConfigured, setRoomIdInUrl } from './game/multiplayer'
import { stopEngineSound } from './game/sfx'
import { deriveQualityTier, getQualityConfig } from './game/systems'
import { useGameStore } from './game/store'
import { Hud } from './game/Hud'
import { GarageOverlay } from './game/ui/builder/GarageOverlay'

export const App = () => {
  const batterySaverMode = useGameStore((state) => state.batterySaverMode)
  const [manualPaused, setManualPaused] = useState(false)
  const [garageOpen, setGarageOpen] = useState(false)
  const [tabInactive, setTabInactive] = useState(() => (typeof document !== 'undefined' ? document.hidden : false))
  const [roomId, setRoomId] = useState<string | null>(() => getRoomIdFromUrl())
  const [isRoomHost, setIsRoomHost] = useState(false)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)
  const setQualityTier = useGameStore((state) => state.setQualityTier)

  const ADAPTIVE_QUALITY_ENABLED = false
  const touchDevice = useMemo(() => {
    if (typeof window === 'undefined') {
      return false
    }
    return window.matchMedia('(pointer: coarse)').matches
  }, [])
  const lowPowerMode = batterySaverMode === 'on' || (batterySaverMode === 'auto' && touchDevice)
  const qualityTier = deriveQualityTier({
    batterySaverMode,
    touchDevice,
    frameMsAvg: ADAPTIVE_QUALITY_ENABLED ? useGameStore.getState().renderPerf.frameMsAvg : 0,
  })
  const qualityConfig = getQualityConfig(qualityTier)
  const paused = manualPaused || tabInactive || garageOpen
  const mapGravity = useMemo(
    () => getTrackMap(selectedMapId, proceduralMapSeed).gravity,
    [selectedMapId, proceduralMapSeed],
  )

  useEffect(() => {
    setQualityTier(qualityTier)
  }, [qualityTier, setQualityTier])

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
        shadows={qualityConfig.shadows}
        dpr={qualityConfig.dpr}
        gl={{ antialias: qualityConfig.antialias, powerPreference: qualityConfig.powerPreference, stencil: false }}
        camera={{ fov: 55, position: [0, 8, 16] }}
      >
        <color attach="background" args={['#8cd3f0']} />
        <fog attach="fog" args={['#8cd3f0', 25, 80]} />
        <Physics gravity={mapGravity}>
          <GameScene
            lowPowerMode={lowPowerMode}
            qualityTier={qualityTier}
            qualityConfig={qualityConfig}
            runtimeActive={!paused}
            roomId={roomId}
            isRoomHost={isRoomHost}
          />
        </Physics>
      </Canvas>
      <Hud
        onOpenGarage={() => setGarageOpen(true)}
      />
      <GarageOverlay
        isOpen={garageOpen}
        onClose={() => setGarageOpen(false)}
        roomId={roomId}
        isRoomHost={isRoomHost}
        multiplayerEnabled={isMultiplayerConfigured()}
        onCreateRoom={createRoom}
      />
    </div>
  )
}
