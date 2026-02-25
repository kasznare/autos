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

export const applyKey = (state: DriveInputState, code: string, active: boolean) => {
  if (code === 'ArrowUp' || code === 'KeyW') state.forward = active
  if (code === 'ArrowDown' || code === 'KeyS') state.backward = active
  if (code === 'ArrowLeft' || code === 'KeyA') state.left = active
  if (code === 'ArrowRight' || code === 'KeyD') state.right = active
  if (code === 'Space' || code === 'KeyR') state.restart = active
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

export const getMergedInput = (keyboardState: DriveInputState): DriveInputState => ({
  forward: keyboardState.forward || virtualInputState.forward,
  backward: keyboardState.backward || virtualInputState.backward,
  left: keyboardState.left || virtualInputState.left,
  right: keyboardState.right || virtualInputState.right,
  restart: keyboardState.restart || virtualInputState.restart,
})
