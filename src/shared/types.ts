export type SlowMoSpeed = 0.1 | 0.25 | 0.5 | 1

export const SLOWMO_SPEEDS: SlowMoSpeed[] = [0.1, 0.25, 0.5, 1]

export const SLOWMO_TAG = '__slowmo__'

// Messages flowing over window.postMessage (cross-world, same tab)
export type MainWorldInbound =
  | { tag: typeof SLOWMO_TAG; type: 'SET_SPEED'; speed: number; token: string }

export type MainWorldOutbound =
  | { tag: typeof SLOWMO_TAG; type: 'SLOWMO_STATUS_REPORT'; token: string; rafIntercepted: boolean; gsapDetected: boolean }

// Messages flowing over chrome.runtime (content script ↔ background SW)
export type ContentToBackground =
  | { type: 'TOGGLE_TOOLBAR' }

export type BackgroundToContent =
  | { type: 'TOGGLE_TOOLBAR' }
