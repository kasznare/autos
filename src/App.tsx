import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { GameScene } from './game/GameScene'
import { getTrackMap } from './game/maps'
import { clearRoomIdFromUrl, createRoomId, getRoomIdFromUrl, isMultiplayerConfigured, setRoomIdInUrl } from './game/multiplayer'
import { resetVirtualInput, setVirtualInput } from './game/keys'
import { useRenderSettings } from './game/render/useRenderSettings'
import { stopEngineSound } from './game/sfx'
import { useGameStore } from './game/store'
import { Hud } from './game/Hud'
import type { VehicleRealityMetricsV2 } from './game/types'

type TestApi = {
  getState: () => {
    speedKph: number
    damage: number
    score: number
    mission: { type: string; progress: number; target: number }
    selectedMapId: string
    proceduralMapSeed: number
    activeVehicleDefinitionId: string | null
    savedBuilds: Array<{ id: string; name: string }>
    roomId: string | null
    isRoomHost: boolean
    multiplayerStatus: string
    sessionLocked: boolean
    realityMetrics: VehicleRealityMetricsV2
  }
  setDamage: (value: number) => void
  restartRun: () => void
  setMap: (mapId: string) => void
  rerollProceduralMap: () => void
  setInput: (partial: Partial<Record<'forward' | 'backward' | 'left' | 'right' | 'jump' | 'restart', boolean>>) => void
  resetInput: () => void
  selectVehicleDefinition: (definitionId: string | null) => void
  saveBuild: (name: string) => string
  loadSavedBuild: (buildId: string) => void
  advanceMission: (amount?: number) => void
  openGarage: () => void
  closeGarage: () => void
}

const GarageOverlay = lazy(async () => {
  const module = await import('./game/ui/builder/GarageOverlay')
  return { default: module.GarageOverlay }
})

export const App = () => {
  const [manualPaused, setManualPaused] = useState(false)
  const [garageOpen, setGarageOpen] = useState(false)
  const [tabInactive, setTabInactive] = useState(() => (typeof document !== 'undefined' ? document.hidden : false))
  const [roomId, setRoomId] = useState<string | null>(() => getRoomIdFromUrl())
  const [isRoomHost, setIsRoomHost] = useState(false)
  const sessionStartedRef = useRef(false)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)
  const speedKph = useGameStore((state) => state.speedKph)
  const sessionLocked = useGameStore((state) => state.sessionLocked)
  const multiplayerAllowed = useGameStore((state) => state.multiplayerAllowed)
  const beginSession = useGameStore((state) => state.beginSession)
  const recordSessionTick = useGameStore((state) => state.recordSessionTick)
  const recordTopSpeed = useGameStore((state) => state.recordTopSpeed)
  const setQualityTier = useGameStore((state) => state.setQualityTier)
  const render = useRenderSettings()
  const effectiveRoomId = multiplayerAllowed ? roomId : null
  const effectiveIsRoomHost = multiplayerAllowed && isRoomHost

  const paused = manualPaused || tabInactive || garageOpen || sessionLocked
  const mapGravity = useMemo(
    () => getTrackMap(selectedMapId, proceduralMapSeed).gravity,
    [selectedMapId, proceduralMapSeed],
  )

  useEffect(() => {
    if (sessionStartedRef.current) {
      return
    }
    sessionStartedRef.current = true
    beginSession()
  }, [beginSession])

  useEffect(() => {
    recordTopSpeed(speedKph)
  }, [recordTopSpeed, speedKph])

  useEffect(() => {
    setQualityTier(render.runtimeQualityTier)
  }, [render.runtimeQualityTier, setQualityTier])

  useEffect(() => {
    if (paused) {
      return
    }
    const interval = window.setInterval(() => {
      recordSessionTick(1)
    }, 1000)
    return () => {
      window.clearInterval(interval)
    }
  }, [paused, recordSessionTick])

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

  useEffect(() => {
    if (multiplayerAllowed || !roomId) {
      return
    }
    clearRoomIdFromUrl()
  }, [multiplayerAllowed, roomId])

  const createRoom = () => {
    const next = createRoomId()
    setRoomIdInUrl(next)
    setRoomId(next)
    setIsRoomHost(true)
  }

  const leaveRoom = () => {
    clearRoomIdFromUrl()
    setRoomId(null)
    setIsRoomHost(false)
  }

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return
    }
    const testWindow = window as Window & { __AUTOS_TEST_API__?: TestApi }
    testWindow.__AUTOS_TEST_API__ = {
      getState: () => {
        const state = useGameStore.getState()
        return {
          speedKph: state.speedKph,
          damage: state.damage,
          score: state.score,
          mission: {
            type: state.mission.type,
            progress: state.mission.progress,
            target: state.mission.target,
          },
          selectedMapId: state.selectedMapId,
          proceduralMapSeed: state.proceduralMapSeed,
          activeVehicleDefinitionId: state.activeVehicleDefinitionId,
          savedBuilds: state.savedBuilds.map((build) => ({ id: build.id, name: build.spec.name })),
          roomId,
          isRoomHost,
          multiplayerStatus: state.multiplayerStatus,
          sessionLocked: state.sessionLocked,
          realityMetrics: state.physicsTelemetry.realityMetrics,
        }
      },
      setDamage: (value) => {
        const nextDamage = Math.max(0, Math.min(100, value))
        useGameStore.setState((state) => ({
          ...state,
          damage: nextDamage,
          status: nextDamage >= 100 ? 'lost' : 'running',
        }))
      },
      restartRun: () => {
        useGameStore.getState().restartRun()
      },
      setMap: (mapId) => {
        useGameStore.getState().setSelectedMapId(mapId as never)
      },
      rerollProceduralMap: () => {
        useGameStore.getState().rerollProceduralMap()
      },
      setInput: (partial) => {
        for (const [key, active] of Object.entries(partial)) {
          setVirtualInput(key as 'forward' | 'backward' | 'left' | 'right' | 'jump' | 'restart', active === true)
        }
        useGameStore.setState((state) => ({
          ...state,
          keyboardInput: { ...state.keyboardInput, ...partial },
        }))
      },
      resetInput: () => {
        resetVirtualInput()
        useGameStore.setState((state) => ({
          ...state,
          keyboardInput: {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            restart: false,
          },
        }))
      },
      selectVehicleDefinition: (definitionId) => {
        useGameStore.getState().setActiveVehicleDefinitionId(definitionId)
      },
      saveBuild: (name) => useGameStore.getState().saveCurrentBuild(name),
      loadSavedBuild: (buildId) => {
        useGameStore.getState().loadSavedBuild(buildId)
      },
      advanceMission: (amount = 1) => {
        const state = useGameStore.getState()
        state.advanceMission(state.mission.type, amount)
      },
      openGarage: () => {
        setGarageOpen(true)
      },
      closeGarage: () => {
        setGarageOpen(false)
      },
    }
    return () => {
      delete testWindow.__AUTOS_TEST_API__
    }
  }, [isRoomHost, roomId])

  return (
    <div className="app-shell">
      <Canvas
        frameloop={paused ? 'never' : 'always'}
        shadows={render.qualityConfig.shadows}
        dpr={render.qualityConfig.dpr}
        gl={{ antialias: render.qualityConfig.antialias, powerPreference: render.qualityConfig.powerPreference, stencil: false }}
        camera={{ fov: 55, position: [0, 8, 16] }}
      >
        <color attach="background" args={['#b9bec4']} />
        <fog attach="fog" args={['#b9bec4', 40, 140]} />
        <Physics gravity={mapGravity} timeStep={1 / 60} updateLoop="independent">
          <GameScene
            lowPowerMode={render.lowPowerMode}
            qualityTier={render.runtimeQualityTier}
            qualityConfig={render.qualityConfig}
            runtimeActive={!paused}
            roomId={effectiveRoomId}
            isRoomHost={effectiveIsRoomHost}
          />
        </Physics>
      </Canvas>
      <Hud
        onOpenGarage={() => setGarageOpen(true)}
      />
      <Suspense fallback={null}>
        {garageOpen ? (
          <GarageOverlay
            isOpen={garageOpen}
            onClose={() => setGarageOpen(false)}
            roomId={effectiveRoomId}
            isRoomHost={effectiveIsRoomHost}
            multiplayerEnabled={isMultiplayerConfigured() && multiplayerAllowed}
            onCreateRoom={createRoom}
            onLeaveRoom={leaveRoom}
          />
        ) : null}
      </Suspense>
    </div>
  )
}
