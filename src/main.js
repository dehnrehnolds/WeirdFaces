import './style.css'
import { drawFilter } from './filters.js'

const video = document.getElementById('video')
const canvas = document.getElementById('canvas')
const loading = document.getElementById('loading')
const snapBtn = document.getElementById('snap-btn')
const filterBtns = document.querySelectorAll('.filter-btn')

let activeFilter = 'none'
let detector = null

// Hide the raw video — we draw it ourselves onto canvas so warp filters can manipulate pixels
video.style.visibility = 'hidden'
canvas.style.transform = 'none'

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeFilter = btn.dataset.filter
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
    const results = detector.detectForVideo(video, performance.now())
    for (const face of (results.faceLandmarks ?? [])) {
      drawFilter(ctx, w, h, face, activeFilter)
    }
  }

  requestAnimationFrame(renderLoop)
}

// Snap saves exactly what's on canvas (already has mirrored video + filter baked in)
snapBtn.addEventListener('click', () => {
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'weirdface.png'
    a.click()
    URL.revokeObjectURL(url)
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
