import { Line, Trail } from '@react-three/drei'
import type { RefObject } from 'react'
import { BackSide } from 'three'
import type { Group } from 'three'
import type { RenderMode } from './store/types'

type CarModelProps = {
  bodyColor: string
  accentColor: string
  damage: number
  lowPowerMode?: boolean
  showTrail?: boolean
  crackOpacity?: number
  renderMode?: RenderMode
  wireframe?: boolean
  bumperRef?: RefObject<Group | null>
  loosePanelRef?: RefObject<Group | null>
  hoodRef?: RefObject<Group | null>
  roofRef?: RefObject<Group | null>
  leftDoorRef?: RefObject<Group | null>
  rightDoorRef?: RefObject<Group | null>
  frontLeftSteerRad?: number
  frontRightSteerRad?: number
  wheelSpinRad?: number
  physicsDebugView?: boolean
  debugWheelPositions?: readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]
  oneWheelDebugView?: boolean
}

export const CarModel = ({
  bodyColor,
  accentColor,
  damage,
  lowPowerMode = false,
  showTrail = true,
  crackOpacity,
  renderMode = 'pretty',
  wireframe = false,
  bumperRef,
  loosePanelRef,
  hoodRef,
  roofRef,
  leftDoorRef,
  rightDoorRef,
  frontLeftSteerRad = 0,
  frontRightSteerRad = 0,
  wheelSpinRad = 0,
  physicsDebugView = false,
  debugWheelPositions,
  oneWheelDebugView = false,
}: CarModelProps) => {
  const mirrorFellOff = damage >= 58
  const spoilerFellOff = damage >= 72
  const rightDoorFellOff = damage >= 86
  const frontBumperFellOff = damage >= 92
  const glassCrackOpacity = crackOpacity ?? Math.min(0.72, Math.max(0, (damage - 38) / 62) * 0.72)
  const flatDebug = renderMode === 'flat-debug'
  const safeFrontLeftSteer = Number.isFinite(frontLeftSteerRad) ? frontLeftSteerRad : 0
  const safeFrontRightSteer = Number.isFinite(frontRightSteerRad) ? frontRightSteerRad : 0
  const safeWheelSpin = Number.isFinite(wheelSpinRad) ? wheelSpinRad : 0

  if (physicsDebugView) {
    const fl: [number, number, number] = debugWheelPositions ? [...debugWheelPositions[0]] as [number, number, number] : [-0.6, 0.04, 0.8]
    const fr: [number, number, number] = debugWheelPositions ? [...debugWheelPositions[1]] as [number, number, number] : [0.6, 0.04, 0.8]
    const rl: [number, number, number] = debugWheelPositions ? [...debugWheelPositions[2]] as [number, number, number] : [-0.6, 0.04, -0.8]
    const rr: [number, number, number] = debugWheelPositions ? [...debugWheelPositions[3]] as [number, number, number] : [0.6, 0.04, -0.8]
    const frameHeight = 0.34
    const afl: [number, number, number] = [fl[0], fl[1] + frameHeight, fl[2]]
    const afr: [number, number, number] = [fr[0], fr[1] + frameHeight, fr[2]]
    const arl: [number, number, number] = [rl[0], rl[1] + frameHeight, rl[2]]
    const arr: [number, number, number] = [rr[0], rr[1] + frameHeight, rr[2]]
    return (
      <group>
        {oneWheelDebugView ? (
          <>
            <group position={fl} rotation={[0, safeFrontLeftSteer, 0]}>
              <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
                <meshStandardMaterial color="#2a2f3a" emissive="#6ac3ff" emissiveIntensity={0.12} roughness={0.9} metalness={0} />
              </mesh>
              <mesh>
                <sphereGeometry args={[0.055, 8, 8]} />
                <meshBasicMaterial color="#8be3ff" />
              </mesh>
            </group>
            <Line points={[afl, fl]} color="#b6f7c2" lineWidth={1.8} />
            <mesh position={fl} renderOrder={2000}>
              <sphereGeometry args={[0.13, 12, 12]} />
              <meshBasicMaterial color="#00f0ff" depthTest={false} depthWrite={false} />
            </mesh>
          </>
        ) : (
          <>
        <group position={fl} rotation={[0, safeFrontLeftSteer, 0]}>
          <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
            <meshStandardMaterial color="#2a2f3a" emissive="#6ac3ff" emissiveIntensity={0.12} roughness={0.9} metalness={0} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#8be3ff" />
          </mesh>
        </group>
        <group position={fr} rotation={[0, safeFrontRightSteer, 0]}>
          <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
            <meshStandardMaterial color="#2a2f3a" emissive="#6ac3ff" emissiveIntensity={0.12} roughness={0.9} metalness={0} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#8be3ff" />
          </mesh>
        </group>
        <group position={rl}>
          <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
            <meshStandardMaterial color="#2a2f3a" emissive="#6ac3ff" emissiveIntensity={0.12} roughness={0.9} metalness={0} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#8be3ff" />
          </mesh>
        </group>
        <group position={rr}>
          <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
            <meshStandardMaterial color="#2a2f3a" emissive="#6ac3ff" emissiveIntensity={0.12} roughness={0.9} metalness={0} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.055, 8, 8]} />
            <meshBasicMaterial color="#8be3ff" />
          </mesh>
        </group>
        <Line points={[afl, arl]} color="#7fd8ff" lineWidth={2} />
        <Line points={[afr, arr]} color="#7fd8ff" lineWidth={2} />
        <Line points={[afl, afr]} color="#ffca73" lineWidth={2} />
        <Line points={[arl, arr]} color="#ffca73" lineWidth={2} />
        <Line points={[afl, fl]} color="#b6f7c2" lineWidth={1.5} />
        <Line points={[afr, fr]} color="#b6f7c2" lineWidth={1.5} />
        <Line points={[arl, rl]} color="#b6f7c2" lineWidth={1.5} />
        <Line points={[arr, rr]} color="#b6f7c2" lineWidth={1.5} />
        <mesh position={fl} renderOrder={2000}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial color="#00f0ff" depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={fr} renderOrder={2000}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial color="#00f0ff" depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={rl} renderOrder={2000}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial color="#00f0ff" depthTest={false} depthWrite={false} />
        </mesh>
        <mesh position={rr} renderOrder={2000}>
          <sphereGeometry args={[0.13, 12, 12]} />
          <meshBasicMaterial color="#00f0ff" depthTest={false} depthWrite={false} />
        </mesh>
          </>
        )}
      </group>
    )
  }

  if (flatDebug) {
    return (
      <group>
        <group position={[0, 0.38, 0]}>
          <mesh castShadow={!lowPowerMode}>
            <boxGeometry args={[1.45, 0.62, 2.5]} />
            <meshStandardMaterial color={bodyColor} roughness={0.95} metalness={0} wireframe={wireframe} />
          </mesh>
          <mesh scale={[1.06, 1.06, 1.06]}>
            <boxGeometry args={[1.45, 0.62, 2.5]} />
            <meshBasicMaterial color="#11151c" side={BackSide} />
          </mesh>
        </group>
        <group ref={roofRef} position={[0, 0.86, -0.02]}>
          <mesh castShadow={!lowPowerMode}>
            <boxGeometry args={[0.94, 0.34, 1.16]} />
            <meshStandardMaterial color={accentColor} roughness={0.92} metalness={0} wireframe={wireframe} />
          </mesh>
          <mesh scale={[1.08, 1.08, 1.08]}>
            <boxGeometry args={[0.94, 0.34, 1.16]} />
            <meshBasicMaterial color="#11151c" side={BackSide} />
          </mesh>
        </group>
        <group ref={hoodRef} position={[0, 0.54, 0.9]}>
          <mesh castShadow={!lowPowerMode}>
            <boxGeometry args={[1.1, 0.18, 0.86]} />
            <meshStandardMaterial color={bodyColor} roughness={0.95} metalness={0} wireframe={wireframe} />
          </mesh>
        </group>
        <group ref={leftDoorRef} position={[-0.76, 0.42, 0]}>
          <mesh castShadow={!lowPowerMode}>
            <boxGeometry args={[0.1, 0.42, 1.16]} />
            <meshStandardMaterial color={bodyColor} roughness={0.95} metalness={0} wireframe={wireframe} />
          </mesh>
        </group>
        {rightDoorFellOff ? null : (
          <group ref={rightDoorRef} position={[0.76, 0.42, 0]}>
            <mesh castShadow={!lowPowerMode}>
              <boxGeometry args={[0.1, 0.42, 1.16]} />
              <meshStandardMaterial color={bodyColor} roughness={0.95} metalness={0} wireframe={wireframe} />
            </mesh>
          </group>
        )}
        {frontBumperFellOff ? null : (
          <group ref={bumperRef} position={[0, 0.03, 1.2]}>
            <mesh castShadow={!lowPowerMode}>
              <boxGeometry args={[1.35, 0.2, 0.24]} />
              <meshStandardMaterial color={accentColor} roughness={0.95} metalness={0} wireframe={wireframe} />
            </mesh>
          </group>
        )}
        <group ref={loosePanelRef} position={[0.82, 0.26, 0.18]} visible={false}>
          <mesh castShadow={!lowPowerMode}>
            <boxGeometry args={[0.12, 0.46, 0.72]} />
            <meshStandardMaterial color="#323840" roughness={1} metalness={0} wireframe={wireframe} />
          </mesh>
        </group>
        <group position={[-0.6, -0.08, 0.8]} rotation={[0, safeFrontLeftSteer, 0]}>
          <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
            <meshStandardMaterial color="#20242d" roughness={0.95} metalness={0} wireframe={wireframe} />
          </mesh>
        </group>
        <group position={[0.6, -0.08, 0.8]} rotation={[0, safeFrontRightSteer, 0]}>
          <mesh castShadow={!lowPowerMode} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
            <meshStandardMaterial color="#20242d" roughness={0.95} metalness={0} wireframe={wireframe} />
          </mesh>
        </group>
        <mesh castShadow={!lowPowerMode} position={[-0.6, -0.08, -0.8]} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
          <meshStandardMaterial color="#20242d" roughness={0.95} metalness={0} wireframe={wireframe} />
        </mesh>
        <mesh castShadow={!lowPowerMode} position={[0.6, -0.08, -0.8]} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.27, 0.27, 0.3, 12]} />
          <meshStandardMaterial color="#20242d" roughness={0.95} metalness={0} wireframe={wireframe} />
        </mesh>
        <mesh position={[0, 0.92, 0.45]}>
          <planeGeometry args={[0.72, 0.18]} />
          <meshStandardMaterial color="#304151" transparent opacity={Math.min(0.65, 0.25 + glassCrackOpacity)} />
        </mesh>
      </group>
    )
  }

  const shell = (
    <group>
      <mesh castShadow position={[0, 0.3, 0]}>
        <boxGeometry args={[1.42, 0.52, 2.45]} />
        <meshStandardMaterial color={bodyColor} metalness={0.34} roughness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[1.48, 0.16, 2.36]} />
        <meshStandardMaterial color={damage >= 70 ? '#3f434f' : accentColor} metalness={0.2} roughness={0.66} />
      </mesh>
      <group ref={hoodRef} position={[0, 0.52, 0.9]}>
        <mesh castShadow>
          <boxGeometry args={[1.08, 0.16, 0.86]} />
          <meshStandardMaterial color={bodyColor} metalness={0.32} roughness={0.38} />
        </mesh>
      </group>
      <group ref={roofRef} position={[0, 0.92, 0.03]}>
        <mesh castShadow>
          <boxGeometry args={[0.9, 0.2, 0.92]} />
          <meshStandardMaterial color={accentColor} roughness={0.5} />
        </mesh>
      </group>
      <group ref={leftDoorRef} position={[-0.76, 0.45, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.1, 0.42, 1.15]} />
          <meshStandardMaterial color={bodyColor} metalness={0.28} roughness={0.45} />
        </mesh>
      </group>
      {rightDoorFellOff ? null : (
        <group ref={rightDoorRef} position={[0.76, 0.45, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.1, 0.42, 1.15]} />
            <meshStandardMaterial color={bodyColor} metalness={0.28} roughness={0.45} />
          </mesh>
        </group>
      )}
      {mirrorFellOff ? null : (
        <>
          <mesh castShadow position={[-0.86, 0.64, 0.65]}>
            <boxGeometry args={[0.12, 0.08, 0.18]} />
            <meshStandardMaterial color="#2b3038" roughness={0.55} />
          </mesh>
          <mesh castShadow position={[0.86, 0.64, 0.65]}>
            <boxGeometry args={[0.12, 0.08, 0.18]} />
            <meshStandardMaterial color="#2b3038" roughness={0.55} />
          </mesh>
        </>
      )}
    </group>
  )

  return (
    <group>
      {lowPowerMode ? (
        <mesh castShadow position={[0, 0.3, 0]}>
          <boxGeometry args={[1.4, 0.7, 2.4]} />
          <meshStandardMaterial color={bodyColor} metalness={0.3} roughness={0.35} />
        </mesh>
      ) : showTrail ? (
        <Trail width={0.6} length={3.8} color={bodyColor} attenuation={(t) => t * t}>
          {shell}
        </Trail>
      ) : (
        shell
      )}
      {lowPowerMode ? (
        <>
          <mesh castShadow position={[0, 0.75, -0.1]}>
            <boxGeometry args={[1.1, 0.45, 1.1]} />
            <meshStandardMaterial color={accentColor} roughness={0.5} />
          </mesh>
          <mesh castShadow position={[0, 0.95, 0.35]}>
            <boxGeometry args={[0.8, 0.2, 0.6]} />
            <meshStandardMaterial color="#a7d2ff" emissive="#2a71bf" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[0, 0.96, 0.46]}>
            <planeGeometry args={[0.7, 0.16]} />
            <meshStandardMaterial color="#1f2026" transparent opacity={glassCrackOpacity} />
          </mesh>
          {frontBumperFellOff ? null : (
            <group ref={bumperRef} position={[0, 0.03, 1.2]}>
              <mesh castShadow>
                <boxGeometry args={[1.35, 0.22, 0.24]} />
                <meshStandardMaterial color={damage >= 60 ? '#3f434f' : accentColor} metalness={0.25} roughness={0.6} />
              </mesh>
            </group>
          )}
          <group ref={loosePanelRef} position={[0.82, 0.26, 0.18]} visible={false}>
            <mesh castShadow>
              <boxGeometry args={[0.12, 0.46, 0.72]} />
              <meshStandardMaterial color="#48515f" metalness={0.25} roughness={0.75} />
            </mesh>
          </group>
          {spoilerFellOff ? null : (
            <group position={[0, 0.98, -1.08]}>
              <mesh castShadow>
                <boxGeometry args={[0.92, 0.08, 0.18]} />
                <meshStandardMaterial color={accentColor} metalness={0.2} roughness={0.58} />
              </mesh>
            </group>
          )}
          <group position={[-0.6, -0.08, 0.8]} rotation={[0, safeFrontLeftSteer, 0]}>
            <mesh castShadow rotation={[safeWheelSpin, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.27, 0.27, 0.3, 20]} />
              <meshStandardMaterial color="#212329" />
            </mesh>
          </group>
          <group position={[0.6, -0.08, 0.8]} rotation={[0, safeFrontRightSteer, 0]}>
            <mesh castShadow rotation={[safeWheelSpin, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.27, 0.27, 0.3, 20]} />
              <meshStandardMaterial color="#212329" />
            </mesh>
          </group>
          <mesh castShadow position={[-0.6, -0.08, -0.8]} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 20]} />
            <meshStandardMaterial color="#212329" />
          </mesh>
          <mesh castShadow position={[0.6, -0.08, -0.8]} rotation={[safeWheelSpin, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.27, 0.27, 0.3, 20]} />
            <meshStandardMaterial color="#212329" />
          </mesh>
        </>
      ) : null}
    </group>
  )
}
