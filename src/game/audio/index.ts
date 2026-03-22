import { getCollisionAudioDebugState, playCollisionSound, playPickupSound } from './effects'
import { getEngineAudioDebugState, setEngineMuted, stopEngineSound, unlockAudio, updateEngineSound } from './engine'
import { getAudioContextState, isEngineMuted } from './runtime'

export { setEngineMuted, stopEngineSound, unlockAudio, updateEngineSound, playCollisionSound, playPickupSound }

export const getAudioDebugState = () => ({
  contextState: getAudioContextState(),
  muted: isEngineMuted(),
  engine: getEngineAudioDebugState(),
  collision: getCollisionAudioDebugState(),
})
