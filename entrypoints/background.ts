// Background service worker — minimal.
// Only job: relay toolbar toggle to the active tab's content script
// when the user clicks the extension icon or presses Alt+Shift+S.

export default defineBackground(() => {
  // Allow content scripts to read/write chrome.storage.session.
  // Without this, the default access level (TRUSTED_CONTEXTS_ONLY) silently
  // blocks content-script access, so session state is never persisted.
  chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
  })

  // chrome.action.onClicked fires when the user clicks the extension icon.
  // It also fires for the _execute_action keyboard command (Alt+Shift+S).
  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_TOOLBAR' }).catch(() => {
      // Content script may not be injected yet (e.g. chrome:// pages).
      // Silently ignore — the user can try again after the page loads.
    })
  })
})
