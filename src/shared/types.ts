export type SlooowSpeed = 0.1 | 0.25 | 0.5 | 1

export const SLOOOW_SPEEDS: SlooowSpeed[] = [1, 0.5, 0.25, 0.1]

export const SLOOOW_TAG = '__slooow__'

// Messages flowing over window.postMessage (cross-world, same tab)
export type MainWorldInbound =
  | { tag: typeof SLOOOW_TAG; type: 'SET_SPEED'; speed: number; token: string }

export type MainWorldOutbound =
  | { tag: typeof SLOOOW_TAG; type: 'SLOOOW_STATUS_REPORT'; token: string; rafIntercepted: boolean; gsapDetected: boolean }

// Messages flowing over chrome.runtime (content script ↔ background SW)
export type ContentToBackground =
  | { type: 'TOGGLE_TOOLBAR' }

export type BackgroundToContent =
  | { type: 'TOGGLE_TOOLBAR' }
