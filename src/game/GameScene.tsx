import { ContactShadows, Environment } from '@react-three/drei'
import { useMemo } from 'react'
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
import { useGameStore } from './store'

export const GameScene = ({
  lowPowerMode = false,
  roomId = null,
  isRoomHost = false,
}: {
  lowPowerMode?: boolean
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

  return (
    <>
      <ambientLight intensity={lowPowerMode ? 0.54 : 0.42} />
      {lowPowerMode ? <hemisphereLight intensity={0.28} color="#d8f2ff" groundColor="#6f916a" /> : null}
      <directionalLight
        position={[12, 24, 10]}
        intensity={1.35}
        castShadow={!lowPowerMode}
        shadow-mapSize={lowPowerMode ? [512, 512] : [1024, 1024]}
        shadow-bias={-0.00018}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
      />
      {!lowPowerMode ? <Environment preset="sunset" /> : null}
      {!lowPowerMode ? <ContactShadows position={[0, 0.03, 0]} opacity={0.35} scale={58} blur={2.2} far={42} resolution={512} color="#2a4f3b" /> : null}
      {map.shape === 'ring' ? (
        <>
          <Ground worldHalf={map.worldHalf} />
          <RoadLoop map={map} />
          <Curbs outerHalf={map.outerHalf} innerHalf={map.innerHalf} />
        </>
      ) : (
        <ProceduralGround map={map} />
      )}
      <CheckpointGates gates={map.gates} />
      {map.shape === 'path' ? (
        <>
          <RoadPath map={map} />
          <PathLaneMarkers map={map} />
        </>
      ) : null}
      <RoadsideDetails map={map} seed={proceduralMapSeed * 97 + restartToken * 31} />
      <Trees trees={map.trees} map={map} />
      <MapEnvironment objects={map.environmentObjects} restartToken={restartToken} />
      <MapInteractables map={map} restartToken={restartToken} />
      {map.shape === 'path' ? (
        <TrafficCars map={map} lowPowerMode={lowPowerMode} restartToken={restartToken} playerPositionRef={playerPositionRef} />
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
            <ForestCritter key={`${critter.id}-${critter.state}-${critter.burstSeed}`} critter={critter} map={map} onBreak={breakCritter} />
          ))
        : null}
      {Object.values(remoteCars).map((car) => (
        <RemoteCar key={car.id} car={car} lowPowerMode={lowPowerMode} />
      ))}
      <PlayerCar pickups={pickups} onCollectPickup={collectPickup} onPlayerPosition={updatePlayerPosition} lowPowerMode={lowPowerMode} />
    </>
  )
}
