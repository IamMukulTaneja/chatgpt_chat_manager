// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  // Add any content script specific functionality here
  // For now, we're handling everything in the background script
  sendResponse({ success: true });
}); 