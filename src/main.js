import './style.css'
import { drawFilter } from './filters.js'

const video = document.getElementById('video')
const canvas = document.getElementById('canvas')
const loading = document.getElementById('loading')
const snapBtn = document.getElementById('snap-btn')
const filterBtns = document.querySelectorAll('.filter-btn')

let activeFilter = 'none'
let detector = null
let animFrame = null

// --- Filter selection ---
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeFilter = btn.dataset.filter
  })
})

// --- Camera setup ---
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  })
  video.srcObject = stream
  await new Promise(resolve => video.addEventListener('loadedmetadata', resolve, { once: true }))
  video.play()
}

// --- MediaPipe FaceMesh setup ---
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
    numFaces: 1,
  })
}

// --- Render loop ---
function renderLoop() {
  const ctx = canvas.getContext('2d')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (detector && video.readyState >= 2) {
    const results = detector.detectForVideo(video, performance.now())
    if (results.faceLandmarks?.length > 0) {
      drawFilter(ctx, canvas.width, canvas.height, results.faceLandmarks[0], activeFilter)
    }
  }

  animFrame = requestAnimationFrame(renderLoop)
}

// --- Snap ---
snapBtn.addEventListener('click', () => {
  const snap = document.createElement('canvas')
  snap.width = canvas.width
  snap.height = canvas.height
  const ctx = snap.getContext('2d')
  // Flip to match the mirrored display
  ctx.translate(snap.width, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, 0, 0)
  ctx.scale(-1, 1)
  ctx.translate(-snap.width, 0)
  ctx.drawImage(canvas, 0, 0)

  snap.toBlob(blob => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'weirdface.png'
    a.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
})

// --- Init ---
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
