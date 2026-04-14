# WeirdFaces — Code Overview

A real-time face-filter camera app built with **Vite + vanilla JavaScript**. Uses MediaPipe's FaceLandmarker to track 468 facial landmarks per face and draws animated filters on a canvas overlay.

---

## Project Structure

```
WeirdFaces/
├── index.html          # App shell + filter buttons + snap button
├── package.json        # Vite dev dependency only
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.js         # Camera setup, render loop, snap handler
    ├── filters.js      # All filter drawing logic
    ├── style.css       # Dark-themed mobile-first UI
    ├── colorPicker.js  # (stub / unused)
    └── counter.js      # (stub / unused)
```

---

## How It Works

### 1. Camera + Canvas (`main.js`)

- Requests the user's front camera via `getUserMedia`
- The raw `<video>` element is hidden — instead, each frame is drawn onto a `<canvas>` so filters can manipulate pixels directly
- Video is mirrored (selfie-style) using `ctx.scale(-1, 1)` on every frame
- `renderLoop()` runs via `requestAnimationFrame` and calls `drawFilter()` for every detected face

### 2. Face Detection

- Uses **MediaPipe Tasks Vision** loaded from CDN (`@mediapipe/tasks-vision@0.10.14`)
- Model: `face_landmarker.task` (float16, GPU delegate)
- Configured for up to **2 faces** simultaneously, running in `VIDEO` mode
- Returns 468 landmarks per face, each as normalised `{x, y, z}` coordinates

### 3. Filters (`filters.js`)

Filters fall into two categories:

#### Overlay filters (drawn on top with `withMirror`)
These draw shapes over the face using canvas 2D API:

| Filter | What it draws |
|---|---|
| `glasses` | Two ellipses with bridge + arms, blue tint fill |
| `bunny` | Two tall pink bezier ears above the head |
| `hat` | Black top hat with red band and gold buckle |
| `big-nose` | Enlarged radial-gradient nose ellipse with nostrils |
| `tiny-mouth` | Skin-coloured ellipse covering mouth, tiny dark opening |
| `beard` | Filled jaw-to-chin shape with hair stroke texture + moustache |

#### Warp filters (pixel manipulation via offscreen canvas)
These zoom a region of the frame and composite it back with a shaped mask:

| Filter | What it warps |
|---|---|
| `big-eyes` | Enlarges each eye region using eye contour as mask |
| `big-mouth` | Enlarges the mouth region using mouth contour as mask |
| `big-head` | Enlarges the entire face oval |
| `balloon-head` | Circular zoom of head + balloon string/highlight effects |
| `wow-face` | Combines big-eyes + big-mouth in one pass |

#### Key helpers

- **`zoomWithShapedMask()`** — copies a source region to an offscreen canvas, scales it up, then masks it to a landmark contour shape with feathered edges
- **`zoomWithCircleMask()`** — same idea but with a circular mask (used for balloon head)
- **`getFaceCenter()`** — computes face centre and average radius from the FACE_OVAL landmark group
- **`withMirror()`** — wraps drawing calls in a mirrored transform so overlay coordinates align with the mirrored canvas

### 4. Snap

Clicking **📸 Snap** calls `canvas.toBlob()` and triggers a download of `weirdface.png` — the exact frame currently visible including the active filter.

---

## Landmark Index Groups Used

| Group | Landmark indices |
|---|---|
| Left eye contour | 33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246 |
| Right eye contour | 362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398 |
| Mouth contour | 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146 |
| Face oval | 10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109 |
| Left jaw | 234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152 |
| Right jaw | 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454 |

---

## Running Locally

```bash
npm install
npm run dev
```

Open in a browser that supports camera access (Chrome or Safari recommended). Accept the camera permission prompt.

---

## Tech Stack

| Tool | Role |
|---|---|
| [Vite](https://vite.dev) | Dev server + bundler |
| [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) | Face landmark detection |
| Vanilla JS + Canvas 2D | All rendering |
