import { getAllSnaps, deleteSnap } from './db.js'

// ── DOM refs (injected by index.html) ────────────────────────────────────────
const galleryBtn    = document.getElementById('gallery-btn')
const galleryPanel  = document.getElementById('gallery-panel')
const galleryClose  = document.getElementById('gallery-close')
const galleryGrid   = document.getElementById('gallery-grid')
const galleryEmpty  = document.getElementById('gallery-empty')

// Full-screen lightbox
const lightbox      = document.getElementById('lightbox')
const lightboxImg   = document.getElementById('lightbox-img')
const lightboxClose = document.getElementById('lightbox-close')
const lightboxShare = document.getElementById('lightbox-share')
const lightboxDel   = document.getElementById('lightbox-delete')

let currentSnapId   = null
let currentBlobUrl  = null

// ── Open / close panel ───────────────────────────────────────────────────────
galleryBtn.addEventListener('click', openGallery)
galleryClose.addEventListener('click', closeGallery)
galleryPanel.addEventListener('click', e => { if (e.target === galleryPanel) closeGallery() })

function openGallery() {
  galleryPanel.classList.add('open')
  renderGrid()
}
function closeGallery() {
  galleryPanel.classList.remove('open')
}

// ── Render thumbnails ────────────────────────────────────────────────────────
async function renderGrid() {
  galleryGrid.innerHTML = ''
  const snaps = await getAllSnaps()

  if (snaps.length === 0) {
    galleryEmpty.style.display = 'flex'
    return
  }
  galleryEmpty.style.display = 'none'

  for (const snap of snaps) {
    const url  = URL.createObjectURL(snap.blob)
    const item = document.createElement('div')
    item.className = 'gallery-item'

    const img = document.createElement('img')
    img.src = url
    img.loading = 'lazy'
    img.addEventListener('load', () => URL.revokeObjectURL(url))

    item.appendChild(img)
    item.addEventListener('click', () => openLightbox(snap))
    galleryGrid.appendChild(item)
  }
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
function openLightbox(snap) {
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl)
  currentBlobUrl  = URL.createObjectURL(snap.blob)
  currentSnapId   = snap.id
  lightboxImg.src = currentBlobUrl
  lightbox.classList.add('open')

  // Show share button only if Web Share API supports files
  lightboxShare.style.display = (navigator.canShare && navigator.canShare({ files: [new File([snap.blob], 'weirdface.png', { type: 'image/png' })] }))
    ? 'flex'
    : 'none'
}

lightboxClose.addEventListener('click', closeLightbox)
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox() })

function closeLightbox() {
  lightbox.classList.remove('open')
  lightboxImg.src = ''
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null }
  currentSnapId = null
}

// ── Share (Web Share API) ────────────────────────────────────────────────────
lightboxShare.addEventListener('click', async () => {
  if (!currentBlobUrl || !currentSnapId) return
  const snaps = await getAllSnaps()
  const snap  = snaps.find(s => s.id === currentSnapId)
  if (!snap) return
  try {
    await navigator.share({
      files: [new File([snap.blob], 'weirdface.png', { type: 'image/png' })],
      title: 'WeirdFace',
    })
  } catch (err) {
    if (err.name !== 'AbortError') console.error('Share failed', err)
  }
})

// ── Delete ───────────────────────────────────────────────────────────────────
lightboxDel.addEventListener('click', async () => {
  if (currentSnapId == null) return
  await deleteSnap(currentSnapId)
  closeLightbox()
  renderGrid()
})

// ── Public: call after a new snap is saved so the grid stays in sync ─────────
export function refreshGallery() {
  if (galleryPanel.classList.contains('open')) renderGrid()
}
