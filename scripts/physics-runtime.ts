import RAPIER from '@dimforge/rapier3d-compat'
import { VEHICLE_PRESETS } from '../src/game/config'
import { getTrackMap } from '../src/game/maps'
import { toVehiclePhysicsTuning } from '../src/game/physics/vehicleAdapter'
import { runVehicleDynamicsStep } from '../src/game/systems/player-car/dynamics'

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

const quatFromAxisAngle = (ax: number, ay: number, az: number, radians: number) => {
  const half = radians * 0.5
  const s = Math.sin(half)
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) }
}

const wheelLocalAnchors = [
  { x: -0.74, y: -0.12, z: 0.94 },
  { x: 0.74, y: -0.12, z: 0.94 },
  { x: -0.74, y: -0.12, z: -0.9 },
  { x: 0.74, y: -0.12, z: -0.9 },
] as const

const run = async () => {
  await RAPIER.init()
  const map = getTrackMap('gaia', 1)
  const vehiclePhysicsTuning = toVehiclePhysicsTuning(VEHICLE_PRESETS.balanced)

  const world = new RAPIER.World({ x: map.gravity[0], y: map.gravity[1], z: map.gravity[2] })
  world.timestep = 1 / 60
  world.maxCcdSubsteps = 2
  world.numSolverIterations = 8
  world.numInternalPgsIterations = 3

  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0))
  world.createCollider(RAPIER.ColliderDesc.cuboid(map.worldHalf, 0.2, map.worldHalf).setFriction(1.05), ground)

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
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.56, 0.28, 1.12).setFriction(0.95).setRestitution(0.02), chassis)

  const wheelBodies = wheelLocalAnchors.map((anchor) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(startPos.x + anchor.x, startPos.y + anchor.y, startPos.z + anchor.z)
        .setRotation(quatFromYaw(startYaw))
        .restrictRotations(false, true, true, true)
        .setCanSleep(false)
        .setLinearDamping(1.1)
        .setAngularDamping(4.2),
    )
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.14, 0.22)
        .setRotation(quatFromAxisAngle(0, 0, 1, Math.PI / 2))
        .setFriction(2.1)
        .setRestitution(0.02),
      body,
    )
    return body
  })

  for (let i = 0; i < wheelBodies.length; i += 1) {
    const anchor = wheelLocalAnchors[i]
    const wheel = wheelBodies[i]
    world.createImpulseJoint(RAPIER.JointData.spring(0.01, 18, 10, anchor, { x: 0, y: 0, z: 0 }), chassis, wheel, true)
    world.createImpulseJoint(RAPIER.JointData.revolute(anchor, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }), chassis, wheel, true)
  }

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

  let peakY = Number.NEGATIVE_INFINITY
  let minYAfterSettle = Number.POSITIVE_INFINITY
  let maxYAfterSettle = Number.NEGATIVE_INFINITY
  let maxVyAfterSettle = Number.NEGATIVE_INFINITY
  let upsideDownFrames = 0

  const totalSteps = 12 * 60
  for (let step = 0; step < totalSteps; step += 1) {
    const t = step / 60
    const input = {
      forward: t > 1 && t < 5.8,
      backward: false,
      left: t > 2.2 && t < 3.4,
      right: false,
      jump: false,
      restart: false,
    }

    runVehicleDynamicsStep({
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
    const rot = chassis.rotation()
    const upY = 1 - 2 * (rot.x * rot.x + rot.z * rot.z)

    peakY = Math.max(peakY, pos.y)
    if (upY < 0) {
      upsideDownFrames += 1
    } else {
      upsideDownFrames = 0
    }
    if (t > 2.5) {
      minYAfterSettle = Math.min(minYAfterSettle, pos.y)
      maxYAfterSettle = Math.max(maxYAfterSettle, pos.y)
      maxVyAfterSettle = Math.max(maxVyAfterSettle, vel.y)
    }
  }

  const settleAmp = maxYAfterSettle - minYAfterSettle
  assert(peakY < startPos.y + 0.75, `peak y too high: ${peakY.toFixed(3)}`)
  assert(settleAmp < 0.22, `settle oscillation too high: ${settleAmp.toFixed(3)}`)
  assert(maxVyAfterSettle < 0.8, `post-settle upward velocity too high: ${maxVyAfterSettle.toFixed(3)}`)
  assert(upsideDownFrames < 10, 'vehicle flipped upside down')

  console.log(
    `Runtime physics smoke passed: peakY=${peakY.toFixed(3)} settleAmp=${settleAmp.toFixed(3)} maxVyAfterSettle=${maxVyAfterSettle.toFixed(3)} upsideDownFrames=${upsideDownFrames}`,
  )
}

run().catch((error) => {
  console.error(`Runtime physics smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
