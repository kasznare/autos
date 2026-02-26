let ctx: AudioContext | null = null

let engineMainOsc: OscillatorNode | null = null
let engineSubOsc: OscillatorNode | null = null
let engineHarmOsc: OscillatorNode | null = null
let surfaceOsc: OscillatorNode | null = null

let engineFilter: BiquadFilterNode | null = null
let harmFilter: BiquadFilterNode | null = null
let surfaceFilter: BiquadFilterNode | null = null

let engineGain: GainNode | null = null
let subGain: GainNode | null = null
let harmGain: GainNode | null = null
let surfaceGain: GainNode | null = null
let masterGain: GainNode | null = null
let compressor: DynamicsCompressorNode | null = null

let engineMuted = false

type EngineTone = 'steady' | 'speedy' | 'heavy'

const engineState = {
  rpm: 850,
  gear: 1,
  shiftDipTimer: 0,
  lastAudioTime: 0,
  wobblePhase: 0,
}

const getCtx = () => {
  if (typeof window === 'undefined') {
    return null
  }

  if (!ctx) {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      return null
    }
    ctx = new AudioCtx()
  }

  return ctx
}

export const unlockAudio = async () => {
  const audio = getCtx()
  if (!audio) {
    return
  }

  if (audio.state === 'suspended') {
    await audio.resume()
  }
}

const ensureEngineLoop = () => {
  const audio = getCtx()
  if (!audio || audio.state !== 'running') {
    return null
  }

  if (
    engineMainOsc &&
    engineSubOsc &&
    engineHarmOsc &&
    surfaceOsc &&
    engineFilter &&
    harmFilter &&
    surfaceFilter &&
    engineGain &&
    subGain &&
    harmGain &&
    surfaceGain &&
    masterGain &&
    compressor
  ) {
    return {
      audio,
      main: engineMainOsc,
      sub: engineSubOsc,
      harm: engineHarmOsc,
      surface: surfaceOsc,
      engineFilter,
      harmFilter,
      surfaceFilter,
      engineGain,
      subGain,
      harmGain,
      surfaceGain,
      masterGain,
    }
  }

  const main = audio.createOscillator()
  const sub = audio.createOscillator()
  const harm = audio.createOscillator()
  const surface = audio.createOscillator()

  const lowpass = audio.createBiquadFilter()
  const bandpass = audio.createBiquadFilter()
  const surfaceBand = audio.createBiquadFilter()

  const mainVol = audio.createGain()
  const subVol = audio.createGain()
  const harmVol = audio.createGain()
  const surfaceVol = audio.createGain()
  const masterVol = audio.createGain()
  const comp = audio.createDynamicsCompressor()

  main.type = 'sawtooth'
  sub.type = 'triangle'
  harm.type = 'square'
  surface.type = 'square'

  lowpass.type = 'lowpass'
  bandpass.type = 'bandpass'
  surfaceBand.type = 'bandpass'

  lowpass.frequency.setValueAtTime(900, audio.currentTime)
  bandpass.frequency.setValueAtTime(2200, audio.currentTime)
  surfaceBand.frequency.setValueAtTime(180, audio.currentTime)

  mainVol.gain.setValueAtTime(0.0001, audio.currentTime)
  subVol.gain.setValueAtTime(0.0001, audio.currentTime)
  harmVol.gain.setValueAtTime(0.0001, audio.currentTime)
  surfaceVol.gain.setValueAtTime(0.0001, audio.currentTime)
  masterVol.gain.setValueAtTime(0.0001, audio.currentTime)

  comp.threshold.setValueAtTime(-18, audio.currentTime)
  comp.knee.setValueAtTime(10, audio.currentTime)
  comp.ratio.setValueAtTime(2.8, audio.currentTime)
  comp.attack.setValueAtTime(0.005, audio.currentTime)
  comp.release.setValueAtTime(0.12, audio.currentTime)

  main.connect(lowpass)
  lowpass.connect(mainVol)
  mainVol.connect(masterVol)

  sub.connect(lowpass)
  lowpass.connect(subVol)
  subVol.connect(masterVol)

  harm.connect(bandpass)
  bandpass.connect(harmVol)
  harmVol.connect(masterVol)

  surface.connect(surfaceBand)
  surfaceBand.connect(surfaceVol)
  surfaceVol.connect(masterVol)

  masterVol.connect(comp)
  comp.connect(audio.destination)

  main.start()
  sub.start()
  harm.start()
  surface.start()

  engineMainOsc = main
  engineSubOsc = sub
  engineHarmOsc = harm
  surfaceOsc = surface

  engineFilter = lowpass
  harmFilter = bandpass
  surfaceFilter = surfaceBand

  engineGain = mainVol
  subGain = subVol
  harmGain = harmVol
  surfaceGain = surfaceVol
  masterGain = masterVol
  compressor = comp

  engineState.lastAudioTime = audio.currentTime

  return {
    audio,
    main,
    sub,
    harm,
    surface,
    engineFilter: lowpass,
    harmFilter: bandpass,
    surfaceFilter: surfaceBand,
    engineGain: mainVol,
    subGain: subVol,
    harmGain: harmVol,
    surfaceGain: surfaceVol,
    masterGain: masterVol,
  }
}

export const updateEngineSound = ({
  speed,
  throttle,
  direction,
  surface,
  engineLoad = 0,
  tone = 'steady',
}: {
  speed: number
  throttle: number
  direction: 'forward' | 'reverse' | 'idle'
  surface: 'road' | 'grass'
  engineLoad?: number
  tone?: EngineTone
}) => {
  const loop = ensureEngineLoop()
  if (!loop) {
    return
  }

  const {
    audio,
    main,
    sub,
    harm,
    surface: surfaceTone,
    engineFilter: lowpass,
    harmFilter: bandpass,
    surfaceFilter: surfaceBand,
    engineGain: mainVol,
    subGain: subVol,
    harmGain: harmVol,
    surfaceGain: surfaceVol,
    masterGain: masterVol,
  } = loop

  const now = audio.currentTime
  const dt = Math.min(0.05, Math.max(0.005, now - engineState.lastAudioTime || 0.016))
  engineState.lastAudioTime = now

  if (engineMuted) {
    masterVol.gain.setTargetAtTime(0.0001, now, 0.04)
    surfaceVol.gain.setTargetAtTime(0.0001, now, 0.04)
    return
  }

  const speedFactor = Math.min(1, Math.max(0, speed / 12))
  const throttleFactor = Math.min(1, Math.max(0, throttle))
  const loadFactor = Math.min(1, Math.max(0, engineLoad))
  const toneBase = tone === 'speedy' ? 1.08 : tone === 'heavy' ? 0.92 : 1
  const toneSub = tone === 'speedy' ? 0.9 : tone === 'heavy' ? 1.14 : 1
  const toneHarm = tone === 'speedy' ? 1.22 : tone === 'heavy' ? 0.86 : 1
  const toneFilter = tone === 'speedy' ? 1.12 : tone === 'heavy' ? 0.9 : 1
  const toneSurface = tone === 'speedy' ? 1.04 : tone === 'heavy' ? 0.96 : 1

  const gear =
    direction === 'reverse'
      ? 0
      : speedFactor < 0.22
        ? 1
        : speedFactor < 0.47
          ? 2
          : speedFactor < 0.74
            ? 3
            : 4

  if (gear !== engineState.gear) {
    engineState.gear = gear
    engineState.shiftDipTimer = 0.11
  }

  if (engineState.shiftDipTimer > 0) {
    engineState.shiftDipTimer = Math.max(0, engineState.shiftDipTimer - dt)
  }

  const idleRpm = (direction === 'reverse' ? 1000 : 850) * toneBase
  const rpmRange = (direction === 'reverse' ? 1800 : 4700) * toneBase
  const targetRpm = idleRpm + speedFactor * rpmRange + throttleFactor * 900 + loadFactor * 400

  const rpmBlend = 1 - Math.exp(-dt * (throttleFactor > 0.05 ? 11 : 7))
  engineState.rpm += (targetRpm - engineState.rpm) * rpmBlend

  if (engineState.shiftDipTimer > 0) {
    engineState.rpm *= 0.87
  }

  engineState.wobblePhase += dt * (6 + speedFactor * 11)
  const wow = Math.sin(engineState.wobblePhase * 1.7) * 3.5 + Math.sin(engineState.wobblePhase * 0.41) * 1.3

  const baseTone = (engineState.rpm / 60) * (direction === 'reverse' ? 0.9 : 1) * toneBase
  const mainFreq = baseTone + wow
  const subFreq = mainFreq * 0.5 * toneSub
  const harmFreq = mainFreq * (gear >= 3 ? 3.25 : 2.7) * toneHarm

  const mainGainTarget = (0.03 + speedFactor * 0.05 + throttleFactor * 0.025) * (tone === 'heavy' ? 1.08 : 1)
  const subGainTarget = (0.018 + speedFactor * 0.028) * (tone === 'heavy' ? 1.22 : tone === 'speedy' ? 0.9 : 1)
  const harmGainTarget = (0.007 + speedFactor * 0.018 + throttleFactor * 0.01) * (tone === 'speedy' ? 1.22 : tone === 'heavy' ? 0.82 : 1)

  const lowpassTarget = (700 + speedFactor * 1600 + throttleFactor * 600 - loadFactor * 180) * toneFilter
  const bandpassTarget = (1500 + speedFactor * 2600 + throttleFactor * 420) * toneFilter

  const surfaceGainTarget =
    surface === 'grass'
      ? 0.018 + speedFactor * 0.026 + throttleFactor * 0.012
      : 0.005 + speedFactor * 0.01
  const surfaceToneFreq = (surface === 'grass' ? 62 + speedFactor * 20 : 118 + speedFactor * 40) * toneSurface
  const surfaceBandTarget = (surface === 'grass' ? 120 + speedFactor * 70 : 240 + speedFactor * 140) * toneSurface

  const masterTarget = 0.045 + speedFactor * 0.03

  main.frequency.setTargetAtTime(Math.max(50, mainFreq), now, 0.05)
  sub.frequency.setTargetAtTime(Math.max(28, subFreq), now, 0.07)
  harm.frequency.setTargetAtTime(Math.max(120, harmFreq), now, 0.06)
  surfaceTone.frequency.setTargetAtTime(surfaceToneFreq, now, 0.09)

  mainVol.gain.setTargetAtTime(mainGainTarget, now, 0.07)
  subVol.gain.setTargetAtTime(subGainTarget, now, 0.08)
  harmVol.gain.setTargetAtTime(harmGainTarget, now, 0.06)
  surfaceVol.gain.setTargetAtTime(surfaceGainTarget, now, 0.09)
  masterVol.gain.setTargetAtTime(masterTarget, now, 0.08)

  lowpass.frequency.setTargetAtTime(Math.max(350, lowpassTarget), now, 0.07)
  bandpass.frequency.setTargetAtTime(Math.max(900, bandpassTarget), now, 0.08)
  surfaceBand.frequency.setTargetAtTime(surfaceBandTarget, now, 0.1)
}

export const setEngineMuted = (muted: boolean) => {
  engineMuted = muted
  if (masterGain && ctx) {
    masterGain.gain.setTargetAtTime(muted ? 0.0001 : 0.045, ctx.currentTime, 0.05)
  }
  if (surfaceGain && ctx) {
    surfaceGain.gain.setTargetAtTime(muted ? 0.0001 : 0.01, ctx.currentTime, 0.05)
  }
}

export const stopEngineSound = () => {
  if (engineMainOsc) {
    engineMainOsc.stop()
    engineMainOsc.disconnect()
    engineMainOsc = null
  }
  if (engineSubOsc) {
    engineSubOsc.stop()
    engineSubOsc.disconnect()
    engineSubOsc = null
  }
  if (engineHarmOsc) {
    engineHarmOsc.stop()
    engineHarmOsc.disconnect()
    engineHarmOsc = null
  }
  if (surfaceOsc) {
    surfaceOsc.stop()
    surfaceOsc.disconnect()
    surfaceOsc = null
  }

  if (engineFilter) {
    engineFilter.disconnect()
    engineFilter = null
  }
  if (harmFilter) {
    harmFilter.disconnect()
    harmFilter = null
  }
  if (surfaceFilter) {
    surfaceFilter.disconnect()
    surfaceFilter = null
  }

  if (engineGain) {
    engineGain.disconnect()
    engineGain = null
  }
  if (subGain) {
    subGain.disconnect()
    subGain = null
  }
  if (harmGain) {
    harmGain.disconnect()
    harmGain = null
  }
  if (surfaceGain) {
    surfaceGain.disconnect()
    surfaceGain = null
  }
  if (masterGain) {
    masterGain.disconnect()
    masterGain = null
  }
  if (compressor) {
    compressor.disconnect()
    compressor = null
  }

  engineState.rpm = 850
  engineState.gear = 1
  engineState.shiftDipTimer = 0
  engineState.lastAudioTime = 0
  engineState.wobblePhase = 0
}

const playTone = (frequency: number, duration: number, type: OscillatorType, volume: number) => {
  if (engineMuted) {
    return
  }
  const audio = getCtx()
  if (!audio) {
    return
  }

  const now = audio.currentTime
  const osc = audio.createOscillator()
  const gain = audio.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, now)
  osc.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * 0.65), now + duration)

  gain.gain.setValueAtTime(0.001, now)
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(gain)
  gain.connect(audio.destination)

  osc.start(now)
  osc.stop(now + duration)
}

export const playCollisionSound = (hardHit: boolean, speed: number) => {
  const normalized = Math.min(1.2, Math.max(0.35, speed / 10))
  if (hardHit) {
    playTone(120 * normalized, 0.2, 'sawtooth', 0.11)
    playTone(88 * normalized, 0.26, 'triangle', 0.08)
    return
  }

  playTone(210 * normalized, 0.12, 'square', 0.06)
}

export const playPickupSound = (type: 'star' | 'repair') => {
  if (type === 'star') {
    playTone(520, 0.08, 'triangle', 0.07)
    return
  }

  playTone(280, 0.12, 'sine', 0.07)
}
