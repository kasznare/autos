export type DriveInputState = {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  restart: boolean
}

export const createInputState = (): DriveInputState => ({
  forward: false,
  backward: false,
  left: false,
  right: false,
  restart: false,
})

const virtualInputState = createInputState()
const gamepadInputState = createInputState()

export const keyCodeToInput = (code: string): keyof DriveInputState | null => {
  if (code === 'ArrowUp' || code === 'KeyW') return 'forward'
  if (code === 'ArrowDown' || code === 'KeyS') return 'backward'
  if (code === 'ArrowLeft' || code === 'KeyA') return 'left'
  if (code === 'ArrowRight' || code === 'KeyD') return 'right'
  if (code === 'Space' || code === 'KeyR') return 'restart'
  return null
}

export const applyKey = (state: DriveInputState, code: string, active: boolean) => {
  const mapped = keyCodeToInput(code)
  if (mapped) {
    state[mapped] = active
  }
}

export const setVirtualInput = (key: keyof DriveInputState, active: boolean) => {
  virtualInputState[key] = active
}

export const resetVirtualInput = () => {
  virtualInputState.forward = false
  virtualInputState.backward = false
  virtualInputState.left = false
  virtualInputState.right = false
  virtualInputState.restart = false
}

export const setGamepadInput = (key: keyof DriveInputState, active: boolean) => {
  gamepadInputState[key] = active
}

export const resetGamepadInput = () => {
  gamepadInputState.forward = false
  gamepadInputState.backward = false
  gamepadInputState.left = false
  gamepadInputState.right = false
  gamepadInputState.restart = false
}

export const getMergedInput = (keyboardState: DriveInputState): DriveInputState => ({
  forward: keyboardState.forward || virtualInputState.forward || gamepadInputState.forward,
  backward: keyboardState.backward || virtualInputState.backward || gamepadInputState.backward,
  left: keyboardState.left || virtualInputState.left || gamepadInputState.left,
  right: keyboardState.right || virtualInputState.right || gamepadInputState.right,
  restart: keyboardState.restart || virtualInputState.restart || gamepadInputState.restart,
})
