import type { StateCreator } from 'zustand'
import type { PresetsSlice } from '@/types/store'

export const createPresetsSlice: StateCreator<PresetsSlice> = (set, get) => ({
  presets: {},
  activeLoomPresetId: null,
  loomRegistry: {},

  setPresets: (presets) => set({ presets }),
  setActiveLoomPreset: (id) => {
    const { setSetting } = get() as any
    set({ activeLoomPresetId: id })
    if (setSetting) setSetting('activeLoomPresetId', id)
  },
  setLoomRegistry: (registry) => set({ loomRegistry: registry }),
  getActivePresetForGeneration: () => get().activeLoomPresetId || null,
})
