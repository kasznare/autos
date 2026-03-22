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
let engineSubOsc: OscillatorNode | null = null
let engineSubGain: GainNode | null = null
let engineIntakeOsc: OscillatorNode | null = null
let engineIntakeFilter: BiquadFilterNode | null = null
let engineIntakeGain: GainNode | null = null
let engineReverseWhineOsc: OscillatorNode | null = null
let engineReverseWhineFilter: BiquadFilterNode | null = null
let engineReverseWhineGain: GainNode | null = null

let engineLoopsStarted = false

type EngineTone = 'steady' | 'speedy' | 'heavy'
type EngineDirection = 'forward' | 'reverse' | 'idle'

type EngineAudioDebugState = {
  direction: EngineDirection
  speed: number
  throttle: number
  load: number
  speedBlend: number
  throttleBlend: number
  coastBlend: number
  reverseBlend: number
  idleGain: number
  lowGain: number
  highGain: number
  reverseGain: number
  subGain: number
  intakeGain: number
  reverseWhineGain: number
  masterGain: number
}

const engineState = {
  lastAudioTime: 0,
  wobblePhase: 0,
  throttleBlend: 0,
  loadBlend: 0,
  speedBlend: 0,
  coastBlend: 0,
  reverseBlend: 0,
  idleHold: 1,
}

const engineDebugState: EngineAudioDebugState = {
  direction: 'idle',
  speed: 0,
  throttle: 0,
  load: 0,
  speedBlend: 0,
  throttleBlend: 0,
  coastBlend: 0,
  reverseBlend: 0,
  idleGain: 0,
  lowGain: 0,
  highGain: 0,
  reverseGain: 0,
  subGain: 0,
  intakeGain: 0,
  reverseWhineGain: 0,
  masterGain: 0,
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothToward = (current: number, target: number, delta: number, rate: number) =>
  current + (target - current) * Math.min(1, delta * rate)

const createLoopElement = (src: string) => {
  const el = new Audio(src)
  el.loop = true
  el.preload = 'auto'
  el.crossOrigin = 'anonymous'
  el.volume = 1
  return el
}

const resetEngineDebugState = () => {
  engineDebugState.direction = 'idle'
  engineDebugState.speed = 0
  engineDebugState.throttle = 0
  engineDebugState.load = 0
  engineDebugState.speedBlend = 0
  engineDebugState.throttleBlend = 0
  engineDebugState.coastBlend = 0
  engineDebugState.reverseBlend = 0
  engineDebugState.idleGain = 0
  engineDebugState.lowGain = 0
  engineDebugState.highGain = 0
  engineDebugState.reverseGain = 0
  engineDebugState.subGain = 0
  engineDebugState.intakeGain = 0
  engineDebugState.reverseWhineGain = 0
  engineDebugState.masterGain = 0
}

export const getEngineAudioDebugState = (): EngineAudioDebugState => ({ ...engineDebugState })

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
    slipSkidGain &&
    engineSubOsc &&
    engineSubGain &&
    engineIntakeOsc &&
    engineIntakeFilter &&
    engineIntakeGain &&
    engineReverseWhineOsc &&
    engineReverseWhineFilter &&
    engineReverseWhineGain
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
      rumbleOsc: terrainRumbleOsc,
      rumbleGain: terrainRumbleGain,
      skidOsc: slipSkidOsc,
      skidGain: slipSkidGain,
      subOsc: engineSubOsc,
      subGain: engineSubGain,
      intakeOsc: engineIntakeOsc,
      intakeFilter: engineIntakeFilter,
      intakeGain: engineIntakeGain,
      reverseWhineOsc: engineReverseWhineOsc,
      reverseWhineFilter: engineReverseWhineFilter,
      reverseWhineGain: engineReverseWhineGain,
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
  const subOsc = audio.createOscillator()
  const subGain = audio.createGain()
  const intakeOsc = audio.createOscillator()
  const intakeFilter = audio.createBiquadFilter()
  const intakeGain = audio.createGain()
  const reverseWhineOsc = audio.createOscillator()
  const reverseWhineFilter = audio.createBiquadFilter()
  const reverseWhineGain = audio.createGain()

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

  subOsc.type = 'triangle'
  subOsc.frequency.setValueAtTime(34, audio.currentTime)
  subGain.gain.setValueAtTime(0.0001, audio.currentTime)

  intakeOsc.type = 'sawtooth'
  intakeOsc.frequency.setValueAtTime(110, audio.currentTime)
  intakeFilter.type = 'bandpass'
  intakeFilter.frequency.setValueAtTime(620, audio.currentTime)
  intakeFilter.Q.setValueAtTime(0.8, audio.currentTime)
  intakeGain.gain.setValueAtTime(0.0001, audio.currentTime)

  reverseWhineOsc.type = 'sawtooth'
  reverseWhineOsc.frequency.setValueAtTime(260, audio.currentTime)
  reverseWhineFilter.type = 'bandpass'
  reverseWhineFilter.frequency.setValueAtTime(880, audio.currentTime)
  reverseWhineFilter.Q.setValueAtTime(1.2, audio.currentTime)
  reverseWhineGain.gain.setValueAtTime(0.0001, audio.currentTime)

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
  subOsc.connect(subGain)
  subGain.connect(masterGain)
  intakeOsc.connect(intakeFilter)
  intakeFilter.connect(intakeGain)
  intakeGain.connect(masterGain)
  reverseWhineOsc.connect(reverseWhineFilter)
  reverseWhineFilter.connect(reverseWhineGain)
  reverseWhineGain.connect(masterGain)
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
  engineSubOsc = subOsc
  engineSubGain = subGain
  engineIntakeOsc = intakeOsc
  engineIntakeFilter = intakeFilter
  engineIntakeGain = intakeGain
  engineReverseWhineOsc = reverseWhineOsc
  engineReverseWhineFilter = reverseWhineFilter
  engineReverseWhineGain = reverseWhineGain

  rumbleOsc.start(audio.currentTime)
  skidOsc.start(audio.currentTime)
  subOsc.start(audio.currentTime)
  intakeOsc.start(audio.currentTime)
  reverseWhineOsc.start(audio.currentTime)

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
    rumbleOsc,
    rumbleGain,
    skidOsc,
    skidGain,
    subOsc,
    subGain,
    intakeOsc,
    intakeFilter,
    intakeGain,
    reverseWhineOsc,
    reverseWhineFilter,
    reverseWhineGain,
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
  direction: EngineDirection
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
    rumbleOsc,
    rumbleGain,
    skidOsc,
    skidGain,
    subOsc,
    subGain,
    intakeOsc,
    intakeFilter,
    intakeGain,
    reverseWhineOsc,
    reverseWhineFilter,
    reverseWhineGain,
  } = loop
  const now = audio.currentTime
  const dt =
    engineState.lastAudioTime > 0 ? Math.min(0.05, Math.max(0.005, now - engineState.lastAudioTime)) : 0.016
  engineState.lastAudioTime = now

  if (isEngineMuted()) {
    masterGain.gain.setTargetAtTime(0.0001, now, 0.05)
    engineDebugState.masterGain = 0
    return
  }

  const speedFactor = clamp01(speed / 20)
  const throttleFactor = clamp01(Math.abs(throttle))
  const loadFactor = clamp01(engineLoad)
  const slipFactor = clamp01(slip)
  const tractionFactor = clamp01(traction)
  const surfaceFactor = surface === 'grass' ? 0.94 : 1
  const nearIdle = speed < 0.7 && throttleFactor < 0.08 ? 1 : 0
  const coastTarget = direction === 'forward' && speed > 1.4 && throttleFactor < 0.12 ? clamp01(speed / 16) : 0
  const reverseTarget = direction === 'reverse' ? 1 : 0

  engineState.speedBlend = smoothToward(engineState.speedBlend, clamp01(speed / (direction === 'reverse' ? 12 : 18)), dt, 4.2)
  engineState.throttleBlend = smoothToward(
    engineState.throttleBlend,
    throttleFactor,
    dt,
    throttleFactor > engineState.throttleBlend ? 8.6 : 2.8,
  )
  engineState.loadBlend = smoothToward(engineState.loadBlend, clamp01(loadFactor * 0.76 + throttleFactor * 0.24), dt, 4.8)
  engineState.coastBlend = smoothToward(
    engineState.coastBlend,
    coastTarget,
    dt,
    coastTarget > engineState.coastBlend ? 3.4 : 1.8,
  )
  engineState.reverseBlend = smoothToward(
    engineState.reverseBlend,
    reverseTarget,
    dt,
    reverseTarget > engineState.reverseBlend ? 5.8 : 3.2,
  )
  engineState.idleHold = smoothToward(engineState.idleHold, nearIdle, dt, 3.6)

  engineState.wobblePhase += dt * (4 + speedFactor * 10)
  const wobbleDepth = 0.26 + (1 - engineState.idleHold * 0.7) * (0.44 + engineState.throttleBlend * 0.3)
  const wobble =
    (Math.sin(engineState.wobblePhase * 0.61) * 0.02 + Math.sin(engineState.wobblePhase * 1.37) * 0.012) * wobbleDepth

  const toneRate = tone === 'speedy' ? 1.07 : tone === 'heavy' ? 0.94 : 1
  const rpmBlend = clamp01(
    engineState.speedBlend * 0.56 +
      engineState.throttleBlend * 0.24 +
      engineState.loadBlend * 0.2 +
      engineState.reverseBlend * 0.08,
  )
  const accelerationEdge = clamp01(
    engineState.throttleBlend * 1.08 + engineState.loadBlend * 0.35 - engineState.coastBlend * 0.45,
  )

  const idleRate = (0.68 + rpmBlend * 0.24 + engineState.loadBlend * 0.05 + accelerationEdge * 0.03) * toneRate + wobble * 0.2
  const lowRate =
    (0.72 + rpmBlend * 0.52 + accelerationEdge * 0.07 + engineState.loadBlend * 0.05 - engineState.coastBlend * 0.03) *
      toneRate +
    wobble * 0.28
  const highRate =
    (0.6 + rpmBlend * 0.78 + accelerationEdge * 0.16 + engineState.loadBlend * 0.08 - engineState.coastBlend * 0.06) *
      toneRate +
    wobble * 0.18
  const reverseRate =
    (0.64 + engineState.speedBlend * 0.54 + engineState.throttleBlend * 0.14 + engineState.reverseBlend * 0.05) *
      toneRate +
    wobble * 0.16

  smoothPlaybackRate(idleEl, Math.max(0.62, idleRate), 0.18)
  smoothPlaybackRate(lowEl, Math.max(0.66, lowRate), 0.18)
  smoothPlaybackRate(highEl, Math.max(0.58, highRate), 0.18)
  smoothPlaybackRate(reverseEl, Math.max(0.6, reverseRate), 0.18)

  const lowBand = clamp01(1 - Math.abs(rpmBlend - 0.34) / 0.34)
  const highBand = clamp01((rpmBlend - 0.34) / 0.52)
  const idleTarget =
    (0.14 + (1 - rpmBlend) * 0.16 + engineState.idleHold * 0.08 + engineState.coastBlend * 0.04) *
    (direction === 'idle' ? 1.08 : 1) *
    surfaceFactor
  const lowTarget =
    (0.08 + lowBand * 0.22 + accelerationEdge * 0.055 + engineState.loadBlend * 0.05 + engineState.coastBlend * 0.03) *
    surfaceFactor
  const highTarget =
    (0.002 +
      highBand * (0.04 + accelerationEdge * 0.06 + engineState.loadBlend * 0.035) +
      engineState.throttleBlend * 0.014) *
    (1 - engineState.coastBlend * 0.38) *
    surfaceFactor
  const reverseStemTarget =
    engineState.reverseBlend *
    (0.1 + engineState.speedBlend * 0.18 + engineState.throttleBlend * 0.05 + engineState.loadBlend * 0.03) *
    surfaceFactor

  const forwardStemScale = direction === 'reverse' ? 0.14 : 1
  const idleStemScale = direction === 'reverse' ? 0.38 : 1

  idleGain.gain.setTargetAtTime(Math.max(0.0001, idleTarget * idleStemScale), now, 0.08)
  lowGain.gain.setTargetAtTime(Math.max(0.0001, lowTarget * forwardStemScale), now, 0.08)
  highGain.gain.setTargetAtTime(Math.max(0.0001, highTarget * forwardStemScale), now, 0.08)
  reverseGain.gain.setTargetAtTime(Math.max(0.0001, reverseStemTarget), now, 0.08)

  const masterTarget =
    0.072 + rpmBlend * 0.04 + accelerationEdge * 0.024 + engineState.reverseBlend * 0.012 + engineState.loadBlend * 0.01
  masterGain.gain.setTargetAtTime(masterTarget, now, 0.08)

  lowShelf.gain.setTargetAtTime(
    5.1 - rpmBlend * 0.9 + engineState.idleHold * 0.6 + engineState.coastBlend * 0.35,
    now,
    0.16,
  )
  highShelf.gain.setTargetAtTime(
    -7.4 + accelerationEdge * 4.4 + rpmBlend * 1.4 + engineState.reverseBlend * 0.9 - engineState.coastBlend * 1.6,
    now,
    0.16,
  )

  const subTarget = (0.0008 + engineState.loadBlend * 0.012 + accelerationEdge * 0.01 + speedFactor * 0.004) * surfaceFactor
  const subFreq = 28 + rpmBlend * 30 + (tone === 'heavy' ? -2 : tone === 'speedy' ? 4 : 0)
  subGain.gain.setTargetAtTime(Math.max(0.0001, subTarget), now, 0.08)
  subOsc.frequency.setTargetAtTime(subFreq, now, 0.12)

  const intakeTarget =
    (0.0008 + accelerationEdge * 0.016 + engineState.loadBlend * 0.01 + rpmBlend * 0.004) *
    (direction === 'reverse' ? 0.35 : 1) *
    surfaceFactor
  const intakeFreq = 90 + rpmBlend * 240 + accelerationEdge * 70 + (tone === 'speedy' ? 18 : 0)
  const intakeFilterFreq = 460 + rpmBlend * 850 + accelerationEdge * 280
  intakeGain.gain.setTargetAtTime(Math.max(0.0001, intakeTarget), now, 0.08)
  intakeOsc.frequency.setTargetAtTime(intakeFreq, now, 0.08)
  intakeFilter.frequency.setTargetAtTime(intakeFilterFreq, now, 0.1)

  const reverseWhineTarget =
    engineState.reverseBlend * (0.001 + engineState.speedBlend * 0.016 + engineState.throttleBlend * 0.011) * surfaceFactor
  const reverseWhineFreq = 220 + engineState.speedBlend * 360 + engineState.throttleBlend * 90
  const reverseWhineFilterFreq = 760 + engineState.speedBlend * 1000 + engineState.throttleBlend * 340
  reverseWhineGain.gain.setTargetAtTime(Math.max(0.0001, reverseWhineTarget), now, 0.08)
  reverseWhineOsc.frequency.setTargetAtTime(reverseWhineFreq, now, 0.08)
  reverseWhineFilter.frequency.setTargetAtTime(reverseWhineFilterFreq, now, 0.08)

  const rumbleTarget =
    (surface === 'grass' ? 0.022 : 0.006) * (0.45 + speedFactor * 0.8) * (1 - tractionFactor * 0.32) +
    engineState.loadBlend * (surface === 'grass' ? 0.004 : 0.0015)
  const rumbleFreq = 40 + speedFactor * 36 + (surface === 'grass' ? 14 : 0)
  rumbleGain.gain.setTargetAtTime(Math.max(0.0001, rumbleTarget), now, 0.1)
  rumbleOsc.frequency.setTargetAtTime(rumbleFreq, now, 0.12)

  const skidTarget = (0.001 + slipFactor * 0.024) * (0.35 + speedFactor * 0.85)
  const skidFreq = 190 + slipFactor * 260 + speedFactor * 120
  skidGain.gain.setTargetAtTime(Math.max(0.0001, skidTarget), now, 0.07)
  skidOsc.frequency.setTargetAtTime(skidFreq, now, 0.09)

  engineDebugState.direction = direction
  engineDebugState.speed = speed
  engineDebugState.throttle = throttleFactor
  engineDebugState.load = loadFactor
  engineDebugState.speedBlend = engineState.speedBlend
  engineDebugState.throttleBlend = engineState.throttleBlend
  engineDebugState.coastBlend = engineState.coastBlend
  engineDebugState.reverseBlend = engineState.reverseBlend
  engineDebugState.idleGain = idleTarget * idleStemScale
  engineDebugState.lowGain = lowTarget * forwardStemScale
  engineDebugState.highGain = highTarget * forwardStemScale
  engineDebugState.reverseGain = reverseStemTarget
  engineDebugState.subGain = subTarget
  engineDebugState.intakeGain = intakeTarget
  engineDebugState.reverseWhineGain = reverseWhineTarget
  engineDebugState.masterGain = masterTarget
}

export const setEngineMuted = (muted: boolean) => {
  setEngineMutedFlag(muted)
  const ctx = getCtx()
  if (engineMasterGain && ctx) {
    engineMasterGain.gain.setTargetAtTime(muted ? 0.0001 : 0.085, ctx.currentTime, 0.05)
  }
  if (muted) {
    engineDebugState.masterGain = 0
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
  if (engineSubOsc) {
    engineSubOsc.stop()
    engineSubOsc.disconnect()
    engineSubOsc = null
  }
  if (engineSubGain) {
    engineSubGain.disconnect()
    engineSubGain = null
  }
  if (engineIntakeOsc) {
    engineIntakeOsc.stop()
    engineIntakeOsc.disconnect()
    engineIntakeOsc = null
  }
  if (engineIntakeFilter) {
    engineIntakeFilter.disconnect()
    engineIntakeFilter = null
  }
  if (engineIntakeGain) {
    engineIntakeGain.disconnect()
    engineIntakeGain = null
  }
  if (engineReverseWhineOsc) {
    engineReverseWhineOsc.stop()
    engineReverseWhineOsc.disconnect()
    engineReverseWhineOsc = null
  }
  if (engineReverseWhineFilter) {
    engineReverseWhineFilter.disconnect()
    engineReverseWhineFilter = null
  }
  if (engineReverseWhineGain) {
    engineReverseWhineGain.disconnect()
    engineReverseWhineGain = null
  }

  engineLoopsStarted = false
  engineState.lastAudioTime = 0
  engineState.wobblePhase = 0
  engineState.throttleBlend = 0
  engineState.loadBlend = 0
  engineState.speedBlend = 0
  engineState.coastBlend = 0
  engineState.reverseBlend = 0
  engineState.idleHold = 1
  resetEngineDebugState()
}
