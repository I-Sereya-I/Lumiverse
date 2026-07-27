import type { StateCreator } from 'zustand'
import type { AppStore, FloatingAvatarSlice } from '@/types/store'

export const createFloatingAvatarSlice: StateCreator<AppStore, [], [], FloatingAvatarSlice> = (set, get) => ({
  floatingAvatar: null,

  openFloatingAvatar: (imageUrl, displayName) => {
    const settings = get().portraitDockSettings
    const rect = settings.rememberSizePosition && settings.lastPortrait
      ? settings.rect
      : { x: -1, y: -1, width: 280, height: 280 }
    set({
      floatingAvatar: {
        imageUrl,
        displayName,
        ...rect,
      },
    })
    get().setSetting('portraitDockSettings', {
      ...settings,
      open: true,
      lastPortrait: { imageUrl, displayName },
    })
  },

  updateFloatingAvatar: (partial) =>
    set((state) => {
      if (!state.floatingAvatar) return state
      return { floatingAvatar: { ...state.floatingAvatar, ...partial } }
    }),

  closeFloatingAvatar: () => {
    const settings = get().portraitDockSettings
    set({ floatingAvatar: null })
    get().setSetting('portraitDockSettings', { ...settings, open: false })
  },
})
