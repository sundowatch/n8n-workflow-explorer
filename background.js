// Background script for n8n Chrome Extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('n8n Workflow Explorer extension installed');
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // This will open the popup automatically due to manifest configuration
});

// Optional: Add context menu for quick access
chrome.contextMenus.create({
  id: "open-n8n-manager",
  title: "Open n8n Workflow Explorer",
  contexts: ["page"]
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-n8n-manager") {
    chrome.action.openPopup();
  }
});

// Handle messages from popup if needed
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openWorkflow') {
    chrome.tabs.create({ url: request.url });
    sendResponse({ success: true });
  }
});