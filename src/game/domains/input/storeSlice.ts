import { createInputState } from '../../keys'
import type { InputSlice, SliceCreator } from '../../store/types'

export const createInputSlice: SliceCreator<InputSlice> = (set) => ({
  keyboardInput: createInputState(),
  gamepadConnected: false,
  setKeyboardInput: (key, active) =>
    set((state) => ({
      ...state,
      keyboardInput: { ...state.keyboardInput, [key]: active },
    })),
  setGamepadConnected: (connected) =>
    set((state) => ({
      ...state,
      gamepadConnected: connected,
    })),
})

