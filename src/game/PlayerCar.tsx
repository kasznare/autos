import { Sparkles } from '@react-three/drei'
import { CuboidCollider, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color, Group, Vector3 } from 'three'
import { CarModel } from './CarModel'
import { CAR_PROFILES, DAMAGE_DRIVE_EFFECTS, DAMAGE_SPUTTER, DAMAGE_TIERS, DRIVE_SURFACE, KID_TUNING, MAX_DAMAGE, PLAYER_BODY_NAME, VEHICLE_PHYSICS } from './config'
import { applyKey, createInputState, getMergedInput, keyCodeToInput, resetGamepadInput, setGamepadInput } from './keys'
import { getTrackMap, isPointOnRoad, sampleTerrainHeight } from './maps'
import { playCollisionSound, playPickupSound, setEngineMuted, stopEngineSound, unlockAudio, updateEngineSound } from './sfx'
import { useGameStore } from './store'
import type { CollisionMaterial, Pickup } from './types'

type PlayerCarProps = {
  pickups: Pickup[]
  onCollectPickup: (pickupId: string) => void
  onPlayerPosition: (position: [number, number, number]) => void
  lowPowerMode?: boolean
}

const DEFAULT_START_POSITION = { x: 0, y: 0.38, z: 20 }
const CAMERA_FOLLOW_DISTANCE = 9.5
const CAMERA_FOLLOW_HEIGHT = 5.5
const CAMERA_LOOK_AHEAD = 4.5

const tempVec = new Vector3()
const tempCamTarget = new Vector3()
const tempCamPosition = new Vector3()
const tempBodyPos = new Vector3()
const tempColor = new Color()
const warningColor = new Color('#9d291f')
const normalizeAngleDelta = (angle: number) => {
  const twoPi = Math.PI * 2
  let out = angle % twoPi
  if (out > Math.PI) out -= twoPi
  if (out < -Math.PI) out += twoPi
  return out
}

const getCarPalette = (baseHex: string, damage: number) => {
  const t = Math.min(1, Math.max(0, damage / MAX_DAMAGE))
  const body = tempColor.set(baseHex).clone().lerp(warningColor, t * 0.65)
  const accent = tempColor.set(baseHex).clone().lerp(new Color('#f2f2f2'), 0.75 - t * 0.35)
  return {
    body: `#${body.getHexString()}`,
    accent: `#${accent.getHexString()}`,
  }
}

const getCollisionMaterial = (name: string): CollisionMaterial => {
  if (name.startsWith('hard-')) return 'hard'
  if (name.startsWith('medium-')) return 'medium'
  return 'soft'
}

const getImpactLabel = (material: CollisionMaterial, damageDelta: number, scrape = false) => {
  if (scrape) {
    return 'Side scrape'
  }
  if (material === 'soft') {
    return 'Soft bump'
  }
  if (material === 'medium') {
    return damageDelta >= DAMAGE_TIERS.medium ? 'Crate hit' : 'Light hit'
  }
  return damageDelta >= DAMAGE_TIERS.high ? 'Big crash' : 'Hard hit'
}

const getDamageForImpact = (speed: number, material: CollisionMaterial, forwardAlignment: number) => {
  const speedFactor = Math.min(1.25, Math.max(0, speed / 11))
  const angleFactor = 0.55 + forwardAlignment * 0.75
  const materialScale = material === 'hard' ? 1.4 : material === 'medium' ? 0.95 : 0.35

  const base = DAMAGE_TIERS.medium * speedFactor * angleFactor * materialScale
  return Math.max(1, Math.round(base))
}

export const PlayerCar = ({ pickups, onCollectPickup, onPlayerPosition, lowPowerMode = false }: PlayerCarProps) => {
  const bodyRef = useRef<RapierRigidBody | null>(null)
  const lastDamageAt = useRef(0)
  const inputRef = useRef(createInputState())
  const shakeStrengthRef = useRef(0)
  const sparkStrengthRef = useRef(0)
  const sputterTimerRef = useRef(0)
  const sputterActiveRef = useRef(false)
  const steerAngleRef = useRef(0)
  const yawRateRef = useRef(0)
  const lastYawRef = useRef(0)
  const stuckSteerTimerRef = useRef(0)
  const hardContactCountRef = useRef(0)
  const scrapeDamageTimerRef = useRef(0)
  const armorTimerRef = useRef(0)
  const hitSparkRef = useRef<Group>(null)
  const bumperRef = useRef<Group>(null)
  const loosePanelRef = useRef<Group>(null)
  const hoodRef = useRef<Group>(null)
  const roofRef = useRef<Group>(null)
  const leftDoorRef = useRef<Group>(null)
  const rightDoorRef = useRef<Group>(null)
  const activeGamepadIndexRef = useRef<number | null>(null)
  const smoothedPosRef = useRef(new Vector3(DEFAULT_START_POSITION.x, DEFAULT_START_POSITION.y, DEFAULT_START_POSITION.z))
  const smoothedForwardRef = useRef(new Vector3(0, 0, 1))
  const smoothedTargetRef = useRef(new Vector3(0, 0, 0))
  const { camera } = useThree()

  const damage = useGameStore((state) => state.damage)
  const status = useGameStore((state) => state.status)
  const engineMuted = useGameStore((state) => state.engineMuted)
  const selectedCarColor = useGameStore((state) => state.selectedCarColor)
  const selectedCarProfile = useGameStore((state) => state.selectedCarProfile)
  const selectedMapId = useGameStore((state) => state.selectedMapId)
  const proceduralMapSeed = useGameStore((state) => state.proceduralMapSeed)
  const restartToken = useGameStore((state) => state.restartToken)
  const addDamage = useGameStore((state) => state.addDamage)
  const addScore = useGameStore((state) => state.addScore)
  const repair = useGameStore((state) => state.repair)
  const setKeyboardInput = useGameStore((state) => state.setKeyboardInput)
  const triggerHitFx = useGameStore((state) => state.triggerHitFx)
  const restartRun = useGameStore((state) => state.restartRun)
  const setTelemetry = useGameStore((state) => state.setTelemetry)
  const setGamepadConnected = useGameStore((state) => state.setGamepadConnected)

  const palette = useMemo(() => getCarPalette(selectedCarColor, damage), [selectedCarColor, damage])
  const profile = CAR_PROFILES[selectedCarProfile]
  const map = useMemo(() => getTrackMap(selectedMapId, proceduralMapSeed), [selectedMapId, proceduralMapSeed])
  const crackOpacity = Math.min(0.72, Math.max(0, (damage - 38) / 62) * 0.72)
  const startPosition = useMemo(() => {
    const x = map.startPosition[0]
    const z = map.startPosition[2]
    return { x, y: sampleTerrainHeight(map, x, z) + 1.05, z }
  }, [map])
  const startYaw = map.startYaw

  useEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }

    body.setTranslation(startPosition, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.setRotation({ x: 0, y: Math.sin(startYaw / 2), z: 0, w: Math.cos(startYaw / 2) }, true)
    shakeStrengthRef.current = 0
    sparkStrengthRef.current = 0
    sputterTimerRef.current = 0
    sputterActiveRef.current = false
    steerAngleRef.current = 0
    yawRateRef.current = 0
    lastYawRef.current = startYaw
    stuckSteerTimerRef.current = 0
    hardContactCountRef.current = 0
    scrapeDamageTimerRef.current = 0
    armorTimerRef.current = 0
    setTelemetry(0, 0)
    smoothedPosRef.current.set(startPosition.x, startPosition.y, startPosition.z)
    smoothedForwardRef.current.set(0, 0, 1)
    smoothedTargetRef.current.set(startPosition.x, startPosition.y + 1.3, startPosition.z + CAMERA_LOOK_AHEAD)
  }, [restartToken, setTelemetry, startPosition, startYaw])

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
    const updateConnectedState = () => {
      if (typeof navigator === 'undefined' || !navigator.getGamepads) {
        setGamepadConnected(false)
        return
      }
      const pads = navigator.getGamepads()
      const hasPad = Array.from(pads).some((pad) => Boolean(pad && pad.connected))
      setGamepadConnected(hasPad)
      if (!hasPad) {
        activeGamepadIndexRef.current = null
        resetGamepadInput()
      }
    }

    const onGamepadConnected = (event: Event) => {
      const gamepadEvent = event as GamepadEvent
      activeGamepadIndexRef.current = gamepadEvent.gamepad.index
      setGamepadConnected(true)
    }

    const onGamepadDisconnected = () => {
      updateConnectedState()
    }

    window.addEventListener('gamepadconnected', onGamepadConnected)
    window.addEventListener('gamepaddisconnected', onGamepadDisconnected)
    updateConnectedState()

    return () => {
      window.removeEventListener('gamepadconnected', onGamepadConnected)
      window.removeEventListener('gamepaddisconnected', onGamepadDisconnected)
      resetGamepadInput()
      setGamepadConnected(false)
    }
  }, [setGamepadConnected])

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

    if (typeof navigator !== 'undefined' && navigator.getGamepads) {
      const pads = navigator.getGamepads()
      let gamepad: Gamepad | null = null
      const activeIdx = activeGamepadIndexRef.current
      if (activeIdx !== null && pads[activeIdx] && pads[activeIdx]?.connected) {
        gamepad = pads[activeIdx]
      } else {
        gamepad = Array.from(pads).find((pad) => Boolean(pad && pad.connected)) ?? null
        activeGamepadIndexRef.current = gamepad?.index ?? null
      }

      if (gamepad) {
        const axisX = gamepad.axes[0] ?? 0
        const axisY = gamepad.axes[1] ?? 0
        const dpadUp = Boolean(gamepad.buttons[12]?.pressed)
        const dpadDown = Boolean(gamepad.buttons[13]?.pressed)
        const dpadLeft = Boolean(gamepad.buttons[14]?.pressed)
        const dpadRight = Boolean(gamepad.buttons[15]?.pressed)
        const r2 = gamepad.buttons[7]?.value ?? 0
        const l2 = gamepad.buttons[6]?.value ?? 0
        const cross = Boolean(gamepad.buttons[0]?.pressed)
        const options = Boolean(gamepad.buttons[9]?.pressed)

        setGamepadInput('forward', r2 > 0.16 || axisY < -0.32 || dpadUp)
        setGamepadInput('backward', l2 > 0.16 || axisY > 0.32 || dpadDown)
        setGamepadInput('left', axisX < -0.28 || dpadLeft)
        setGamepadInput('right', axisX > 0.28 || dpadRight)
        setGamepadInput('restart', cross || options)
      } else {
        resetGamepadInput()
      }
    }

    const pos = body.translation()
    const maxOutOfBounds = map.worldHalf * 1.08
    if (Math.abs(pos.x) > maxOutOfBounds || Math.abs(pos.z) > maxOutOfBounds) {
      body.setTranslation(startPosition, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      body.setRotation({ x: 0, y: Math.sin(startYaw / 2), z: 0, w: Math.cos(startYaw / 2) }, true)
      yawRateRef.current = 0
      steerAngleRef.current = 0
      lastYawRef.current = startYaw
      stuckSteerTimerRef.current = 0
      smoothedPosRef.current.set(startPosition.x, startPosition.y, startPosition.z)
      smoothedForwardRef.current.set(Math.sin(startYaw), 0, Math.cos(startYaw))
      smoothedTargetRef.current.set(startPosition.x, startPosition.y + 1.3, startPosition.z + CAMERA_LOOK_AHEAD)
      setTelemetry(0, 0)
      triggerHitFx(0.22, 'Back on road')
      onPlayerPosition([startPosition.x, startPosition.y, startPosition.z])
      return
    }
    if (status === 'lost') {
      setTelemetry(0, 0)
      updateEngineSound({ speed: 0, throttle: 0, direction: 'idle', surface: 'road', tone: profile.engineTone })
      if (inputRef.current.restart) {
        restartRun()
      }
      return
    }

    const input = getMergedInput(inputRef.current)
    armorTimerRef.current = Math.max(0, armorTimerRef.current - delta)
    const armorActive = armorTimerRef.current > 0
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
    const onRoad = isPointOnRoad(map, pos.x, pos.z)
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

    const forwardAccel = surfaceConfig.forwardAcceleration * accelScale * profile.accelMult
    const reverseAccel = surfaceConfig.reverseAcceleration * accelScale * profile.accelMult * 1.25
    let nextForwardSpeed = forwardSpeed
    const wantsForward = effectiveThrottle > 0.02
    const wantsBackward = effectiveThrottle < -0.02
    const throttleAbs = Math.min(1, Math.abs(effectiveThrottle))

    if (wantsForward && nextForwardSpeed >= -0.15) {
      nextForwardSpeed += throttleAbs * forwardAccel * delta
    } else if (wantsBackward && nextForwardSpeed <= 0.15) {
      nextForwardSpeed += effectiveThrottle * reverseAccel * delta
    }

    if (wantsBackward && nextForwardSpeed > 0) {
      nextForwardSpeed -= VEHICLE_PHYSICS.brakeDecel * delta
    } else if (wantsForward && nextForwardSpeed < 0) {
      nextForwardSpeed += VEHICLE_PHYSICS.reverseBrakeDecel * delta
    }

    if (Math.abs(throttle) < 0.02) {
      const brakeDir = Math.sign(nextForwardSpeed)
      nextForwardSpeed -= brakeDir * VEHICLE_PHYSICS.engineBrake * delta
    }

    const speedAbs = Math.abs(nextForwardSpeed)
    const dragForce = (VEHICLE_PHYSICS.rollingResistance * speedAbs + VEHICLE_PHYSICS.aeroDrag * speedAbs * speedAbs) * delta
    nextForwardSpeed -= Math.sign(nextForwardSpeed) * Math.min(speedAbs, dragForce)

    const maxForwardSpeed = surfaceConfig.forwardTopSpeed * speedScale * profile.topSpeedMult
    const maxReverseSpeed = surfaceConfig.reverseTopSpeed * (0.92 + speedScale * 0.2) * profile.reverseSpeedMult * 1.2
    nextForwardSpeed = Math.max(maxReverseSpeed, Math.min(maxForwardSpeed, nextForwardSpeed))

    const gripLerp = Math.min(1, delta * (6.4 + Math.abs(nextForwardSpeed) * 0.45) * gripScale * surfaceConfig.gripFactor * profile.gripMult)
    const nextLateralSpeed = lateralSpeed * (1 - gripLerp)

    const turnDirection = Number(input.left) - Number(input.right)
    const speedSteerScale = 1 - Math.min(0.62, Math.abs(nextForwardSpeed) / 16)
    const targetSteerAngle =
      turnDirection *
      VEHICLE_PHYSICS.maxSteerRad *
      (0.55 + speedSteerScale * 0.45) *
      steeringScale *
      profile.steeringMult
    const steerBlend = Math.min(1, delta * VEHICLE_PHYSICS.steerResponse)
    steerAngleRef.current += (targetSteerAngle - steerAngleRef.current) * steerBlend
    const reverseSteer = nextForwardSpeed < -0.15 ? -0.55 : 1
    const targetYawRate =
      ((nextForwardSpeed / VEHICLE_PHYSICS.wheelBase) * Math.tan(steerAngleRef.current) * reverseSteer) /
      Math.max(1, 0.55 + Math.abs(nextForwardSpeed) * 0.06)
    const yawBlend = Math.min(1, delta * 10)
    yawRateRef.current += (targetYawRate - yawRateRef.current) * yawBlend
    let nextYaw = yaw + yawRateRef.current * delta

    const angVel = body.angvel()
    const yawDelta = Math.abs(normalizeAngleDelta(nextYaw - lastYawRef.current))
    if (Math.abs(turnDirection) > 0 && Math.abs(nextForwardSpeed) > 2 && yawDelta < 0.0006) {
      stuckSteerTimerRef.current += delta
      if (stuckSteerTimerRef.current > 0.45) {
        nextYaw += turnDirection * 0.015
        yawRateRef.current = targetYawRate * 0.75
        stuckSteerTimerRef.current = 0
      }
    } else {
      stuckSteerTimerRef.current = Math.max(0, stuckSteerTimerRef.current - delta * 2)
    }
    const yawError = normalizeAngleDelta(nextYaw - yaw)
    const yawRateError = targetYawRate - angVel.y
    body.applyTorqueImpulse(
      {
        x: -angVel.x * 0.08,
        y: yawError * (1.8 + Math.abs(nextForwardSpeed) * 0.32) + yawRateError * 0.9,
        z: -angVel.z * 0.08,
      },
      true,
    )
    setTelemetry(Math.abs(nextForwardSpeed) * 3.6, (steerAngleRef.current * 180) / Math.PI)

    onPlayerPosition([pos.x, pos.y, pos.z])

    lastYawRef.current = nextYaw
    const moveForwardX = Math.sin(nextYaw)
    const moveForwardZ = Math.cos(nextYaw)
    const moveRightX = Math.cos(nextYaw)
    const moveRightZ = -Math.sin(nextYaw)
    const deltaForward = nextForwardSpeed - forwardSpeed
    const deltaLateral = nextLateralSpeed - lateralSpeed
    const driveMass = Math.max(0.8, body.mass())
    body.applyImpulse(
      {
        x: (moveForwardX * deltaForward + moveRightX * deltaLateral) * driveMass,
        y: 0,
        z: (moveForwardZ * deltaForward + moveRightZ * deltaLateral) * driveMass,
      },
      true,
    )
    const postVel = body.linvel()
    const nextVx = postVel.x
    const nextVz = postVel.z

    if (hardContactCountRef.current > 0 && Math.abs(nextForwardSpeed) > 2) {
      scrapeDamageTimerRef.current += delta
      if (scrapeDamageTimerRef.current >= 0.72) {
        scrapeDamageTimerRef.current = 0
        const scrapeDamage = Math.round(profile.damageTakenMult * KID_TUNING.damageTakenScale * (armorActive ? KID_TUNING.armorDamageScale : 1))
        if (scrapeDamage > 0) {
          addDamage(scrapeDamage)
          triggerHitFx(0.2, getImpactLabel('hard', scrapeDamage, true))
        }
      }
    } else {
      scrapeDamageTimerRef.current = 0
    }

    const engineDirection = nextForwardSpeed > 0.35 ? 'forward' : nextForwardSpeed < -0.35 ? 'reverse' : 'idle'
    const lateralLoad = Math.min(1, Math.abs(nextLateralSpeed) / 2.4)
    const engineLoad = Math.min(1, damageRatio * 0.55 + lateralLoad * 0.35 + (onRoad ? 0 : 0.2))
    updateEngineSound({
      speed: Math.abs(nextForwardSpeed),
      throttle: Math.abs(throttle),
      direction: engineDirection,
      surface: onRoad ? 'road' : 'grass',
      engineLoad,
      tone: profile.engineTone,
    })

    const camPosSmoothing = 1 - Math.exp(-delta * 9)
    const camForwardSmoothing = 1 - Math.exp(-delta * 12)
    const camTargetSmoothing = 1 - Math.exp(-delta * 11)

    tempBodyPos.set(pos.x, pos.y, pos.z)
    smoothedPosRef.current.lerp(tempBodyPos, camPosSmoothing)
    tempVec.set(forwardX, 0, forwardZ)
    if (tempVec.lengthSq() < 0.0001) {
      tempVec.set(Math.sin(yaw), 0, Math.cos(yaw))
    }
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
      const targetPosY = 0.03 - bend * 0.09
      bumperRef.current.rotation.x += (targetRotX - bumperRef.current.rotation.x) * Math.min(1, delta * 7)
      bumperRef.current.position.y += (targetPosY - bumperRef.current.position.y) * Math.min(1, delta * 7)
    }
    if (hoodRef.current) {
      const d = Math.max(0, (damage - 40) / 60)
      hoodRef.current.rotation.x += (-0.08 - d * 0.38 - hoodRef.current.rotation.x) * Math.min(1, delta * 6.5)
      hoodRef.current.position.y += (0.52 - d * 0.05 - hoodRef.current.position.y) * Math.min(1, delta * 6.5)
    }
    if (roofRef.current) {
      const d = Math.max(0, (damage - 55) / 45)
      const targetScaleY = 1 - d * 0.14
      roofRef.current.scale.y += (targetScaleY - roofRef.current.scale.y) * Math.min(1, delta * 5)
      roofRef.current.rotation.z += (Math.sin(state.clock.elapsedTime * 1.8) * d * 0.04 - roofRef.current.rotation.z) * Math.min(1, delta * 3)
    }
    if (leftDoorRef.current) {
      const d = Math.max(0, (damage - 65) / 35)
      leftDoorRef.current.rotation.z += (0.04 + d * 0.11 - leftDoorRef.current.rotation.z) * Math.min(1, delta * 5)
    }
    if (rightDoorRef.current) {
      const d = Math.max(0, (damage - 62) / 38)
      rightDoorRef.current.rotation.z += (-0.04 - d * 0.12 - rightDoorRef.current.rotation.z) * Math.min(1, delta * 5)
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
      } else if (pickup.type === 'repair') {
        repair(28)
      } else {
        repair(12)
        addScore(4)
        armorTimerRef.current = Math.max(armorTimerRef.current, KID_TUNING.armorDurationSec)
        triggerHitFx(0.24, 'Spare parts shield')
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
      position={[startPosition.x, startPosition.y, startPosition.z]}
      enabledRotations={[true, true, true]}
      ccd
      angularDamping={1.8}
      linearDamping={0.18}
      mass={profile.mass}
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
        const material = getCollisionMaterial(otherBodyName)
        if (material === 'hard') {
          hardContactCountRef.current += 1
        }

        const velocity = body.linvel()
        const planarSpeed = Math.hypot(velocity.x, velocity.z)
        const rotation = body.rotation()
        const yaw = Math.atan2(
          2 * (rotation.w * rotation.y + rotation.x * rotation.z),
          1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
        )
        const forwardX = Math.sin(yaw)
        const forwardZ = Math.cos(yaw)
        const speed = Math.max(0.001, planarSpeed)
        const velocityDirX = velocity.x / speed
        const velocityDirZ = velocity.z / speed
        const forwardAlignment = Math.abs(velocityDirX * forwardX + velocityDirZ * forwardZ)

        const damageDelta = getDamageForImpact(planarSpeed, material, forwardAlignment)
        const scaledDamage = Math.max(
          1,
          Math.round(
            damageDelta *
              profile.damageTakenMult *
              KID_TUNING.damageTakenScale *
              (armorTimerRef.current > 0 ? KID_TUNING.armorDamageScale : 1),
          ),
        )
        addDamage(scaledDamage)
        playCollisionSound(material === 'hard', planarSpeed)
        const hitStrength = Math.min(
          1,
          Math.max(0.16, planarSpeed / 10 + (material === 'hard' ? 0.25 : material === 'medium' ? 0.1 : 0)),
        )
        shakeStrengthRef.current = Math.max(shakeStrengthRef.current, hitStrength * 0.45)
        sparkStrengthRef.current = Math.max(sparkStrengthRef.current, hitStrength)
        triggerHitFx(hitStrength, getImpactLabel(material, scaledDamage))
        lastDamageAt.current = now
      }}
      onCollisionExit={(payload) => {
        const material = getCollisionMaterial(payload.other.rigidBodyObject?.name ?? '')
        if (material === 'hard') {
          hardContactCountRef.current = Math.max(0, hardContactCountRef.current - 1)
        }
      }}
    >
      <CuboidCollider args={[0.72, 0.38, 1.22]} />
      <CarModel
        bodyColor={palette.body}
        accentColor={palette.accent}
        damage={damage}
        lowPowerMode={lowPowerMode}
        showTrail
        crackOpacity={crackOpacity}
        bumperRef={bumperRef}
        loosePanelRef={loosePanelRef}
        hoodRef={hoodRef}
        roofRef={roofRef}
        leftDoorRef={leftDoorRef}
        rightDoorRef={rightDoorRef}
      />
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
      {lowPowerMode ? null : (
        <group ref={hitSparkRef} position={[0, 0.55, -0.05]} visible={false}>
          <Sparkles count={12} scale={1.8} size={8} speed={2.4} color="#ffe29f" />
        </group>
      )}
    </RigidBody>
  )
}
