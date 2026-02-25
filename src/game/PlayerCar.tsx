import { Sparkles, Trail } from '@react-three/drei'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Group, Vector3 } from 'three'
import { DAMAGE_DRIVE_EFFECTS, DAMAGE_SPUTTER, DAMAGE_TIERS, DRIVE_SURFACE, MAX_DAMAGE, PLAYER_BODY_NAME, ROAD_INNER_HALF, ROAD_OUTER_HALF } from './config'
import { applyKey, createInputState, getMergedInput, keyCodeToInput } from './keys'
import { playCollisionSound, playPickupSound, setEngineMuted, stopEngineSound, unlockAudio, updateEngineSound } from './sfx'
import { useGameStore } from './store'
import type { Pickup } from './types'

type PlayerCarProps = {
  pickups: Pickup[]
  onCollectPickup: (pickupId: string) => void
  onPlayerPosition: (position: [number, number, number]) => void
}

const START_POSITION = { x: 0, y: 0.38, z: 20 }
const START_YAW = Math.PI / 2
const CAMERA_FOLLOW_DISTANCE = 9.5
const CAMERA_FOLLOW_HEIGHT = 5.5
const CAMERA_LOOK_AHEAD = 4.5

const tempVec = new Vector3()
const tempCamTarget = new Vector3()
const tempCamPosition = new Vector3()
const tempBodyPos = new Vector3()
const tempColor = new Color()
const warningColor = new Color('#9d291f')

const getCarPalette = (baseHex: string, damage: number) => {
  const t = Math.min(1, Math.max(0, damage / MAX_DAMAGE))
  const body = tempColor.set(baseHex).clone().lerp(warningColor, t * 0.65)
  const accent = tempColor.set(baseHex).clone().lerp(new Color('#f2f2f2'), 0.75 - t * 0.35)
  return {
    body: `#${body.getHexString()}`,
    accent: `#${accent.getHexString()}`,
  }
}

const getDamageForSpeed = (speed: number, hardHit: boolean) => {
  if (!hardHit) {
    return DAMAGE_TIERS.low
  }

  if (speed < 4) {
    return DAMAGE_TIERS.low
  }

  if (speed < 8) {
    return DAMAGE_TIERS.medium
  }

  return DAMAGE_TIERS.high
}

export const PlayerCar = ({ pickups, onCollectPickup, onPlayerPosition }: PlayerCarProps) => {
  const bodyRef = useRef<RapierRigidBody | null>(null)
  const lastDamageAt = useRef(0)
  const inputRef = useRef(createInputState())
  const shakeStrengthRef = useRef(0)
  const sparkStrengthRef = useRef(0)
  const sputterTimerRef = useRef(0)
  const sputterActiveRef = useRef(false)
  const yawRateRef = useRef(0)
  const hitSparkRef = useRef<Group>(null)
  const bumperRef = useRef<Group>(null)
  const loosePanelRef = useRef<Group>(null)
  const smoothedPosRef = useRef(new Vector3(START_POSITION.x, START_POSITION.y, START_POSITION.z))
  const smoothedForwardRef = useRef(new Vector3(0, 0, 1))
  const smoothedTargetRef = useRef(new Vector3(0, 0, 0))
  const { camera } = useThree()

  const damage = useGameStore((state) => state.damage)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const selectedCarColor = useGameStore((state) => state.selectedCarColor)
  const restartToken = useGameStore((state) => state.restartToken)
  const addDamage = useGameStore((state) => state.addDamage)
  const addScore = useGameStore((state) => state.addScore)
  const repair = useGameStore((state) => state.repair)
  const setKeyboardInput = useGameStore((state) => state.setKeyboardInput)
  const triggerHitFx = useGameStore((state) => state.triggerHitFx)
  const restartRun = useGameStore((state) => state.restartRun)

  const palette = useMemo(() => getCarPalette(selectedCarColor, damage), [selectedCarColor, damage])
  const crackOpacity = Math.min(0.72, Math.max(0, (damage - 38) / 62) * 0.72)

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    body.setTranslation(START_POSITION, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.setRotation({ x: 0, y: Math.sin(START_YAW / 2), z: 0, w: Math.cos(START_YAW / 2) }, true)
    shakeStrengthRef.current = 0
    sparkStrengthRef.current = 0
    sputterTimerRef.current = 0
    sputterActiveRef.current = false
    yawRateRef.current = 0
    smoothedPosRef.current.set(START_POSITION.x, START_POSITION.y, START_POSITION.z)
    smoothedForwardRef.current.set(0, 0, 1)
    smoothedTargetRef.current.set(START_POSITION.x, START_POSITION.y + 1.3, START_POSITION.z + CAMERA_LOOK_AHEAD)
  }, [restartToken])

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      void unlockAudio()
      applyKey(inputRef.current, event.code, true)
      const mapped = keyCodeToInput(event.code)
      if (mapped) {
        setKeyboardInput(mapped, true)
      }
    }
    const onUp = (event: KeyboardEvent) => {
      applyKey(inputRef.current, event.code, false)
      const mapped = keyCodeToInput(event.code)
      if (mapped) {
        setKeyboardInput(mapped, false)
      }
    }
    const onBlur = () => {
      inputRef.current = createInputState()
      setKeyboardInput('forward', false)
      setKeyboardInput('backward', false)
      setKeyboardInput('left', false)
      setKeyboardInput('right', false)
      setKeyboardInput('restart', false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [setKeyboardInput])

  useEffect(() => {
    setEngineMuted(engineMuted)
  }, [engineMuted])

  useEffect(() => {
    return () => {
      stopEngineSound()
    }
  }, [])

  useFrame((state, delta) => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    const pos = body.translation()
    onPlayerPosition([pos.x, pos.y, pos.z])

    if (status === 'lost') {
      updateEngineSound({ speed: 0, throttle: 0, direction: 'idle', surface: 'road' })
      if (inputRef.current.restart) {
        restartRun()
      }
      return
    }

    const input = getMergedInput(inputRef.current)
    const linVel = body.linvel()
    const rotation = body.rotation()
    const yaw = Math.atan2(
      2 * (rotation.w * rotation.y + rotation.x * rotation.z),
      1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
    )
    const forwardX = Math.sin(yaw)
    const forwardZ = Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)

    const forwardSpeed = linVel.x * forwardX + linVel.z * forwardZ
    const lateralSpeed = linVel.x * rightX + linVel.z * rightZ
    const absX = Math.abs(pos.x)
    const absZ = Math.abs(pos.z)
    const onRoad = (absX <= ROAD_OUTER_HALF && absZ <= ROAD_OUTER_HALF) && !(absX < ROAD_INNER_HALF && absZ < ROAD_INNER_HALF)
    const surfaceConfig = onRoad ? DRIVE_SURFACE.road : DRIVE_SURFACE.grass
    const damageRatio = Math.min(1, damage / MAX_DAMAGE)
    const accelScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.accelerationLoss
    const speedScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.topSpeedLoss
    const steeringScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.steeringLoss
    const gripScale = 1 - damageRatio * DAMAGE_DRIVE_EFFECTS.gripLoss

    const throttle = Number(input.forward) - Number(input.backward)
    const criticalDamage = damage >= DAMAGE_DRIVE_EFFECTS.criticalThreshold
    if (criticalDamage) {
      sputterTimerRef.current -= delta
      if (sputterTimerRef.current <= 0) {
        sputterTimerRef.current = DAMAGE_SPUTTER.minInterval + Math.random() * DAMAGE_SPUTTER.variableInterval
        sputterActiveRef.current = Math.random() < DAMAGE_SPUTTER.chance
      }
    } else {
      sputterActiveRef.current = false
      sputterTimerRef.current = 0
    }
    const throttleFactor = sputterActiveRef.current && throttle > 0 ? DAMAGE_SPUTTER.throttleFactor : 1
    const effectiveThrottle = throttle * throttleFactor

    const acceleration = (throttle >= 0 ? surfaceConfig.forwardAcceleration : surfaceConfig.reverseAcceleration) * accelScale
    let nextForwardSpeed = forwardSpeed + effectiveThrottle * acceleration * delta

    const rollingDrag = throttle === 0 ? surfaceConfig.coastDrag : surfaceConfig.throttleDrag
    nextForwardSpeed *= rollingDrag

    const maxForwardSpeed = surfaceConfig.forwardTopSpeed * speedScale
    const maxReverseSpeed = surfaceConfig.reverseTopSpeed * (0.85 + speedScale * 0.15)
    nextForwardSpeed = Math.max(maxReverseSpeed, Math.min(maxForwardSpeed, nextForwardSpeed))

    const gripLerp = Math.min(1, delta * 7.5 * gripScale * surfaceConfig.gripFactor)
    const nextLateralSpeed = lateralSpeed * (1 - gripLerp)

    const turnDirection = Number(input.left) - Number(input.right)
    const steerStrength = Math.min(1, Math.abs(nextForwardSpeed) / 5)
    const reverseSteer = nextForwardSpeed < -0.2 ? -0.7 : 1
    const targetYawRate = turnDirection * steerStrength * 1.55 * reverseSteer * steeringScale
    const yawBlend = Math.min(1, delta * 8)
    yawRateRef.current += (targetYawRate - yawRateRef.current) * yawBlend
    body.setAngvel({ x: 0, y: yawRateRef.current, z: 0 }, true)

    const nextVx = forwardX * nextForwardSpeed + rightX * nextLateralSpeed
    const nextVz = forwardZ * nextForwardSpeed + rightZ * nextLateralSpeed
    body.setLinvel({ x: nextVx, y: linVel.y, z: nextVz }, true)

    const engineDirection = nextForwardSpeed > 0.35 ? 'forward' : nextForwardSpeed < -0.35 ? 'reverse' : 'idle'
    updateEngineSound({
      speed: Math.abs(nextForwardSpeed),
      throttle: Math.abs(throttle),
      direction: engineDirection,
      surface: onRoad ? 'road' : 'grass',
    })

    const camPosSmoothing = 1 - Math.exp(-delta * 9)
    const camForwardSmoothing = 1 - Math.exp(-delta * 12)
    const camTargetSmoothing = 1 - Math.exp(-delta * 11)

    tempBodyPos.set(pos.x, pos.y, pos.z)
    smoothedPosRef.current.lerp(tempBodyPos, camPosSmoothing)
    tempVec.set(forwardX, 0, forwardZ)
    smoothedForwardRef.current.lerp(tempVec, camForwardSmoothing).normalize()

    tempCamTarget.set(
      smoothedPosRef.current.x + smoothedForwardRef.current.x * CAMERA_LOOK_AHEAD,
      smoothedPosRef.current.y + 1.3,
      smoothedPosRef.current.z + smoothedForwardRef.current.z * CAMERA_LOOK_AHEAD,
    )
    smoothedTargetRef.current.lerp(tempCamTarget, camTargetSmoothing)
    tempCamPosition.set(
      smoothedPosRef.current.x - smoothedForwardRef.current.x * CAMERA_FOLLOW_DISTANCE - nextVx * 0.16,
      smoothedPosRef.current.y + CAMERA_FOLLOW_HEIGHT,
      smoothedPosRef.current.z - smoothedForwardRef.current.z * CAMERA_FOLLOW_DISTANCE - nextVz * 0.16,
    )
    shakeStrengthRef.current *= Math.max(0, 1 - delta * 7.5)
    sparkStrengthRef.current *= Math.max(0, 1 - delta * 5.2)
    const shake = shakeStrengthRef.current
    if (shake > 0.002) {
      tempCamPosition.x += (Math.random() - 0.5) * shake
      tempCamPosition.y += (Math.random() - 0.5) * shake * 0.6
      tempCamPosition.z += (Math.random() - 0.5) * shake
    }
    if (hitSparkRef.current) {
      const spark = sparkStrengthRef.current
      hitSparkRef.current.visible = spark > 0.08
      hitSparkRef.current.scale.setScalar(0.7 + spark * 0.7)
    }
    if (bumperRef.current) {
      const bend = Math.max(0, (damage - 58) / 42)
      const targetRotX = -0.03 - bend * 0.3
      const targetPosY = -0.05 - bend * 0.09
      bumperRef.current.rotation.x += (targetRotX - bumperRef.current.rotation.x) * Math.min(1, delta * 7)
      bumperRef.current.position.y += (targetPosY - bumperRef.current.position.y) * Math.min(1, delta * 7)
    }
    if (loosePanelRef.current) {
      const isLoose = damage >= 82
      loosePanelRef.current.visible = isLoose
      if (isLoose) {
        const wobble = 0.08 + (damage - 82) / 18 * 0.08
        loosePanelRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 15) * wobble
        loosePanelRef.current.rotation.y = Math.cos(state.clock.elapsedTime * 9) * wobble * 0.5
      }
    }
    camera.position.lerp(tempCamPosition, camPosSmoothing)
    camera.lookAt(smoothedTargetRef.current)

    pickups.forEach((pickup) => {
      tempVec.set(pickup.position[0], pickup.position[1], pickup.position[2])
      const distance = tempVec.distanceTo(tempBodyPos)
      if (distance > 1.5) {
        return
      }

      if (pickup.type === 'star') {
        addScore(10)
      } else {
        repair(20)
      }
      playPickupSound(pickup.type)
      onCollectPickup(pickup.id)
    })
  })

  return (
    <RigidBody
      ref={bodyRef}
      name={PLAYER_BODY_NAME}
      colliders={false}
      position={[START_POSITION.x, START_POSITION.y, START_POSITION.z]}
      enabledRotations={[false, true, false]}
      angularDamping={2.4}
      linearDamping={0.6}
      mass={1.2}
      onCollisionEnter={(payload) => {
        if (status === 'lost') {
          return
        }

        const now = performance.now()
        if (now - lastDamageAt.current < 350) {
          return
        }

        const body = bodyRef.current
        if (!body) {
          return
        }

        const otherBodyName = payload.other.rigidBodyObject?.name ?? ''
        const hitIsHard = otherBodyName.startsWith('hard-')

        const velocity = body.linvel()
        const planarSpeed = Math.hypot(velocity.x, velocity.z)
        const damageDelta = getDamageForSpeed(planarSpeed, hitIsHard)
        addDamage(damageDelta)
        playCollisionSound(hitIsHard, planarSpeed)
        const hitStrength = Math.min(1, Math.max(0.18, planarSpeed / 10 + (hitIsHard ? 0.25 : 0)))
        shakeStrengthRef.current = Math.max(shakeStrengthRef.current, hitStrength * 0.45)
        sparkStrengthRef.current = Math.max(sparkStrengthRef.current, hitStrength)
        triggerHitFx(hitStrength)
        lastDamageAt.current = now
      }}
    >
      <CuboidCollider args={[0.7, 0.35, 1.2]} />
      <group>
        <Trail width={0.6} length={3.8} color={palette.body} attenuation={(t) => t * t}>
          <mesh castShadow position={[0, 0.2, 0]}>
            <boxGeometry args={[1.4, 0.7, 2.4]} />
            <meshStandardMaterial color={palette.body} metalness={0.3} roughness={0.35} />
          </mesh>
        </Trail>
        <mesh castShadow position={[0, 0.62, -0.1]}>
          <boxGeometry args={[1.1, 0.45, 1.1]} />
          <meshStandardMaterial color={palette.accent} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0, 0.8, 0.3]}>
          <boxGeometry args={[0.8, 0.2, 0.6]} />
          <meshStandardMaterial color="#a7d2ff" emissive="#2a71bf" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, 0.81, 0.41]}>
          <planeGeometry args={[0.7, 0.16]} />
          <meshStandardMaterial color="#1f2026" transparent opacity={crackOpacity} />
        </mesh>
        <group ref={bumperRef} position={[0, -0.05, 1.2]}>
          <mesh castShadow>
            <boxGeometry args={[1.35, 0.22, 0.24]} />
            <meshStandardMaterial color={damage >= 60 ? '#3f434f' : palette.accent} metalness={0.25} roughness={0.6} />
          </mesh>
        </group>
        <group ref={loosePanelRef} position={[0.82, 0.26, 0.18]} visible={false}>
          <mesh castShadow>
            <boxGeometry args={[0.12, 0.46, 0.72]} />
            <meshStandardMaterial color="#48515f" metalness={0.25} roughness={0.75} />
          </mesh>
        </group>
        {[[-0.6, -0.06, -0.8], [0.6, -0.06, -0.8], [-0.6, -0.06, 0.8], [0.6, -0.06, 0.8]].map(([x, y, z]) => (
          <mesh key={`${x}-${z}`} castShadow position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 20]} />
            <meshStandardMaterial color="#212329" />
          </mesh>
        ))}
      </group>
      {damage >= 70 && damage < MAX_DAMAGE ? (
        <group position={[0, 1.05, -0.8]}>
          <mesh>
            <sphereGeometry args={[0.35, 10, 10]} />
            <meshStandardMaterial color="#4f4f4f" transparent opacity={0.5} />
          </mesh>
          <mesh position={[0.25, 0.35, -0.05]}>
            <sphereGeometry args={[0.22, 10, 10]} />
            <meshStandardMaterial color="#6a6a6a" transparent opacity={0.35} />
          </mesh>
        </group>
      ) : null}
      <group ref={hitSparkRef} position={[0, 0.55, -0.05]} visible={false}>
        <Sparkles count={12} scale={1.8} size={8} speed={2.4} color="#ffe29f" />
      </group>
    </RigidBody>
  )
}
