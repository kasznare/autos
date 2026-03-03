import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect } from 'react'
import { CarModel } from '../../CarModel'
import { MAP_LABELS, MAP_ORDER } from '../../maps'
import { useGameStore } from '../../store'
import { VehicleBuilder } from './VehicleBuilder'

const GarageViewer = () => {
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
  const vehiclePhysicsTuning = useGameStore((state) => state.vehiclePhysicsTuning)

  return (
    <Canvas camera={{ fov: 44, position: [4.6, 2.3, 5.4] }}>
      <color attach="background" args={['#dff2ff']} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 8, 4]} intensity={1.15} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.09, 0]} receiveShadow>
        <circleGeometry args={[5.4, 48]} />
        <meshStandardMaterial color="#f2f9ff" roughness={0.88} metalness={0.05} />
      </mesh>
      <group scale={vehiclePhysicsTuning.scale as [number, number, number]}>
        <CarModel
          bodyColor={vehicleSpec.cosmetics.bodyColor}
          accentColor={vehicleSpec.cosmetics.accentColor}
          damage={0}
          showTrail={false}
          crackOpacity={0}
        />
      </group>
      <OrbitControls enablePan={false} minDistance={2.8} maxDistance={8.8} maxPolarAngle={Math.PI * 0.48} />
    </Canvas>
  )
}

export const GarageOverlay = ({
  isOpen,
  onClose,
  roomId,
  isRoomHost,
  multiplayerEnabled,
  onCreateRoom,
}: {
  isOpen: boolean
  onClose: () => void
  roomId: string | null
  isRoomHost: boolean
  multiplayerEnabled: boolean
  onCreateRoom: () => void
}) => {
  const batterySaverMode = useGameStore((state) => state.batterySaverMode)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const setBatterySaverMode = useGameStore((state) => state.setBatterySaverMode)
  const setSelectedMapId = useGameStore((state) => state.setSelectedMapId)
  const rerollProceduralMap = useGameStore((state) => state.rerollProceduralMap)
  const resetMapSetup = useGameStore((state) => state.resetMapSetup)
  const resetUiSetup = useGameStore((state) => state.resetUiSetup)
  const resetVehicleSetup = useGameStore((state) => state.resetVehicleSetup)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Escape') {
        return
      }
      event.preventDefault()
      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const copyInviteLink = async () => {
    if (!roomId || typeof window === 'undefined') {
      return
    }
    try {
      await navigator.clipboard.writeText(window.location.href)
    } catch {
      // Clipboard may fail on insecure origins.
    }
  }

  const resetDefaults = () => {
    resetVehicleSetup()
    resetUiSetup()
    resetMapSetup()
  }

  return (
    <div className="garage-overlay" role="dialog" aria-modal="true" aria-label="Garage">
      <div className="garage-backdrop" onClick={onClose} />
      <div className="garage-shell">
        <div className="garage-header">
          <div>
            <div className="garage-title">Garage</div>
            <div className="garage-subtitle">Tune your build without HUD noise.</div>
          </div>
          <button type="button" className="garage-close" onClick={onClose}>
            Back To Drive
          </button>
        </div>

        <div className="garage-content">
          <section className="garage-viewer">
            <GarageViewer />
            <div className="garage-viewer-hint">Drag to orbit • Scroll / pinch to zoom</div>
          </section>

          <section className="garage-panel">
            <VehicleBuilder />

            <div className="garage-settings">
              <div className="garage-settings-title">Run Settings</div>

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

              <div className="garage-reset-row">
                <button type="button" className="garage-reset" onClick={resetDefaults}>
                  Reset To Defaults
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
