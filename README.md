# Yv Side Panel

A Chrome extension that lets you capture clothing items from any webpage and virtually try them on an animated cat character.

![Version](https://img.shields.io/badge/version-0.1.0-blue) ![Manifest](https://img.shields.io/badge/manifest-v3-green)

---

## What It Does

1. Click **Capture Top** or **Capture Bottom** in the side panel
2. Drag to select a clothing item on any webpage
3. The extension auto-detects the best image under your selection
4. Background is removed via local AI (rembg)
5. The garment appears on your animated cat

---

## Project Structure

```
Yv Side Panel MVP/
+-- manifest.json          # Chrome extension config (MV3)
+-- service_worker.js      # Background: screenshot capture, message routing
+-- sidepanel.html         # Side panel UI
+-- sidepanel.js           # Side panel logic: cat rendering, capture flow
+-- sidepanel.css          # Side panel styles
+-- capture_mode.js        # Injected content script: drag-select overlay
|
+-- server/
|   +-- cutout_server.py   # FastAPI server -- background removal endpoint
|   +-- build_labels.py    # Dataset labeling utility (YOLO + OpenCLIP)
|   +-- cutout_demo.py     # Demo image processor
|   +-- pick_demo_items.py # Demo item selector
|   \-- yolov8n.pt         # YOLOv8 nano model weights
|
+-- assets/
|   +-- cat.PNG
|   +-- default_clothes/   # Default top & bottom fallbacks
|   +-- demo_clothes/      # Pre-processed sample garments
|   +-- eyes/              # Eyelid animation frames
|   \-- tail/              # Tail sprite
|
\-- YV_dataset/            # Generated clothing dataset
    +-- raw_all/           # Copied source images
    +-- labels/            # Per-image JSON metadata
    \-- manifest.csv       # Dataset summary
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension | JavaScript (Vanilla), Chrome MV3 API, Canvas API |
| UI | HTML5, CSS3 |
| Backend | Python, FastAPI, Uvicorn |
| Background removal | rembg (U2-Net) |
| Object detection | YOLOv8n |
| Image classification | OpenCLIP |
| Image processing | Pillow, OpenCV |

---

## Prerequisites

- **Chrome** (or any Chromium browser)
- **Python 3.10+** with a virtual environment

Install Python dependencies:

```bash
cd server
pip install fastapi uvicorn rembg pillow
```

For dataset tools (optional):

```bash
pip install ultralytics open-clip-torch torch torchvision opencv-python
```

---

## Setup & Run

### 1. Start the cutout server

```bash
cd server
uvicorn cutout_server:app --host 127.0.0.1 --port 8787
```

The server must be running for background removal to work.

### 2. Load the extension in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `Yv Side Panel MVP/` folder

### 3. Open the side panel

Click the Yv extension icon in the toolbar. The side panel opens on the right.

---

## How to Use

| Action | How |
|--------|-----|
| Capture a top | Click **Capture Top** -> drag over a clothing item on any page |
| Capture a bottom | Click **Capture Bottom** -> drag over pants/skirt |
| Clear outfit | Click the **Clear** button in the header |
| Cancel capture | Press **ESC** |

**Image selection logic**: When you drag-select a region, the extension finds the `<img>` element with the largest intersection area. It prefers the full-res `src` URL over a screenshot crop for better quality.

---

## Data Flow

```
User clicks Capture
    -> capture_mode.js injected into page
    -> User drags selection
    -> Best image URL detected (intersection check)
    -> service_worker.js captures screenshot + fetches high-res URL
    -> Stored in chrome.storage.local
    -> sidepanel.js detects storage change
    -> Image POSTed to localhost:8787/cutout
    -> rembg removes background -> PNG with alpha
    -> Garment rendered on cat character
```

---

## Dataset Tools (Optional)

Tools for building a labeled clothing dataset:

```bash
# Label images with YOLO + CLIP
python server/build_labels.py

# Pick representative demo items
python server/pick_demo_items.py

# Generate cutout versions of demo items
python server/cutout_demo.py
```

Output goes to `YV_dataset/` and `assets/demo_clothes/`.
