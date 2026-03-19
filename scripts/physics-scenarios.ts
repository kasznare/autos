import RAPIER from '@dimforge/rapier3d-compat'
import { VEHICLE_PHYSICS } from '../src/game/config'
import { VEHICLE_PRESETS } from '../src/game/config'
import { getTrackMap, isPointNearRoad, sampleTerrainHeight } from '../src/game/maps'
import { PLAYER_COLLISION_MASK, TERRAIN_COLLISION_MASK } from '../src/game/physics/interactionGroups'
import { toVehiclePhysicsTuning } from '../src/game/physics/vehicleAdapter'
import { createCritters } from '../src/game/systems/critters'
import { runVehicleDynamicsStep, type DynamicsWheelContactPoint } from '../src/game/systems/player-car/dynamics'
import { buildTrafficPath, createTrafficProgresses, getClosestProgressOnLoop, sampleLoopWithOffset, TRAFFIC_CAR_COUNT } from '../src/game/systems/traffic'
import type { VehiclePhysicsMode } from '../src/game/store/types'
import { fromLegacyVehicleSpec } from '../src/game/vehicle/definitions'
import { toVehicleRigDefinition } from '../src/game/vehicle/integration'

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const quatFromYaw = (yaw: number) => ({
  x: 0,
  y: Math.sin(yaw / 2),
  z: 0,
  w: Math.cos(yaw / 2),
})

const normalizeAngleDelta = (angle: number) => {
  let wrapped = angle
  while (wrapped > Math.PI) wrapped -= Math.PI * 2
  while (wrapped < -Math.PI) wrapped += Math.PI * 2
  return wrapped
}

const wrapPathIndex = (points: Array<[number, number]>, idx: number) => ((idx % points.length) + points.length) % points.length

const pathDirection = (points: Array<[number, number]>, idx: number) => {
  const a = points[wrapPathIndex(points, idx)]
  const b = points[wrapPathIndex(points, idx + 1)]
  return Math.atan2(b[0] - a[0], b[1] - a[1])
}

const pathSegmentLength = (points: Array<[number, number]>, idx: number) => {
  const a = points[wrapPathIndex(points, idx)]
  const b = points[wrapPathIndex(points, idx + 1)]
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

const getStartSegmentMetrics = (map: ReturnType<typeof getTrackMap>) => {
  const roadPath = map.roadPath as Array<[number, number]>
  let bestSegment = 0
  let bestProjection = 0
  let minDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < roadPath.length; i += 1) {
    const a = roadPath[i]
    const b = roadPath[(i + 1) % roadPath.length]
    const abx = b[0] - a[0]
    const abz = b[1] - a[1]
    const apx = map.startPosition[0] - a[0]
    const apz = map.startPosition[2] - a[1]
    const denom = abx * abx + abz * abz
    const t = denom <= 1e-5 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / denom))
    const cx = a[0] + abx * t
    const cz = a[1] + abz * t
    const distance = Math.hypot(map.startPosition[0] - cx, map.startPosition[2] - cz)
    if (distance < minDistance) {
      minDistance = distance
      bestSegment = i
      bestProjection = t
    }
  }
  const segmentLength = pathSegmentLength(roadPath, bestSegment)
  const turnIn = Math.abs(normalizeAngleDelta(pathDirection(roadPath, bestSegment) - pathDirection(roadPath, bestSegment - 1)))
  const turnOut = Math.abs(normalizeAngleDelta(pathDirection(roadPath, bestSegment + 1) - pathDirection(roadPath, bestSegment)))
  return {
    segmentLength,
    remainingLength: segmentLength * (1 - bestProjection),
    turnInDeg: (turnIn * 180) / Math.PI,
    turnOutDeg: (turnOut * 180) / Math.PI,
  }
}

const getStartTerrainMetrics = (map: ReturnType<typeof getTrackMap>) => {
  const forwardX = Math.sin(map.startYaw)
  const forwardZ = Math.cos(map.startYaw)
  const samples = [0, 6, 12, 18].map((distance) =>
    sampleTerrainHeight(map, map.startPosition[0] + forwardX * distance, map.startPosition[2] + forwardZ * distance),
  )
  let maxStep = 0
  for (let i = 1; i < samples.length; i += 1) {
    maxStep = Math.max(maxStep, Math.abs(samples[i] - samples[i - 1]))
  }
  return {
    heightSpan: Math.max(...samples) - Math.min(...samples),
    maxStep,
  }
}

const baseVehicleSpec = VEHICLE_PRESETS.sprinter
const baseVehicleTuning = toVehiclePhysicsTuning(baseVehicleSpec)
const baseVehicleRig = toVehicleRigDefinition(fromLegacyVehicleSpec('physics-scenarios', baseVehicleSpec))

const wheelContactPoints: readonly DynamicsWheelContactPoint[] = baseVehicleRig.axles.flatMap((axle) =>
  axle.corners.map((corner) => ({
    x: corner.localAnchor[0] * baseVehicleTuning.scale[0],
    y: corner.localAnchor[1] * baseVehicleTuning.scale[1],
    z: corner.localAnchor[2] * baseVehicleTuning.scale[2],
    axle: corner.localAnchor[2] >= 0 ? ('front' as const) : ('rear' as const),
    side: corner.side,
  })),
)

const averageContactPoint = (points: readonly DynamicsWheelContactPoint[], axle: 'front' | 'rear'): DynamicsWheelContactPoint => {
  if (points.length === 0) {
    return { x: 0, y: -0.12, z: axle === 'front' ? 1 : -1, axle, side: 'left' }
  }
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y, z: acc.z + point.z }),
    { x: 0, y: 0, z: 0 },
  )
  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
    z: sum.z / points.length,
    axle,
    side: 'left',
  }
}

const selectContactPoints = (mode: VehiclePhysicsMode) => {
  const frontContacts = wheelContactPoints.filter((point) => point.axle === 'front')
  const rearContacts = wheelContactPoints.filter((point) => point.axle === 'rear')
  const frontCenter = averageContactPoint(frontContacts, 'front')
  const rearCenter = averageContactPoint(rearContacts, 'rear')
  if (mode === 'one_wheel') return [frontCenter]
  if (mode === 'two_wheel') return [frontCenter, rearCenter]
  return wheelContactPoints
}

const getDriveBias = (mode: VehiclePhysicsMode) => {
  if (mode === 'one_wheel' || mode === 'two_wheel') {
    return { front: 1, rear: 0 }
  }
  return { front: 0.5, rear: 0.5 }
}

const createTerrainColliderDesc = (halfExtents: [number, number, number]) =>
  RAPIER.ColliderDesc.cuboid(...halfExtents).setFriction(1.05).setCollisionGroups(TERRAIN_COLLISION_MASK)

const createPlayerColliderDesc = () =>
  RAPIER.ColliderDesc.cuboid(0.56, 0.28, 1.12)
    .setTranslation(0, 0.12, 0)
    .setFriction(0.95)
    .setRestitution(0.02)
    .setCollisionGroups(PLAYER_COLLISION_MASK)

const runModeScenario = (mode: VehiclePhysicsMode) => {
  const map = getTrackMap('ramp', 1)
  const vehiclePhysicsTuning = baseVehicleTuning

  const world = new RAPIER.World({ x: map.gravity[0], y: map.gravity[1], z: map.gravity[2] })
  world.timestep = 1 / 60
  world.maxCcdSubsteps = 2
  world.numSolverIterations = 8
  world.numInternalPgsIterations = 3

  if (map.sourceId === 'ramp') {
    const climbRange = Math.max(1, map.worldHalf - 8)
    const slope = map.terrain.amplitude / climbRange
    const rampAngle = Math.atan(slope)
    const ground = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(0, 0, 0)
        .setRotation({ x: Math.sin(rampAngle / 2), y: 0, z: 0, w: Math.cos(rampAngle / 2) }),
    )
    world.createCollider(createTerrainColliderDesc([map.worldHalf, 0.4, map.worldHalf]), ground)
  } else {
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0))
    world.createCollider(createTerrainColliderDesc([map.worldHalf, 0.2, map.worldHalf]), ground)
  }

  const startYaw = map.startYaw
  const startPos = {
    x: map.startPosition[0],
    y: sampleTerrainHeight(map, map.startPosition[0], map.startPosition[2]) + VEHICLE_PHYSICS.suspensionRideHeight + 0.06,
    z: map.startPosition[2],
  }
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPos.x, startPos.y, startPos.z)
      .setRotation(quatFromYaw(startYaw))
      .setCanSleep(false)
      .setLinearDamping(0.18)
      .setAngularDamping(1.8),
  )
  world.createCollider(createPlayerColliderDesc(), chassis)

  const armorTimerRef = { current: 0 }
  const sputterTimerRef = { current: 0 }
  const sputterActiveRef = { current: false }
  const steerAngleRef = { current: 0 }
  const yawRateRef = { current: 0 }
  const lastYawRef = { current: startYaw }
  const stuckSteerTimerRef = { current: 0 }
  const hardContactCountRef = { current: 0 }
  const scrapeDamageTimerRef = { current: 0 }
  const jumpCooldownTimerRef = { current: 0 }
  const jumpGuardTimerRef = { current: 0 }
  const jumpHeldRef = { current: false }
  const lastGroundedAtRef = { current: 0 }
  const nanGuardTripsRef = { current: 0 }
  const speedClampTripsRef = { current: 0 }
  const telemetryTimerRef = { current: 0 }

  const selectedContactPoints = selectContactPoints(mode)
  const driveBias = getDriveBias(mode)

  let stalledFrames = 0
  let peakY = Number.NEGATIVE_INFINITY
  let maxVy = Number.NEGATIVE_INFINITY
  const totalSteps = 18 * 60
  for (let step = 0; step < totalSteps; step += 1) {
    const t = step / 60
    const throttleOn = t > 0.6 && t < 16.8
    const input = {
      forward: throttleOn,
      backward: false,
      left: false,
      right: false,
      jump: false,
      restart: false,
    }
    const result = runVehicleDynamicsStep({
      body: chassis as never,
      delta: 1 / 60,
      damage: 0,
      map,
      input,
      vehiclePhysicsTuning,
      armorTimerRef,
      sputterTimerRef,
      sputterActiveRef,
      steerAngleRef,
      yawRateRef,
      lastYawRef,
      stuckSteerTimerRef,
      hardContactCountRef,
      scrapeDamageTimerRef,
      jumpCooldownTimerRef,
      jumpGuardTimerRef,
      jumpHeldRef,
      lastGroundedAtRef,
      nanGuardTripsRef,
      speedClampTripsRef,
      telemetryTimerRef,
      setTelemetry: () => {},
      setPhysicsTelemetry: () => {},
      onPlayerPosition: () => {},
      addDamage: () => {},
      triggerHitFx: () => {},
      getImpactLabel: () => '',
      driveCommand: {
        throttle: throttleOn ? 1 : 0,
        steer: 0,
        brake: 0,
        driveBiasFront: driveBias.front,
        driveBiasRear: driveBias.rear,
      },
      wheelContactPoints: selectedContactPoints,
      physicsMode: mode,
    })
    world.step()

    const vel = chassis.linvel()
    const pos = chassis.translation()
    const forwardSpeed = vel.x * result.forwardX + vel.z * result.forwardZ
    if (throttleOn && forwardSpeed < 0.22) {
      stalledFrames += 1
    }
    peakY = Math.max(peakY, pos.y)
    maxVy = Math.max(maxVy, vel.y)
  }

  const endPos = chassis.translation()
  const progressZ = endPos.z - startPos.z
  const progressThreshold = mode === 'one_wheel' ? 4 : 8
  const stallThreshold = 920
  assert(Number.isFinite(progressZ), `[${mode}] invalid progress`)
  assert(progressZ > progressThreshold, `[${mode}] insufficient climb progress (${progressZ.toFixed(2)}m)`)
  assert(stalledFrames < stallThreshold, `[${mode}] excessive stalled frames (${stalledFrames})`)
  const peakYLimit = startPos.y + 75
  const maxVyLimit = 22
  assert(peakY < peakYLimit, `[${mode}] runaway vertical energy (peakY=${peakY.toFixed(2)})`)
  assert(maxVy < maxVyLimit, `[${mode}] excessive upward velocity (maxVy=${maxVy.toFixed(2)})`)

  return { mode, progressZ, stalledFrames, peakY, maxVy }
}

const runFlatSupportScenario = () => {
  const map = getTrackMap('gaia', 1)
  const vehiclePhysicsTuning = baseVehicleTuning

  const world = new RAPIER.World({ x: map.gravity[0], y: map.gravity[1], z: map.gravity[2] })
  world.timestep = 1 / 60
  world.maxCcdSubsteps = 2
  world.numSolverIterations = 8
  world.numInternalPgsIterations = 3

  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0))
  world.createCollider(createTerrainColliderDesc([map.worldHalf, 0.2, map.worldHalf]), ground)

  const startYaw = map.startYaw
  const startPos = { x: map.startPosition[0], y: map.startPosition[1], z: map.startPosition[2] }
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPos.x, startPos.y, startPos.z)
      .setRotation(quatFromYaw(startYaw))
      .setCanSleep(false)
      .setLinearDamping(0.18)
      .setAngularDamping(1.8),
  )
  world.createCollider(createPlayerColliderDesc(), chassis)

  const armorTimerRef = { current: 0 }
  const sputterTimerRef = { current: 0 }
  const sputterActiveRef = { current: false }
  const steerAngleRef = { current: 0 }
  const yawRateRef = { current: 0 }
  const lastYawRef = { current: startYaw }
  const stuckSteerTimerRef = { current: 0 }
  const hardContactCountRef = { current: 0 }
  const scrapeDamageTimerRef = { current: 0 }
  const jumpCooldownTimerRef = { current: 0 }
  const jumpGuardTimerRef = { current: 0 }
  const jumpHeldRef = { current: false }
  const lastGroundedAtRef = { current: 0 }
  const nanGuardTripsRef = { current: 0 }
  const speedClampTripsRef = { current: 0 }
  const telemetryTimerRef = { current: 0 }

  let minYAfterSettle = Number.POSITIVE_INFINITY
  let maxYAfterSettle = Number.NEGATIVE_INFINITY
  let maxVyAfterSettle = Number.NEGATIVE_INFINITY
  let progressDistance = 0
  const totalSteps = 12 * 60
  for (let step = 0; step < totalSteps; step += 1) {
    const t = step / 60
    const throttleOn = t > 0.6 && t < 9.6
    const result = runVehicleDynamicsStep({
      body: chassis as never,
      delta: 1 / 60,
      damage: 0,
      map,
      input: {
        forward: throttleOn,
        backward: false,
        left: false,
        right: false,
        jump: false,
        restart: false,
      },
      vehiclePhysicsTuning,
      armorTimerRef,
      sputterTimerRef,
      sputterActiveRef,
      steerAngleRef,
      yawRateRef,
      lastYawRef,
      stuckSteerTimerRef,
      hardContactCountRef,
      scrapeDamageTimerRef,
      jumpCooldownTimerRef,
      jumpGuardTimerRef,
      jumpHeldRef,
      lastGroundedAtRef,
      nanGuardTripsRef,
      speedClampTripsRef,
      telemetryTimerRef,
      setTelemetry: () => {},
      setPhysicsTelemetry: () => {},
      onPlayerPosition: () => {},
      addDamage: () => {},
      triggerHitFx: () => {},
      getImpactLabel: () => '',
    })
    world.step()

    const pos = chassis.translation()
    const vel = chassis.linvel()
    progressDistance = Math.hypot(pos.x - startPos.x, pos.z - startPos.z)
    if (t > 2.5) {
      minYAfterSettle = Math.min(minYAfterSettle, pos.y)
      maxYAfterSettle = Math.max(maxYAfterSettle, pos.y)
      maxVyAfterSettle = Math.max(maxVyAfterSettle, vel.y)
    }

    assert(Number.isFinite(result.pos.x), '[flat-support] invalid chassis state')
  }

  const settleAmp = maxYAfterSettle - minYAfterSettle
  assert(progressDistance > 24, `[flat-support] insufficient straight-line progress (${progressDistance.toFixed(2)}m)`)
  assert(settleAmp < 0.12, `[flat-support] persistent vertical oscillation (${settleAmp.toFixed(3)})`)
  assert(maxVyAfterSettle < 0.45, `[flat-support] excessive upward rebound (${maxVyAfterSettle.toFixed(3)})`)

  return { progressDistance, settleAmp, maxVyAfterSettle }
}

const runProceduralSpawnScenario = () => {
  const seeds = [1, 2, 3, 4, 5]
  const metrics = seeds.map((seed) => {
    const map = getTrackMap('procedural', seed)
    return { seed, ...getStartSegmentMetrics(map), ...getStartTerrainMetrics(map) }
  })
  metrics.forEach((metric) => {
    assert(metric.remainingLength > 16, `[procedural-spawn] seed ${metric.seed} start run too short (${metric.remainingLength.toFixed(2)}m)`)
    assert(
      Math.max(metric.turnInDeg, metric.turnOutDeg) < 20,
      `[procedural-spawn] seed ${metric.seed} start turn too abrupt (in=${metric.turnInDeg.toFixed(1)}deg out=${metric.turnOutDeg.toFixed(1)}deg)`,
    )
    assert(metric.maxStep < 0.35, `[procedural-spawn] seed ${metric.seed} start terrain step too sharp (${metric.maxStep.toFixed(2)}m)`)
    assert(metric.heightSpan < 0.6, `[procedural-spawn] seed ${metric.seed} start terrain span too tall (${metric.heightSpan.toFixed(2)}m)`)
  })

  const map = getTrackMap('procedural', 2)
  const startX = map.startPosition[0]
  const startZ = map.startPosition[2]
  const pickupDistances = map.spawnRules.pickups.initial.map((pickup) => Math.hypot(pickup.position[0] - startX, pickup.position[2] - startZ))
  const destructibleDistances = map.spawnRules.hazards.destructibles.spawnPoints.map((point) => Math.hypot(point[0] - startX, point[2] - startZ))
  const critters = createCritters(map, 2)
  const critterDistances = critters.map((critter) => Math.hypot(critter.position[0] - startX, critter.position[2] - startZ))
  const roadBlockingCritter = critters.find((critter) => isPointNearRoad(map, critter.home[0], critter.home[1], critter.radius + 1.2))
  const trafficPath = buildTrafficPath(map)
  const startProgress = getClosestProgressOnLoop(trafficPath, startX, startZ).progress
  const trafficDistances = createTrafficProgresses(trafficPath, startProgress, TRAFFIC_CAR_COUNT).map((progress, idx) => {
    const laneOffset = ((idx % Math.max(1, map.laneCount)) - (Math.max(1, map.laneCount) - 1) / 2) * map.laneWidth
    const sample = sampleLoopWithOffset(trafficPath, progress, laneOffset)
    return Math.hypot(sample.x - startX, sample.z - startZ)
  })
  const blockingInteractables = map.interactables.filter((item) => {
    if (item.collider === 'none') {
      return false
    }
    const roadClearance = Math.hypot(item.size[0] * 0.5, item.size[2] * 0.5) + 1.6
    return (
      Math.hypot(item.position[0] - startX, item.position[2] - startZ) < 12 + roadClearance ||
      isPointNearRoad(map, item.position[0], item.position[2], roadClearance)
    )
  })

  const nearestPickup = Math.min(...pickupDistances)
  const nearestDestructible = Math.min(...destructibleDistances)
  const nearestCritter = critterDistances.length > 0 ? Math.min(...critterDistances) : Infinity
  const nearestTraffic = trafficDistances.length > 0 ? Math.min(...trafficDistances) : Infinity
  const nearestInteractable =
    map.interactables.length > 0
      ? Math.min(...map.interactables.map((item) => Math.hypot(item.position[0] - startX, item.position[2] - startZ)))
      : Infinity

  assert(nearestPickup > 10, `[procedural-spawn] pickup spawned too close to start (${nearestPickup.toFixed(2)}m)`)
  assert(nearestDestructible > 24, `[procedural-spawn] destructible spawned too close to start (${nearestDestructible.toFixed(2)}m)`)
  assert(nearestCritter > 24, `[procedural-spawn] critter spawned too close to start (${nearestCritter.toFixed(2)}m)`)
  assert(nearestTraffic > 24, `[procedural-spawn] traffic spawned too close to start (${nearestTraffic.toFixed(2)}m)`)
  assert(!roadBlockingCritter, `[procedural-spawn] critter roam overlaps road (${roadBlockingCritter?.id ?? 'unknown'})`)
  assert(blockingInteractables.length === 0, `[procedural-spawn] interactable overlaps road/start zone (${blockingInteractables[0]?.id ?? 'unknown'})`)

  return {
    nearestPickup,
    nearestDestructible,
    nearestCritter,
    nearestTraffic,
    nearestInteractable,
    interactableCount: map.interactables.length,
    minRemainingStartRun: Math.min(...metrics.map((metric) => metric.remainingLength)),
    maxStartTurnDeg: Math.max(...metrics.map((metric) => Math.max(metric.turnInDeg, metric.turnOutDeg))),
    maxStartHeightStep: Math.max(...metrics.map((metric) => metric.maxStep)),
  }
}

const run = async () => {
  await RAPIER.init()
  const modes: readonly VehiclePhysicsMode[] = ['one_wheel', 'two_wheel']
  const results = modes.map(runModeScenario)
  const flatSupport = runFlatSupportScenario()
  const proceduralSpawn = runProceduralSpawnScenario()
  console.log('Physics scenarios passed:')
  results.forEach((result) => {
    console.log(
      `- ${result.mode}: progressZ=${result.progressZ.toFixed(2)} stalledFrames=${result.stalledFrames} peakY=${result.peakY.toFixed(2)} maxVy=${result.maxVy.toFixed(2)}`,
    )
  })
  console.log(
    `- flat-support: progress=${flatSupport.progressDistance.toFixed(2)} settleAmp=${flatSupport.settleAmp.toFixed(3)} maxVy=${flatSupport.maxVyAfterSettle.toFixed(3)}`,
  )
  console.log(
    `- procedural-spawn: nearestPickup=${proceduralSpawn.nearestPickup.toFixed(2)} nearestDestructible=${proceduralSpawn.nearestDestructible.toFixed(2)} nearestCritter=${proceduralSpawn.nearestCritter.toFixed(2)} nearestTraffic=${proceduralSpawn.nearestTraffic.toFixed(2)} nearestInteractable=${proceduralSpawn.nearestInteractable.toFixed(2)} interactables=${proceduralSpawn.interactableCount} minStartRun=${proceduralSpawn.minRemainingStartRun.toFixed(2)} maxStartTurn=${proceduralSpawn.maxStartTurnDeg.toFixed(1)}deg maxStartStep=${proceduralSpawn.maxStartHeightStep.toFixed(2)}m`,
  )
}

run().catch((error) => {
  console.error(`Physics scenarios failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
