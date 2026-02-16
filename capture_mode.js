/* =========================================
   capture_mode.js (Injected into web page)

   Purpose:
   - Enter capture mode overlay
   - User drag to select a rectangle (rect)
   - Try to infer a high-res image URL under the rect (candidateImageSrc)
   - Send rect + dpr + candidateImageSrc back to extension
   ========================================= */

(() => {
  // Prevent duplicate activation (e.g. if the script is injected multiple times, or user clicks "Capture garment" multiple times)
  if (window.__YV_CAPTURE_MODE__) return;
  window.__YV_CAPTURE_MODE__ = true;

  const dpr = window.devicePixelRatio || 1;

  // ---------- UI: overlay + selection box ----------
  const overlay = document.createElement("div");
  overlay.id = "__yv_overlay__";

  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    cursor: "crosshair",
    background: "rgba(0,0,0,0.15)"
  });

  const hint = document.createElement("div");
  hint.textContent = "Drag to select area - ESC to cancel";
  Object.assign(hint.style, {
    position: "fixed",
    top: "12px",
    left: "12px",
    zIndex: "2147483647",
    padding: "8px 10px",
    borderRadius: "10px",
    background: "rgba(0, 0, 0, 0.75)",
    color: "white",
    fontSize: "12px",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
  });

  const box = document.createElement("div");
  box.id = "__yv_box__";
  Object.assign(box.style, {
    position: "fixed",
    border: "2px solid rgba(255,255,255,0.95)",
    background: "rgba(255,255,255,0.12)",
    borderRadius: "8px",
    display: "none",
    zIndex: "2147483647"
  });

  document.body.appendChild(overlay);
  document.body.appendChild(hint);
  document.body.appendChild(box);

  // ---------- State ----------
  let startX = 0;
  let startY = 0;
  let dragging = false;

  // Convert 2 points to rect
  function makeRect(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return {
      x: left,
      y: top,
      w: Math.max(1, right - left),
      h: Math.max(1, bottom - top)
    };
  }

  // Intersection area between imgRect and selectionRect
  function intersectionArea(a, b) {
    const x1 = Math.max(a.left, b.x);
    const y1 = Math.max(a.top, b.y);
    const x2 = Math.min(a.right, b.x + b.w);
    const y2 = Math.min(a.bottom, b.y + b.h);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    return w * h;
  }

  // Try find best <img> under the selection rect
  function findBestImageSrc(selectionRect) {
    const imgs = Array.from(document.images || []);
    let best = null;

    for (const img of imgs) {
      const r = img.getBoundingClientRect();

      // Ignore tiny/invisible images
      const area = r.width * r.height;
      if (r.width < 40 || r.height < 40) continue;
      if (area < 2500) continue;

      const inter = intersectionArea(r, selectionRect);
      if (inter <= 0) continue;

      // Score: prefer larger intersection area, and higher resolution (area) as tie-breaker
      const score = inter;

      if (!best || score > best.score) {
        const src =
          img.currentSrc ||
          img.src ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-original") ||
          null;

        best = { score, src };
      }
    }

    return best?.src || null;
  }

  // ---------- Cleanup ----------
  function cleanup(reason) {
    window.__YV_CAPTURE_MODE__ = false;
    overlay.remove();
    hint.remove();
    box.remove();
    document.removeEventListener("keydown", onKeyDown, true);
    overlay.removeEventListener("mousedown", onDown, true);
    overlay.removeEventListener("mousemove", onMove, true);
    overlay.removeEventListener("mouseup", onUp, true);
    console.log("[Yv] capture mode ended:", reason);
  }

  // ESC cancels
  function onKeyDown(e) {
    if (e.key === "Escape") cleanup("cancelled");
  }

  // Mouse down begins drag
  function onDown(e) {
    e.preventDefault();
    e.stopPropagation();

    dragging = true;
    startX = e.clientX;
    startY = e.clientY;

    box.style.display = "block";
    box.style.left = `${startX}px`;
    box.style.top = `${startY}px`;
    box.style.width = `1px`;
    box.style.height = `1px`;
  }

  // Mouse move updates box
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = makeRect(startX, startY, e.clientX, e.clientY);
    box.style.left = `${rect.x}px`;
    box.style.top = `${rect.y}px`;
    box.style.width = `${rect.w}px`;
    box.style.height = `${rect.h}px`;
  }

  // Mouse up finalizes selection
  function onUp(e) {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();

    dragging = false;

    const rect = makeRect(startX, startY, e.clientX, e.clientY);

    // Try infer high-res image src under rect
    const candidateImageSrc = findBestImageSrc(rect);

    // Send result to extension background
    chrome.runtime.sendMessage({
      type: "CAPTURE_REGION_SELECTED",
      rect, // CSS pixel rect in viewport coords
      dpr, // device pixel ratio
      candidateImageSrc // may be null
    });

    cleanup("selected");
  }

  // Register listeners
  document.addEventListener("keydown", onKeyDown, true);
  overlay.addEventListener("mousedown", onDown, true);
  overlay.addEventListener("mousemove", onMove, true);
  overlay.addEventListener("mouseup", onUp, true);
})();
