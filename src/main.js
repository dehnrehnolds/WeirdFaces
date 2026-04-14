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

let activeFilter = 'none'
let hairColor    = { h: 30, s: 0.65, l: 0.30 }
let detector     = null

const colorPicker = setupColorPicker(color => { hairColor = color })

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
    if (activeFilter === 'hair-color') colorPicker.show()
    else colorPicker.hide()
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
    } else {
      setFaceSwapError(null)
      for (const face of allFaces) {
        drawFilter(ctx, w, h, face, activeFilter, { hairColor })
      }
    }
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
