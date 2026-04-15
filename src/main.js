import './style.css'
import { drawFilter, drawFaceSwap } from './filters.js'
import { setupColorPicker } from './colorPicker.js'
import { saveSnap } from './db.js'
import { refreshGallery } from './gallery.js'

const video          = document.getElementById('video')
const canvas         = document.getElementById('canvas')
const loading        = document.getElementById('loading')
const snapBtn        = document.getElementById('snap-btn')
const filterBtns     = document.querySelectorAll('.filter-btn')
const faceSwapError  = document.getElementById('face-swap-error')
const faceSwapErrMsg = document.getElementById('face-swap-error-msg')
const hairDebugBtn   = document.getElementById('hair-debug-btn')

let activeFilter    = 'none'
let hairDebug       = false
let hairColor       = { h: 30, s: 0.65, l: 0.30 }
let detector        = null
let segmenter       = null
let segmenterStatus = 'not loaded'   // shown in debug overlay
let cachedHairMask  = null   // Uint8Array (256×256 category mask), null until first seg run
let segFrameCount   = 0

const colorPicker = setupColorPicker(color => { hairColor = color })

hairDebugBtn.addEventListener('click', () => {
  hairDebug = !hairDebug
  hairDebugBtn.classList.toggle('active', hairDebug)
})

// Show / hide the face-swap error banner (pass null to hide)
function setFaceSwapError(msg) {
  if (msg) {
    faceSwapErrMsg.textContent = msg
    faceSwapError.classList.remove('hidden')
  } else {
    faceSwapError.classList.add('hidden')
  }
}

// Hide the raw video — we draw it ourselves onto canvas so warp filters can manipulate pixels
video.style.visibility = 'hidden'
canvas.style.transform = 'none'

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeFilter = btn.dataset.filter
    if (activeFilter === 'hair-color') {
      colorPicker.show()
      hairDebugBtn.classList.remove('hidden')
      ensureSegmenter()
    } else {
      colorPicker.hide()
      hairDebugBtn.classList.add('hidden')
      hairDebug = false
      hairDebugBtn.classList.remove('active')
    }
  })
})

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  video.srcObject = stream
  await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }))
  // Set canvas size once — resizing clears canvas and resets context state
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  video.play()
}

// Lazy-load the hair segmenter only when the hair-color filter is first selected
async function ensureSegmenter() {
  if (segmenter) return
  segmenterStatus = 'loading…'
  try {
    const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm')
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    )
    segmenter = await vision.ImageSegmenter.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.task',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      outputCategoryMask: true,
      outputConfidenceMasks: false,
    })
    segmenterStatus = 'ready'
  } catch (err) {
    segmenterStatus = 'error: ' + err.message
    console.error('Segmenter load failed:', err)
  }
}

async function loadDetector() {
  const vision = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm')
  const filesetResolver = await vision.FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  )
  detector = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 2,
  })
}

function renderLoop() {
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height

  // Draw the mirrored video frame — this is our base for every filter
  ctx.save()
  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0, w, h)
  ctx.restore()

  if (detector && video.readyState >= 2) {
    const results  = detector.detectForVideo(video, performance.now())
    const allFaces = results.faceLandmarks ?? []

    // Run hair segmentation every 2nd frame (hair moves slowly enough)
    if (activeFilter === 'hair-color' && segmenter) {
      segFrameCount++
      if (segFrameCount % 2 === 1) {
        segmenter.segmentForVideo(video, performance.now(), result => {
          cachedHairMask = new Uint8Array(result.categoryMask.getAsUint8Array())
        })
      }
    }

    if (activeFilter === 'face-swap') {
      if (allFaces.length >= 2) {
        setFaceSwapError(null)
        drawFaceSwap(ctx, w, h, allFaces)
      } else {
        const msg = allFaces.length === 0
          ? '👀 No faces detected — point the camera at two people'
          : '🫂 Need 2 faces in frame to swap'
        setFaceSwapError(msg)
      }
    } else if (activeFilter === 'hair-color') {
      // Hair color doesn't need face landmarks — draw once regardless of face count
      setFaceSwapError(null)
      drawFilter(ctx, w, h, null, activeFilter, { hairColor, hairMask: cachedHairMask, hairDebug, segmenterStatus })
    } else {
      setFaceSwapError(null)
      for (const face of allFaces) {
        drawFilter(ctx, w, h, face, activeFilter, { hairColor, hairMask: cachedHairMask })
      }
    }
  }

  // Debug status — drawn regardless of detector state so we always get feedback
  if (hairDebug && activeFilter === 'hair-color') {
    const hairPx = cachedHairMask ? Array.from(cachedHairMask).filter(v => v === 1).length : -1
    const label  = `detector:${detector ? 'ok' : 'null'} seg:${segmenterStatus} hair:${hairPx < 0 ? 'no mask' : hairPx + 'px'}`
    ctx.save()
    ctx.font = 'bold 13px monospace'
    const tw = ctx.measureText(label).width
    ctx.fillStyle = 'rgba(0,0,0,0.7)'
    ctx.fillRect(w - tw - 24, h - 36, tw + 16, 26)
    ctx.fillStyle = '#4ade80'
    ctx.fillText(label, w - tw - 16, h - 18)
    ctx.restore()
  }

  requestAnimationFrame(renderLoop)
}

// Snap saves to IndexedDB and refreshes the gallery
snapBtn.addEventListener('click', () => {
  canvas.toBlob(async blob => {
    await saveSnap(blob)
    refreshGallery()
    // Brief visual flash to confirm the snap
    snapBtn.textContent = '✅ Saved!'
    setTimeout(() => { snapBtn.textContent = '📸 Snap' }, 1000)
  }, 'image/png')
})

;(async () => {
  try {
    await Promise.all([startCamera(), loadDetector()])
    loading.classList.add('hidden')
    renderLoop()
  } catch (err) {
    loading.querySelector('p').textContent = 'Error: ' + err.message
    console.error(err)
  }
})()
