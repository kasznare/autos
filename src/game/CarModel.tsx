import { Trail } from '@react-three/drei'
import type { RefObject } from 'react'
import type { Group } from 'three'

type CarModelProps = {
  bodyColor: string
  accentColor: string
  damage: number
  lowPowerMode?: boolean
  showTrail?: boolean
  crackOpacity?: number
  bumperRef?: RefObject<Group | null>
  loosePanelRef?: RefObject<Group | null>
  hoodRef?: RefObject<Group | null>
  roofRef?: RefObject<Group | null>
  leftDoorRef?: RefObject<Group | null>
  rightDoorRef?: RefObject<Group | null>
}

export const CarModel = ({
  bodyColor,
  accentColor,
  damage,
  lowPowerMode = false,
  showTrail = true,
  crackOpacity,
  bumperRef,
  loosePanelRef,
  hoodRef,
  roofRef,
  leftDoorRef,
  rightDoorRef,
}: CarModelProps) => {
  const mirrorFellOff = damage >= 58
  const spoilerFellOff = damage >= 72
  const rightDoorFellOff = damage >= 86
  const frontBumperFellOff = damage >= 92
  const glassCrackOpacity = crackOpacity ?? Math.min(0.72, Math.max(0, (damage - 38) / 62) * 0.72)

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
      {[[-0.6, -0.08, -0.8], [0.6, -0.08, -0.8], [-0.6, -0.08, 0.8], [0.6, -0.08, 0.8]].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.27, 0.27, 0.3, 20]} />
          <meshStandardMaterial color="#212329" />
        </mesh>
      ))}
    </group>
  )
}
