import { ContactShadows, Environment } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { DirectionalLight, Group, Object3D } from 'three'
import { createInitialDestructibles, getTrackMap } from './maps'
import { PlayerCar } from './PlayerCar'
import {
  BrokenDestructible,
  CheckpointGates,
  Curbs,
  ForestCritter,
  Ground,
  IntactDestructible,
  MapEnvironment,
  MapInteractables,
  MovableObstacle,
  PathLaneMarkers,
  PickupItem,
  ProceduralGround,
  RemoteCar,
  RoadLoop,
  RoadPath,
  RoadsideDetails,
  StaticObstacle,
  TrafficCars,
  Trees,
  type RuntimeDestructible,
} from './scene'
import { useGameSceneRuntime } from './scene/useGameSceneRuntime'
import { useRenderProfiler } from './scene/useRenderProfiler'
import type { QualityConfig, QualityTier } from './systems'
import { useGameStore } from './store'

const PlayerShadowRig = ({
  playerPositionRef,
  enabled,
  enableContactShadows,
  shadowMapSize,
  shadowDistance = 58,
}: {
  playerPositionRef: { current: [number, number, number] }
  enabled: boolean
  enableContactShadows: boolean
  shadowMapSize: [number, number]
  shadowDistance?: number
}) => {
  const lightRef = useRef<DirectionalLight | null>(null)
  const targetObject = useMemo(() => new Object3D(), [])
  const contactGroupRef = useRef<Group | null>(null)

  useFrame(() => {
    if (!enabled) {
      return
    }
    const [x, y, z] = playerPositionRef.current

    const light = lightRef.current
    if (light) {
      light.position.set(x + 12, y + 24, z + 10)
      light.target = targetObject
      targetObject.position.set(x, y, z)
      targetObject.updateMatrixWorld()
      light.shadow.camera.updateProjectionMatrix()
      light.shadow.needsUpdate = true
    }

    if (contactGroupRef.current) {
      contactGroupRef.current.position.set(x, y + 0.03, z)
    }
  })

  return (
    <>
      <primitive object={targetObject} />
      <directionalLight
        ref={lightRef}
        position={[12, 24, 10]}
        intensity={1.35}
        castShadow={enabled}
        shadow-mapSize={shadowMapSize}
        shadow-bias={-0.00018}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-shadowDistance * 0.62}
        shadow-camera-right={shadowDistance * 0.62}
        shadow-camera-top={shadowDistance * 0.62}
        shadow-camera-bottom={-shadowDistance * 0.62}
      />
      {enableContactShadows ? (
        <group ref={contactGroupRef} position={[0, 0.03, 0]}>
          <ContactShadows opacity={0.35} scale={shadowDistance} blur={2.2} far={42} resolution={512} color="#2a4f3b" />
        </group>
      ) : null}
    </>
  )
}

export const GameScene = ({
  lowPowerMode = false,
  qualityTier = 'high',
  qualityConfig,
  runtimeActive = true,
  roomId = null,
  isRoomHost = false,
}: {
  lowPowerMode?: boolean
  qualityTier?: QualityTier
  qualityConfig: QualityConfig
  runtimeActive?: boolean
  roomId?: string | null
  isRoomHost?: boolean
}) => {
  const damage = useGameStore((state) => state.damage)
  const speedKph = useGameStore((state) => state.speedKph)
  const status = useGameStore((state) => state.status)
  const restartToken = useGameStore((state) => state.restartToken)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)
  const vehicleSpec = useGameStore((state) => state.vehicleSpec)
  const advanceMission = useGameStore((state) => state.advanceMission)
  const setMissionProgress = useGameStore((state) => state.setMissionProgress)
  const setRenderPerfTelemetry = useGameStore((state) => state.setRenderPerfTelemetry)

  const map = useMemo(() => getTrackMap(selectedMapId, proceduralMapSeed), [selectedMapId, proceduralMapSeed])
  const activeStaticObstacles = useMemo(() => map.spawnRules.obstacles.static, [map])
  const activeMovableObstacles = useMemo(() => map.spawnRules.obstacles.movable, [map])
  const mapSpawnObstacles = useMemo(
    () =>
      map.interactables
        .filter((item) => item.collider !== 'none')
        .map((item) => ({
          id: item.id,
          position: item.position,
          size: item.size,
          material: item.material,
          movable: item.collider === 'dynamic',
          color: item.color,
        })),
    [map.interactables],
  )
  const spawnObstacles = useMemo(
    () => [...activeStaticObstacles, ...activeMovableObstacles, ...mapSpawnObstacles],
    [activeStaticObstacles, activeMovableObstacles, mapSpawnObstacles],
  )
  const initialPickups = useMemo(() => map.spawnRules.pickups.initial, [map])
  const initialDestructibles = useMemo<RuntimeDestructible[]>(
    () =>
      createInitialDestructibles(map).map((item, index) => ({
        ...item,
        phase: 'intact',
        respawnAt: null,
        burstSeed: index,
      })),
    [map],
  )

  const {
    pickups,
    remoteCars,
    destructibles,
    critters,
    playerPositionRef,
    collectPickup,
    updatePlayerPosition,
    breakDestructible,
    breakCritter,
  } = useGameSceneRuntime({
    map,
    runtimeActive,
    roomId,
    isRoomHost,
    initialPickups,
    initialDestructibles,
    spawnObstacles,
    damage,
    speedKph,
    status,
    restartToken,
    proceduralMapSeed,
    vehicleSpec,
    advanceMission,
    setMissionProgress,
  })

  useRenderProfiler({ onSample: setRenderPerfTelemetry })

  return (
    <>
      <ambientLight intensity={lowPowerMode ? 0.54 : 0.42} />
      {lowPowerMode ? <hemisphereLight intensity={0.28} color="#d8f2ff" groundColor="#6f916a" /> : null}
      <PlayerShadowRig
        playerPositionRef={playerPositionRef}
        enabled={qualityConfig.shadows !== false}
        enableContactShadows={qualityConfig.enableContactShadows}
        shadowMapSize={qualityConfig.directionalShadowMapSize}
        shadowDistance={Math.max(58, map.roadWidth * 3.5)}
      />
      {qualityConfig.enableEnvironment ? <Environment preset="sunset" /> : null}
      {map.shape === 'ring' ? (
        <>
          <Ground worldHalf={map.worldHalf} />
          <RoadLoop outerHalf={map.outerHalf} innerHalf={map.innerHalf} />
          <Curbs outerHalf={map.outerHalf} innerHalf={map.innerHalf} />
        </>
      ) : (
        <ProceduralGround map={map} terrainSegments={qualityConfig.terrainSegments} />
      )}
      <CheckpointGates gates={map.gates} />
      {map.shape === 'path' ? (
        <>
          <RoadPath map={map} terrainSegments={qualityConfig.terrainSegments} />
          <PathLaneMarkers map={map} />
        </>
      ) : null}
      <RoadsideDetails map={map} seed={proceduralMapSeed * 97 + restartToken * 31} density={qualityConfig.roadsideDensity} castShadows={qualityTier === 'high'} />
      <Trees trees={map.trees} map={map} castShadows={qualityTier === 'high'} />
      <MapEnvironment objects={map.environmentObjects} restartToken={restartToken} />
      <MapInteractables map={map} restartToken={restartToken} />
      {map.shape === 'path' ? (
        <TrafficCars map={map} lowPowerMode={lowPowerMode} restartToken={restartToken} playerPositionRef={playerPositionRef} updateHz={qualityConfig.trafficUpdateHz} />
      ) : null}
      {activeStaticObstacles.map((obstacle) => (
        <StaticObstacle obstacle={obstacle} key={obstacle.id} />
      ))}
      {activeMovableObstacles.map((obstacle) => (
        <MovableObstacle obstacle={obstacle} key={`${obstacle.id}-${restartToken}`} />
      ))}
      {destructibles.map((item) =>
        item.phase === 'intact' ? (
          <IntactDestructible key={`${item.id}-intact`} destructible={item} map={map} onBreak={breakDestructible} />
        ) : (
          <BrokenDestructible key={`${item.id}-broken-${item.burstSeed}`} id={item.id} position={item.position} color={item.color} burstSeed={item.burstSeed} />
        ),
      )}
      {pickups.map((pickup) => (
        <PickupItem pickup={pickup} lowPowerMode={lowPowerMode} key={pickup.id} />
      ))}
      {map.shape === 'path' && map.spawnRules.hazards.critters.enabled
        ? critters.map((critter) => (
            <ForestCritter
              key={`${critter.id}-${critter.state}-${critter.burstSeed}`}
              critter={critter}
              map={map}
              onBreak={breakCritter}
              playerPositionRef={playerPositionRef}
              updateHz={qualityConfig.critterUpdateHz}
              cullDistance={qualityConfig.critterCullDistance}
            />
          ))
        : null}
      {Object.values(remoteCars).map((car) => (
        <RemoteCar key={car.id} car={car} lowPowerMode={lowPowerMode} />
      ))}
      <PlayerCar pickups={pickups} onCollectPickup={collectPickup} onPlayerPosition={updatePlayerPosition} lowPowerMode={lowPowerMode} />
    </>
  )
}
