// postMessage bridge — typed helpers for cross-world communication.
// The content script (ISOLATED world) uses these to send commands to
// inject.ts (MAIN world) via window.postMessage.

import { SLOWMO_TAG } from '../../src/shared/types'

// Token is set by inject.ts at document_start as window.__slowmoToken.
// Content script reads it once at document_idle (synchronous — no race).
function getToken(): string {
  return (window as any).__slowmoToken ?? ''
}

export function sendSetSpeed(speed: number): void {
  window.postMessage(
    {
      tag: SLOWMO_TAG,
      type: 'SET_SPEED',
      speed,
      token: getToken(),
    },
    '*',
  )
}

export function readToken(): string {
  return getToken()
}
