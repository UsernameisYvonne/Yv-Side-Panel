// ================================
// service_worker.js (Background)
// - Open side panel when user clicks the extension icon
// - Receive messages from content scripts (web pages)
// - Store data into chrome.storage for the side panel to read
// ================================

// --------------------------------
// 1) onInstalled: run once when the extension is installed or updated
// --------------------------------
chrome.runtime.onInstalled.addListener(() => {
  console.log("[Yv] Installed / Updated");
  // Initialization:
  // - Set default settings
  // - Data migration between versions
  // MVP
});

// --------------------------------
// 2) When user clicks the extension icon (toolbar action)
// --------------------------------
chrome.action?.onClicked?.addListener(async (tab) => {
  // async: is needed if return is promise for future -> await
  // tab: the current active tab where the user clicked the icon

  try {
    // Open side panel for THIS tab (open (return is promise for future) sometimes will fail, so it's better to use await)
    await chrome.sidePanel.open({ tabId: tab.id });

    console.log("[Yv] Side panel opened for tab:", tab.id);
  } catch (err) {
    // If opening fails, print warning
    console.warn("[Yv] sidePanel.open failed:", err);
  }
});

// --------------------------------
// 3) Message bridge: receive messages from content scripts or panel
// --------------------------------
chrome.runtime.onMessage.addListener(async (msg, sender) => {
  // ---------- 1) Start capture mode: inject capture_mode.js ----------
  if (msg?.type === "START_CAPTURE_MODE") {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!tab?.id) return;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["capture_mode.js"]
      });
      console.log("[Yv] capture_mode injected into tab:", tab.id);
    } catch (err) {
      console.warn("[Yv] executeScript(capture_mode) failed:", err);
    }
    return;
  }

  // ---------- 2) User selected a rect: capture visible tab screenshot ----------
  if (msg?.type === "CAPTURE_REGION_SELECTED" && msg?.rect) {
    const rect = msg.rect;
    const dpr = msg.dpr || 1;
    const candidateImageSrc = msg.candidateImageSrc || null;

    // captureVisibleTab needs windowId
    const windowId = sender?.tab?.windowId;
    if (typeof windowId !== "number") return;

    try {
      // Take screenshot of current visible viewport
      const screenshotDataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: "png"
      });

      // Store everything for side panel to render
      await chrome.storage.local.set({
        lastCapture: {
          ts: Date.now(),
          rect,
          dpr,
          candidateImageSrc,
          screenshotDataUrl
        }
      });

      console.log("[Yv] Stored lastCapture. candidate:", !!candidateImageSrc);
    } catch (err) {
      console.warn("[Yv] captureVisibleTab failed:", err);
    }
    return;
  }
});
