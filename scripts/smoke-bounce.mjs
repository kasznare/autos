import RAPIER from '@dimforge/rapier3d-compat'

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

const quatFromYaw = (yaw) => ({
  x: 0,
  y: Math.sin(yaw / 2),
  z: 0,
  w: Math.cos(yaw / 2),
})

const quatFromAxisAngle = (ax, ay, az, radians) => {
  const half = radians * 0.5
  const s = Math.sin(half)
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) }
}

const wheelLocalAnchors = [
  { x: -0.74, y: -0.12, z: 0.94 },
  { x: 0.74, y: -0.12, z: 0.94 },
  { x: -0.74, y: -0.12, z: -0.9 },
  { x: 0.74, y: -0.12, z: -0.9 },
]

const createBaseWorld = () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = 1 / 60
  world.maxCcdSubsteps = 2
  world.numSolverIterations = 8
  world.numInternalPgsIterations = 3
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.2, 0))
  world.createCollider(RAPIER.ColliderDesc.cuboid(300, 0.2, 300).setFriction(1.05), ground)
  return world
}

const addRoughTrack = (world) => {
  const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0))
  for (let i = 0; i < 18; i += 1) {
    const z = i * 2.4 + 6
    const h = 0.05 + (i % 3) * 0.03
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.8, h, 0.26).setTranslation(0, h, z).setFriction(1.15), floor)
  }
}

const spawnVehicle = (world, startY = 1.18, initial = null) => {
  const chassis = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, startY, 0)
      .setRotation(quatFromYaw(0))
      .setCanSleep(false)
      .setLinearDamping(0.18)
      .setAngularDamping(1.8),
  )
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.56, 0.28, 1.12).setFriction(0.95).setRestitution(0.02), chassis)

  const wheelBodies = wheelLocalAnchors.map((anchor) => {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(anchor.x, startY + anchor.y, anchor.z)
        .setRotation(quatFromYaw(0))
        .restrictRotations(false, true, true, true)
        .setCanSleep(false)
        .setLinearDamping(1.1)
        .setAngularDamping(4.2),
    )
    const wheelRot = quatFromAxisAngle(0, 0, 1, Math.PI * 0.5)
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(0.14, 0.22).setRotation(wheelRot).setFriction(2.1).setRestitution(0.02),
      body,
    )
    return body
  })

  for (let i = 0; i < wheelBodies.length; i += 1) {
    const anchor = wheelLocalAnchors[i]
    const wheel = wheelBodies[i]
    const spring = RAPIER.JointData.spring(0.01, 18, 10, anchor, { x: 0, y: 0, z: 0 })
    const axle = RAPIER.JointData.revolute(anchor, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })
    world.createImpulseJoint(spring, chassis, wheel, true)
    world.createImpulseJoint(axle, chassis, wheel, true)
  }

  if (initial) {
    if (initial.linvel) chassis.setLinvel(initial.linvel, true)
    if (initial.angvel) chassis.setAngvel(initial.angvel, true)
    if (initial.rotation) chassis.setRotation(initial.rotation, true)
  }

  return { chassis }
}

const runScenario = ({
  name,
  startY,
  seconds,
  withRoughTrack = false,
  driveImpulseZ = 0,
  initial = null,
  maxPeakY,
  maxSettleAmp,
  maxUpwardVelAfterSettle,
}) => {
  const world = createBaseWorld()
  if (withRoughTrack) {
    addRoughTrack(world)
  }
  const { chassis } = spawnVehicle(world, startY, initial)

  let upsideDownFrames = 0
  let postSettleMinY = Number.POSITIVE_INFINITY
  let postSettleMaxY = Number.NEGATIVE_INFINITY
  let peakY = Number.NEGATIVE_INFINITY
  let maxUpwardVelAfterSettleObserved = 0

  const totalSteps = Math.round(seconds * 60)
  for (let step = 0; step < totalSteps; step += 1) {
    if (driveImpulseZ !== 0) {
      chassis.applyImpulse({ x: 0, y: 0, z: driveImpulseZ }, true)
    }
    world.step()
    const t = (step + 1) / 60
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

    if (t >= 2) {
      postSettleMinY = Math.min(postSettleMinY, pos.y)
      postSettleMaxY = Math.max(postSettleMaxY, pos.y)
      maxUpwardVelAfterSettleObserved = Math.max(maxUpwardVelAfterSettleObserved, vel.y)
    }
  }

  const settleAmplitude = postSettleMaxY - postSettleMinY
  assert(peakY < maxPeakY, `[${name}] excessive vertical energy (peak y=${peakY.toFixed(3)})`)
  assert(settleAmplitude < maxSettleAmp, `[${name}] persistent bounce (amp=${settleAmplitude.toFixed(3)})`)
  assert(
    maxUpwardVelAfterSettleObserved < maxUpwardVelAfterSettle,
    `[${name}] upward rebound too high after settle (vy=${maxUpwardVelAfterSettleObserved.toFixed(3)})`,
  )
  assert(upsideDownFrames < 10, `[${name}] chassis flips upside down`)

  return {
    peakY,
    settleAmplitude,
    maxUpwardVelAfterSettleObserved,
    upsideDownFrames,
  }
}

const run = async () => {
  await RAPIER.init()

  const scenarios = [
    {
      name: 'flat-spawn-settle',
      startY: 1.18,
      seconds: 10,
      maxPeakY: 1.45,
      maxSettleAmp: 0.08,
      maxUpwardVelAfterSettle: 0.35,
    },
    {
      name: 'flat-drop-settle',
      startY: 1.9,
      seconds: 10,
      maxPeakY: 2.05,
      maxSettleAmp: 0.1,
      maxUpwardVelAfterSettle: 0.5,
    },
    {
      name: 'rough-drive-stability',
      startY: 1.18,
      seconds: 8,
      withRoughTrack: true,
      driveImpulseZ: 0.055,
      maxPeakY: 1.65,
      maxSettleAmp: 0.18,
      maxUpwardVelAfterSettle: 0.8,
    },
    {
      name: 'perturbed-spawn-recovery',
      startY: 1.22,
      seconds: 8,
      initial: {
        linvel: { x: 0, y: -0.3, z: 4.4 },
        angvel: { x: 1.8, y: 0.4, z: 1.2 },
        rotation: quatFromAxisAngle(0, 0, 1, 0.32),
      },
      maxPeakY: 1.8,
      maxSettleAmp: 0.22,
      maxUpwardVelAfterSettle: 0.95,
    },
  ]

  const results = scenarios.map(runScenario)

  console.log('Bounce smoke passed:')
  results.forEach((result, idx) => {
    const name = scenarios[idx].name
    console.log(
      `- ${name}: peakY=${result.peakY.toFixed(3)} settleAmp=${result.settleAmplitude.toFixed(3)} maxVyAfterSettle=${result.maxUpwardVelAfterSettleObserved.toFixed(3)} upsideDownFrames=${result.upsideDownFrames}`,
    )
  })
}

run().catch((error) => {
  console.error(`Bounce smoke failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
