import { applyKey, createInputState, keyCodeToInput, resetGamepadInput, setGamepadInput } from '../../keys'
import { unlockAudio } from '../../sfx'
import type { DriveInputState } from '../../keys'

type SetKeyboardInput = (key: keyof DriveInputState, active: boolean) => void
type SetGamepadConnected = (connected: boolean) => void

export const bindKeyboardControls = (inputRef: { current: DriveInputState }, setKeyboardInput: SetKeyboardInput) => {
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
}

export const bindGamepadConnectionState = (
  activeGamepadIndexRef: { current: number | null },
  setGamepadConnected: SetGamepadConnected,
) => {
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
}

export const syncGamepadInput = (activeGamepadIndexRef: { current: number | null }) => {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    return
  }
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

