import { getCtx, isEngineMuted, setEngineMutedFlag } from './runtime'

let engineIdleEl: HTMLAudioElement | null = null
let engineLowEl: HTMLAudioElement | null = null
let engineHighEl: HTMLAudioElement | null = null
let engineReverseEl: HTMLAudioElement | null = null

let engineIdleSource: MediaElementAudioSourceNode | null = null
let engineLowSource: MediaElementAudioSourceNode | null = null
let engineHighSource: MediaElementAudioSourceNode | null = null
let engineReverseSource: MediaElementAudioSourceNode | null = null

let engineIdleGain: GainNode | null = null
let engineLowGain: GainNode | null = null
let engineHighGain: GainNode | null = null
let engineReverseGain: GainNode | null = null
let engineMasterGain: GainNode | null = null
let engineLowShelf: BiquadFilterNode | null = null
let engineHighShelf: BiquadFilterNode | null = null
let engineCompressor: DynamicsCompressorNode | null = null
let terrainRumbleOsc: OscillatorNode | null = null
let terrainRumbleGain: GainNode | null = null
let slipSkidOsc: OscillatorNode | null = null
let slipSkidGain: GainNode | null = null

let engineLoopsStarted = false

type EngineTone = 'steady' | 'speedy' | 'heavy'

const engineState = {
  lastAudioTime: 0,
  wobblePhase: 0,
  throttleHold: 0,
  idleHold: 1,
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

const createLoopElement = (src: string) => {
  const el = new Audio(src)
  el.loop = true
  el.preload = 'auto'
  el.crossOrigin = 'anonymous'
  el.volume = 1
  return el
}

const ensureEngineLoop = () => {
  const audio = getCtx()
  if (!audio || audio.state !== 'running') {
    return null
  }

  if (
    engineIdleEl &&
    engineLowEl &&
    engineHighEl &&
    engineReverseEl &&
    engineIdleSource &&
    engineLowSource &&
    engineHighSource &&
    engineReverseSource &&
    engineIdleGain &&
    engineLowGain &&
    engineHighGain &&
    engineReverseGain &&
    engineMasterGain &&
    engineLowShelf &&
    engineHighShelf &&
    engineCompressor &&
    terrainRumbleOsc &&
    terrainRumbleGain &&
    slipSkidOsc &&
    slipSkidGain
  ) {
    if (!engineLoopsStarted) {
      void engineIdleEl.play().catch(() => {})
      void engineLowEl.play().catch(() => {})
      void engineHighEl.play().catch(() => {})
      void engineReverseEl.play().catch(() => {})
      engineLoopsStarted = true
    }

    return {
      audio,
      idleEl: engineIdleEl,
      lowEl: engineLowEl,
      highEl: engineHighEl,
      reverseEl: engineReverseEl,
      idleGain: engineIdleGain,
      lowGain: engineLowGain,
      highGain: engineHighGain,
      reverseGain: engineReverseGain,
      masterGain: engineMasterGain,
      lowShelf: engineLowShelf,
      highShelf: engineHighShelf,
      terrainRumbleOsc,
      terrainRumbleGain,
      slipSkidOsc,
      slipSkidGain,
    }
  }

  const idleEl = createLoopElement('/audio/engine/idle.mp3')
  const lowEl = createLoopElement('/audio/engine/low.mp3')
  const highEl = createLoopElement('/audio/engine/high.mp3')
  const reverseEl = createLoopElement('/audio/engine/reverse.mp3')

  const idleSource = audio.createMediaElementSource(idleEl)
  const lowSource = audio.createMediaElementSource(lowEl)
  const highSource = audio.createMediaElementSource(highEl)
  const reverseSource = audio.createMediaElementSource(reverseEl)

  const idleGain = audio.createGain()
  const lowGain = audio.createGain()
  const highGain = audio.createGain()
  const reverseGain = audio.createGain()
  const masterGain = audio.createGain()
  const lowShelf = audio.createBiquadFilter()
  const highShelf = audio.createBiquadFilter()
  const compressor = audio.createDynamicsCompressor()
  const rumbleOsc = audio.createOscillator()
  const rumbleGain = audio.createGain()
  const skidOsc = audio.createOscillator()
  const skidGain = audio.createGain()

  idleGain.gain.setValueAtTime(0.0001, audio.currentTime)
  lowGain.gain.setValueAtTime(0.0001, audio.currentTime)
  highGain.gain.setValueAtTime(0.0001, audio.currentTime)
  reverseGain.gain.setValueAtTime(0.0001, audio.currentTime)
  masterGain.gain.setValueAtTime(0.0001, audio.currentTime)

  lowShelf.type = 'lowshelf'
  lowShelf.frequency.setValueAtTime(180, audio.currentTime)
  lowShelf.gain.setValueAtTime(4.8, audio.currentTime)

  highShelf.type = 'highshelf'
  highShelf.frequency.setValueAtTime(1800, audio.currentTime)
  highShelf.gain.setValueAtTime(-6.5, audio.currentTime)

  compressor.threshold.setValueAtTime(-17, audio.currentTime)
  compressor.knee.setValueAtTime(10, audio.currentTime)
  compressor.ratio.setValueAtTime(2.7, audio.currentTime)
  compressor.attack.setValueAtTime(0.004, audio.currentTime)
  compressor.release.setValueAtTime(0.12, audio.currentTime)
  rumbleOsc.type = 'triangle'
  rumbleOsc.frequency.setValueAtTime(48, audio.currentTime)
  rumbleGain.gain.setValueAtTime(0.0001, audio.currentTime)
  skidOsc.type = 'sawtooth'
  skidOsc.frequency.setValueAtTime(240, audio.currentTime)
  skidGain.gain.setValueAtTime(0.0001, audio.currentTime)

  idleSource.connect(idleGain)
  lowSource.connect(lowGain)
  highSource.connect(highGain)
  reverseSource.connect(reverseGain)

  idleGain.connect(masterGain)
  lowGain.connect(masterGain)
  highGain.connect(masterGain)
  reverseGain.connect(masterGain)
  rumbleOsc.connect(rumbleGain)
  rumbleGain.connect(masterGain)
  skidOsc.connect(skidGain)
  skidGain.connect(masterGain)
  masterGain.connect(lowShelf)
  lowShelf.connect(highShelf)
  highShelf.connect(compressor)
  compressor.connect(audio.destination)

  engineIdleEl = idleEl
  engineLowEl = lowEl
  engineHighEl = highEl
  engineReverseEl = reverseEl

  engineIdleSource = idleSource
  engineLowSource = lowSource
  engineHighSource = highSource
  engineReverseSource = reverseSource

  engineIdleGain = idleGain
  engineLowGain = lowGain
  engineHighGain = highGain
  engineReverseGain = reverseGain
  engineMasterGain = masterGain
  engineLowShelf = lowShelf
  engineHighShelf = highShelf
  engineCompressor = compressor
  terrainRumbleOsc = rumbleOsc
  terrainRumbleGain = rumbleGain
  slipSkidOsc = skidOsc
  slipSkidGain = skidGain

  rumbleOsc.start(audio.currentTime)
  skidOsc.start(audio.currentTime)

  void idleEl.play().catch(() => {})
  void lowEl.play().catch(() => {})
  void highEl.play().catch(() => {})
  void reverseEl.play().catch(() => {})
  engineLoopsStarted = true
  engineState.lastAudioTime = audio.currentTime

  return {
    audio,
    idleEl,
    lowEl,
    highEl,
    reverseEl,
    idleGain,
    lowGain,
    highGain,
    reverseGain,
    masterGain,
    lowShelf,
    highShelf,
    terrainRumbleOsc: rumbleOsc,
    terrainRumbleGain: rumbleGain,
    slipSkidOsc: skidOsc,
    slipSkidGain: skidGain,
  }
}

const smoothPlaybackRate = (el: HTMLAudioElement, target: number, blend: number) => {
  el.playbackRate += (target - el.playbackRate) * blend
}

export const unlockAudio = async () => {
  const audio = getCtx()
  if (!audio) {
    return
  }

  if (audio.state === 'suspended') {
    await audio.resume()
  }

  ensureEngineLoop()
}

export const updateEngineSound = ({
  speed,
  throttle,
  direction,
  surface,
  engineLoad = 0,
  tone = 'steady',
  slip = 0,
  traction = 1,
}: {
  speed: number
  throttle: number
  direction: 'forward' | 'reverse' | 'idle'
  surface: 'road' | 'grass'
  engineLoad?: number
  tone?: EngineTone
  slip?: number
  traction?: number
}) => {
  const loop = ensureEngineLoop()
  if (!loop) {
    return
  }

  const {
    audio,
    idleEl,
    lowEl,
    highEl,
    reverseEl,
    idleGain,
    lowGain,
    highGain,
    reverseGain,
    masterGain,
    lowShelf,
    highShelf,
    terrainRumbleOsc: rumbleOsc,
    terrainRumbleGain: rumbleGain,
    slipSkidOsc: skidOsc,
    slipSkidGain: skidGain,
  } = loop
  const now = audio.currentTime
  const dt = Math.min(0.05, Math.max(0.005, now - engineState.lastAudioTime || 0.016))
  engineState.lastAudioTime = now

  if (isEngineMuted()) {
    masterGain.gain.setTargetAtTime(0.0001, now, 0.05)
    return
  }

  const speedFactor = clamp01(speed / 12)
  const throttleFactor = clamp01(Math.abs(throttle))
  const loadFactor = clamp01(engineLoad)
  const slipFactor = clamp01(slip)
  const tractionFactor = clamp01(traction)
  const surfaceFactor = surface === 'grass' ? 0.85 : 1
  const maxThrottle = throttleFactor > 0.9 ? 1 : 0
  const nearIdle = speed < 0.7 && throttleFactor < 0.08 ? 1 : 0

  engineState.throttleHold += ((maxThrottle ? 1 : throttleFactor) - engineState.throttleHold) * Math.min(1, dt * 2.8)
  engineState.idleHold += (nearIdle - engineState.idleHold) * Math.min(1, dt * 3.6)

  engineState.wobblePhase += dt * (4 + speedFactor * 10)
  const wobbleDepth = 1 - engineState.idleHold * 0.7
  const wobble =
    (Math.sin(engineState.wobblePhase * 0.61) * 0.02 + Math.sin(engineState.wobblePhase * 1.37) * 0.012) * wobbleDepth

  const toneRate = tone === 'speedy' ? 1.07 : tone === 'heavy' ? 0.94 : 1
  const throttlePush = engineState.throttleHold
  const idleRate = (0.75 + speedFactor * 0.28 + throttleFactor * 0.05 + throttlePush * 0.02) * toneRate + wobble * 0.25
  const lowRate = (0.8 + speedFactor * 0.46 + throttleFactor * 0.07 + throttlePush * 0.03) * toneRate + wobble * 0.35
  const highRate = (0.66 + speedFactor * 0.4 + throttleFactor * 0.11 + loadFactor * 0.05 + throttlePush * 0.05) * toneRate + wobble * 0.2
  const reverseRate = (0.68 + speedFactor * 0.5 + throttleFactor * 0.13) * toneRate + wobble * 0.25

  smoothPlaybackRate(idleEl, Math.max(0.62, idleRate), 0.18)
  smoothPlaybackRate(lowEl, Math.max(0.66, lowRate), 0.18)
  smoothPlaybackRate(highEl, Math.max(0.58, highRate), 0.18)
  smoothPlaybackRate(reverseEl, Math.max(0.6, reverseRate), 0.18)

  const idleTarget =
    (0.24 + (1 - speedFactor) * 0.22 + engineState.idleHold * 0.08) * (direction === 'idle' ? 1.12 : 1) * surfaceFactor
  const lowTarget =
    (0.14 +
      Math.max(0, 1 - Math.abs(speedFactor - 0.36) / 0.5) * 0.34 +
      throttleFactor * 0.065 +
      throttlePush * 0.035) *
    surfaceFactor
  const highTarget =
    (0.016 + Math.pow(speedFactor, 1.2) * 0.11 + throttleFactor * 0.04 + loadFactor * 0.02 + throttlePush * 0.03) *
    surfaceFactor
  const reverseTarget = direction === 'reverse' ? 0.16 + speedFactor * 0.16 + throttleFactor * 0.05 : 0.0001

  const forwardMixScale = direction === 'reverse' ? 0.12 : 1

  idleGain.gain.setTargetAtTime(Math.max(0.0001, idleTarget * forwardMixScale), now, 0.08)
  lowGain.gain.setTargetAtTime(Math.max(0.0001, lowTarget * forwardMixScale), now, 0.08)
  highGain.gain.setTargetAtTime(Math.max(0.0001, highTarget * forwardMixScale), now, 0.08)
  reverseGain.gain.setTargetAtTime(Math.max(0.0001, reverseTarget), now, 0.08)

  const masterTarget = 0.085 + speedFactor * 0.04 + throttleFactor * 0.016 + throttlePush * 0.015
  masterGain.gain.setTargetAtTime(masterTarget, now, 0.08)

  lowShelf.gain.setTargetAtTime(5.4 - speedFactor * 1.1 + engineState.idleHold * 0.8, now, 0.16)
  highShelf.gain.setTargetAtTime(-7 + throttlePush * 3.2 + speedFactor * 1.2, now, 0.16)

  const rumbleTarget = (surface === 'grass' ? 0.027 : 0.01) * (0.45 + speedFactor * 0.8) * (1 - tractionFactor * 0.35)
  const rumbleFreq = 40 + speedFactor * 36 + (surface === 'grass' ? 14 : 0)
  rumbleGain.gain.setTargetAtTime(Math.max(0.0001, rumbleTarget), now, 0.1)
  rumbleOsc.frequency.setTargetAtTime(rumbleFreq, now, 0.12)

  const skidTarget = (0.002 + slipFactor * 0.028) * (0.4 + speedFactor * 0.9)
  const skidFreq = 190 + slipFactor * 260 + speedFactor * 120
  skidGain.gain.setTargetAtTime(Math.max(0.0001, skidTarget), now, 0.07)
  skidOsc.frequency.setTargetAtTime(skidFreq, now, 0.09)
}

export const setEngineMuted = (muted: boolean) => {
  setEngineMutedFlag(muted)
  const ctx = getCtx()
  if (engineMasterGain && ctx) {
    engineMasterGain.gain.setTargetAtTime(muted ? 0.0001 : 0.085, ctx.currentTime, 0.05)
  }
}

export const stopEngineSound = () => {
  if (engineIdleEl) {
    engineIdleEl.pause()
    engineIdleEl.currentTime = 0
    engineIdleEl = null
  }
  if (engineLowEl) {
    engineLowEl.pause()
    engineLowEl.currentTime = 0
    engineLowEl = null
  }
  if (engineHighEl) {
    engineHighEl.pause()
    engineHighEl.currentTime = 0
    engineHighEl = null
  }
  if (engineReverseEl) {
    engineReverseEl.pause()
    engineReverseEl.currentTime = 0
    engineReverseEl = null
  }

  if (engineIdleSource) {
    engineIdleSource.disconnect()
    engineIdleSource = null
  }
  if (engineLowSource) {
    engineLowSource.disconnect()
    engineLowSource = null
  }
  if (engineHighSource) {
    engineHighSource.disconnect()
    engineHighSource = null
  }
  if (engineReverseSource) {
    engineReverseSource.disconnect()
    engineReverseSource = null
  }

  if (engineIdleGain) {
    engineIdleGain.disconnect()
    engineIdleGain = null
  }
  if (engineLowGain) {
    engineLowGain.disconnect()
    engineLowGain = null
  }
  if (engineHighGain) {
    engineHighGain.disconnect()
    engineHighGain = null
  }
  if (engineReverseGain) {
    engineReverseGain.disconnect()
    engineReverseGain = null
  }
  if (engineMasterGain) {
    engineMasterGain.disconnect()
    engineMasterGain = null
  }
  if (engineLowShelf) {
    engineLowShelf.disconnect()
    engineLowShelf = null
  }
  if (engineHighShelf) {
    engineHighShelf.disconnect()
    engineHighShelf = null
  }
  if (engineCompressor) {
    engineCompressor.disconnect()
    engineCompressor = null
  }
  if (terrainRumbleOsc) {
    terrainRumbleOsc.stop()
    terrainRumbleOsc.disconnect()
    terrainRumbleOsc = null
  }
  if (terrainRumbleGain) {
    terrainRumbleGain.disconnect()
    terrainRumbleGain = null
  }
  if (slipSkidOsc) {
    slipSkidOsc.stop()
    slipSkidOsc.disconnect()
    slipSkidOsc = null
  }
  if (slipSkidGain) {
    slipSkidGain.disconnect()
    slipSkidGain = null
  }

  engineLoopsStarted = false
  engineState.lastAudioTime = 0
  engineState.wobblePhase = 0
  engineState.throttleHold = 0
  engineState.idleHold = 1
}

