/* =========================================
   sidepanel.js (FULL)

   Purpose:
   1) Render cat base
   2) Two capture buttons: Capture Top / Capture Bottom
   3) Dual-path capture result:
      - Path A: high-res candidateImageSrc if available
      - Path B: crop screenshotDataUrl by rect + dpr
   4) Apply captured image onto stage layer:
      - target=top    -> garmentTopImg.src
      - target=bottom -> garmentPantsImg.src
   ========================================= */

const tailImg = document.getElementById("tailImg");
const catImg = document.getElementById("catImg");
const previewBox = document.getElementById("previewBox");
const garmentTopImg = document.getElementById("garmentTopImg");
const garmentPantsImg = document.getElementById("garmentPantsImg");
const stageEl = document.getElementById("stage");

// HTML now has these two ids
const captureTopBtn = document.getElementById("captureTopBtn");
const captureBottomBtn = document.getElementById("captureBottomBtn");

const clearBtn = document.getElementById("clearBtn");
const statusText = document.getElementById("statusText");

const ANCHORS = {
  top: {
    offsetX: -13,
    offsetY: -80,
    scale: 0.45
  },
  bottom: {
    offsetX: -10,
    offsetY: 45,
    scale: 0.5
  }
};

// Track what the next capture should apply to (MVP state)
let pendingTarget = null; // "top" | "bottom" | null

// ---------- Boot: load extension assets ----------
catImg.src = chrome.runtime.getURL("assets/cat.PNG");
if (tailImg) {
  tailImg.src = chrome.runtime.getURL("assets/tail/tail.PNG");
}

garmentTopImg.src = chrome.runtime.getURL(
  "assets/default_clothes/default_top.PNG"
);
garmentPantsImg.src = chrome.runtime.getURL(
  "assets/default_clothes/default_pants.PNG"
);

// ---------- Overlay captured garment layers (NEW) ----------
const capturedTopImg = document.createElement("img");
capturedTopImg.id = "capturedTopImg";
capturedTopImg.alt = "captured top";
capturedTopImg.style.position = "absolute";
capturedTopImg.style.pointerEvents = "none";
capturedTopImg.style.zIndex = "35"; // above default top (30), below pants default (40)
capturedTopImg.style.display = "none";

const capturedBottomImg = document.createElement("img");
capturedBottomImg.id = "capturedBottomImg";
capturedBottomImg.alt = "captured bottom";
capturedBottomImg.style.position = "absolute";
capturedBottomImg.style.pointerEvents = "none";
capturedBottomImg.style.zIndex = "45"; // above default pants (40)
capturedBottomImg.style.display = "none";

// Insert into stage AFTER default garments so z-index works regardless of DOM order
if (stageEl) {
  stageEl.appendChild(capturedTopImg);
  stageEl.appendChild(capturedBottomImg);
} else {
  console.warn("[Yv] stage element not found (#stage).");
}

// ---------- UI helpers ----------
function setStatus(text) {
  if (statusText) statusText.textContent = text;
}

function resetPreview() {
  if (!previewBox) return;
  previewBox.innerHTML = `<div class="placeholder">Waiting for capture...</div>`;
}

function renderImage(src) {
  if (!previewBox) return;
  previewBox.innerHTML = "";
  const img = document.createElement("img");
  img.src = src;
  previewBox.appendChild(img);
}

function applyToStage(target, src) {
  if (!src) return;

  const anchor = ANCHORS[target];
  if (!anchor) return;

  const imgEl = target === "top" ? capturedTopImg : capturedBottomImg;

  // 1) hide default garment for that slot
  hideDefaultGarment(target);

  // 2) set captured src and show overlay
  imgEl.src = src;
  imgEl.style.display = "block";

  // 3) IMPORTANT: give overlay a predictable base size
  // Use stage size as the base; then anchor.scale controls perceived size.
  imgEl.style.width = "100%";
  imgEl.style.height = "100%";
  imgEl.style.objectFit = "contain";
  imgEl.style.objectPosition = "center";

  // 4) anchor transform
  imgEl.style.left = "50%";
  imgEl.style.top = "50%";
  imgEl.style.transform = `translate(-50%, -50%) translate(${anchor.offsetX}px, ${anchor.offsetY}px) scale(${anchor.scale})`;
  imgEl.style.transformOrigin = "center center";
}

function hideDefaultGarment(target) {
  if (target === "top") garmentTopImg.style.visibility = "hidden";
  if (target === "bottom") garmentPantsImg.style.visibility = "hidden";
}

function showDefaultGarment(target) {
  if (target === "top") garmentTopImg.style.visibility = "visible";
  if (target === "bottom") garmentPantsImg.style.visibility = "visible";
}

// ---------- Core: crop screenshot by rect ----------
async function cropScreenshotToDataUrl(screenshotDataUrl, rect, dpr) {
  // rect is CSS pixels in viewport coords
  const sx = Math.round(rect.x * dpr);
  const sy = Math.round(rect.y * dpr);
  const sw = Math.round(rect.w * dpr);
  const sh = Math.round(rect.h * dpr);

  const img = await loadImage(screenshotDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, sw);
  canvas.height = Math.max(1, sh);

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const CUTOUT_ENDPOINT = "http://127.0.0.1:8787/cutout";

async function cutoutDataUrl(inputDataUrl) {
  const resp = await fetch(CUTOUT_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_data_url: inputDataUrl })
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`cutout failed: ${resp.status} ${t}`);
  }

  const json = await resp.json();
  return json.png_data_url;
}

// ---------- Capture flow ----------
function startCapture(target) {
  pendingTarget = target; // remember where to apply when lastCapture arrives
  chrome.runtime.sendMessage({ type: "START_CAPTURE_MODE" });
  setStatus(`Capture ${target}: drag a rectangle on the page`);
}

if (captureTopBtn) {
  captureTopBtn.addEventListener("click", () => startCapture("top"));
} else {
  console.warn(
    "[Yv] captureTopBtn not found. Check sidepanel.html id=captureTopBtn"
  );
}

if (captureBottomBtn) {
  captureBottomBtn.addEventListener("click", () => startCapture("bottom"));
} else {
  console.warn(
    "[Yv] captureBottomBtn not found. Check sidepanel.html id=captureBottomBtn"
  );
}

// ---------- Button: Clear ----------
if (clearBtn) {
  clearBtn.addEventListener("click", async () => {
    await chrome.storage.local.remove(["lastCapture"]);
    pendingTarget = null;

    // show defaults again
    showDefaultGarment("top");
    showDefaultGarment("bottom");

    // hide overlays
    capturedTopImg.src = "";
    capturedTopImg.style.display = "none";
    capturedTopImg.style.transform = "";

    capturedBottomImg.src = "";
    capturedBottomImg.style.display = "none";
    capturedBottomImg.style.transform = "";

    resetPreview();
    setStatus("Cleared");
  });
}

// ---------- Reset garment to default ----------
function resetGarmentToDefault(target) {
  const imgEl = target === "top" ? garmentTopImg : garmentPantsImg;

  // Use default image from extension assets
  const defaultSrc =
    target === "top"
      ? "assets/default_clothes/default_top.PNG"
      : "assets/default_clothes/default_pants.PNG";

  imgEl.src = chrome.runtime.getURL(defaultSrc);

  // Reset styles to default
  imgEl.style.position = "";
  imgEl.style.left = "";
  imgEl.style.top = "";
  imgEl.style.transform = "";
  imgEl.style.transformOrigin = "";
  imgEl.style.inset = "";
  imgEl.style.width = "";
  imgEl.style.height = "";
}

// ---------- Load last state ----------
async function loadLastCapture() {
  const { lastCapture } = await chrome.storage.local.get(["lastCapture"]);
  if (!lastCapture) {
    resetPreview();
    setStatus("Idle");
    return;
  }

  // Just render preview; do NOT auto-apply on boot (avoid surprising overwrites)
  await renderFromLastCapture(lastCapture);
}

/**
 * Render to preview, and return final src used.
 * - If candidateImageSrc exists, use it.
 * - else if screenshotDataUrl+rect+dpr exists, crop and use cropped.
 * - else return null.
 */
async function renderFromLastCapture(lastCapture) {
  const { candidateImageSrc, screenshotDataUrl, rect, dpr } = lastCapture;

  // Path A: show high-res image if available
  if (candidateImageSrc) {
    renderImage(candidateImageSrc);
    setStatus("High-res link");
    return candidateImageSrc;
  }

  // Path B: crop screenshot
  if (screenshotDataUrl && rect && dpr) {
    const cropped = await cropScreenshotToDataUrl(screenshotDataUrl, rect, dpr);
    renderImage(cropped);
    setStatus("Cropped screenshot");
    return cropped;
  }

  resetPreview();
  setStatus("No valid capture data");
  return null;
}

loadLastCapture();

// ---------- Real-time update via storage ----------
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.lastCapture?.newValue) {
    renderFromLastCapture(changes.lastCapture.newValue).then(
      async (srcForPreview) => {
        const last = changes.lastCapture.newValue;

        if (pendingTarget) {
          // 1) 优先拿 cropped dataURL 来做 cutout
          let srcForCutout = null;

          if (last.screenshotDataUrl && last.rect && last.dpr) {
            srcForCutout = await cropScreenshotToDataUrl(
              last.screenshotDataUrl,
              last.rect,
              last.dpr
            );
          } else {
            // fallback: 没有 screenshot 就用预览 src（可能是 URL，MVP 不保证可 cutout）
            srcForCutout = srcForPreview;
          }

          // 2) 如果是 dataURL，走 cutout
          let finalPng = srcForCutout;
          if (
            typeof srcForCutout === "string" &&
            srcForCutout.startsWith("data:")
          ) {
            setStatus(`Cutting out ${pendingTarget}...`);
            finalPng = await cutoutDataUrl(srcForCutout);
          } else {
            // URL 情况：先不 cutout，直接贴（你后面要高精会再做 URL->blob->dataURL）
            setStatus(`Applied ${pendingTarget} (no cutout)`);
          }

          // 3) 贴到 overlay
          applyToStage(pendingTarget, finalPng);
          setStatus(`Applied to ${pendingTarget}`);
        }

        pendingTarget = null;
      }
    );
  }
});

// ---------------- Blink animation (eyelids) ----------------

// Fixed blink sequence: 1 -> 2 -> 3 -> 2 -> 1 (order must not change)
const EYELID_FRAME_PATHS = [
  "assets/eyes/eyelids1.PNG",
  "assets/eyes/eyelids2.PNG",
  "assets/eyes/eyelids3.PNG",
  "assets/eyes/eyelids2.PNG",
  "assets/eyes/eyelids1.PNG"
];

function preloadImages(srcList) {
  for (const src of srcList) {
    const img = new Image();
    img.src = src;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function blinkOnce(eyelidsEl, frameSrcList) {
  eyelidsEl.style.opacity = "1";

  const frameMs = 88; // tweak for speed

  for (const src of frameSrcList) {
    eyelidsEl.src = src;
    await sleep(frameMs);
  }

  eyelidsEl.style.opacity = "0";
}

function scheduleNextBlink(eyelidsEl, frameSrcList) {
  const minIntervalMs = 3333;
  const maxIntervalMs = 8888;

  const nextInMs = Math.floor(
    minIntervalMs + Math.random() * (maxIntervalMs - minIntervalMs)
  );

  setTimeout(async () => {
    const doubleBlinkChance = 0.13;

    await blinkOnce(eyelidsEl, frameSrcList);

    if (Math.random() < doubleBlinkChance) {
      const pauseBetweenBlinksMs = 180 + Math.random() * 220;
      await sleep(pauseBetweenBlinksMs);
      await blinkOnce(eyelidsEl, frameSrcList);
    }

    scheduleNextBlink(eyelidsEl, frameSrcList);
  }, nextInMs);
}

// ---- Tail animation randomization (one-time on load) ----
const tailEl = document.getElementById("tailImg");
if (tailEl) {
  const dur = Math.floor(1800 + Math.random() * 1400); // 1800-3200ms
  const delay = Math.floor(Math.random() * 900); // 0-900ms
  tailEl.style.setProperty("--tailDur", `${dur}ms`);
  tailEl.style.setProperty("--tailDelay", `${delay}ms`);
}

// Init blink only after DOM is ready, and only if eyelidsImg exists
window.addEventListener("DOMContentLoaded", () => {
  const eyelidsEl = document.getElementById("eyelidsImg");
  if (!eyelidsEl) {
    console.warn("[Yv] eyelidsImg not found. Check sidepanel.html.");
    return;
  }

  const EYELID_FRAMES = EYELID_FRAME_PATHS.map((p) => chrome.runtime.getURL(p));

  preloadImages(EYELID_FRAMES);
  scheduleNextBlink(eyelidsEl, EYELID_FRAMES);
});
