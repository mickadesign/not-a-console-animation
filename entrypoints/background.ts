// Background service worker — relays toolbar toggle to the active tab's content script.

export default defineBackground(() => {
  // chrome.action.onClicked fires when the user clicks the extension icon
  // or presses the _execute_action keyboard shortcut (Alt+Shift+S).
  chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_TOOLBAR' }).catch(() => {})
  })
})
