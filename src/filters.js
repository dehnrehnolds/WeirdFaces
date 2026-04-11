// Landmark index groups for feature-shaped masks
const LEFT_EYE_CONTOUR  = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
const MOUTH_CONTOUR     = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]

function lm(landmarks, i, w, h) {
  return { x: landmarks[i].x * w, y: landmarks[i].y * h }
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// Reusable offscreen canvas for snapshots
let _snap = null
function snapshot(canvas) {
  if (!_snap || _snap.width !== canvas.width || _snap.height !== canvas.height) {
    _snap = document.createElement('canvas')
    _snap.width = canvas.width
    _snap.height = canvas.height
  }
  _snap.getContext('2d').drawImage(canvas, 0, 0)
  return _snap
}

// Zoom a region of the canvas, masked to the shape defined by contour landmark indices.
// cx, cy: center in mirrored canvas space
// srcR, dstR: sample and draw radii
// expand: scale the mask shape outward slightly (1.0 = exact fit, 1.3 = 30% larger)
function zoomWithShapedMask(ctx, src, w, h, landmarks, contourIndices, cx, cy, srcR, dstR, expand = 1.25) {
  const d = dstR * 2
  const scale = dstR / srcR

  const tmp = document.createElement('canvas')
  tmp.width = d
  tmp.height = d
  const tCtx = tmp.getContext('2d')

  // Draw zoomed pixels from src region
  tCtx.drawImage(src, cx - srcR, cy - srcR, srcR * 2, srcR * 2, 0, 0, d, d)

  // Build the feature-shaped mask in temp canvas space.
  // Source pixel at canvas (px, py) maps to temp canvas: ((px - cx + srcR) * scale, (py - cy + srcR) * scale)
  // We then expand the shape outward from the center (dstR, dstR) for a slightly larger mask.
  tCtx.globalCompositeOperation = 'destination-in'
  tCtx.filter = `blur(${Math.round(dstR * 0.07)}px)` // soft feathered edge
  tCtx.beginPath()

  contourIndices.forEach((idx, i) => {
    const lmk = landmarks[idx]
    // Convert landmark to mirrored canvas space
    const canvasX = w - lmk.x * w
    const canvasY = lmk.y * h
    // Map to temp canvas space
    const tx = (canvasX - cx + srcR) * scale
    const ty = (canvasY - cy + srcR) * scale
    // Expand outward from temp canvas center
    const ex = dstR + (tx - dstR) * expand
    const ey = dstR + (ty - dstR) * expand
    if (i === 0) tCtx.moveTo(ex, ey)
    else tCtx.lineTo(ex, ey)
  })

  tCtx.closePath()
  tCtx.fillStyle = 'white'
  tCtx.fill()

  ctx.drawImage(tmp, cx - dstR, cy - dstR)
}

// Draw overlay filters in a mirrored context so landmark coords match the mirrored video
function withMirror(ctx, w, fn) {
  ctx.save()
  ctx.translate(w, 0)
  ctx.scale(-1, 1)
  fn()
  ctx.restore()
}

// ─────────────────────────────────────────
export function drawFilter(ctx, w, h, landmarks, filter) {
  switch (filter) {
    case 'glasses':    withMirror(ctx, w, () => drawGlasses(ctx, w, h, landmarks)); break
    case 'bunny':      withMirror(ctx, w, () => drawBunnyEars(ctx, w, h, landmarks)); break
    case 'hat':        withMirror(ctx, w, () => drawHat(ctx, w, h, landmarks)); break
    case 'big-nose':   withMirror(ctx, w, () => drawBigNose(ctx, w, h, landmarks)); break
    case 'big-eyes':   drawBigEyesWarp(ctx, w, h, landmarks); break
    case 'big-mouth':  drawBigMouthWarp(ctx, w, h, landmarks); break
    case 'tiny-mouth': withMirror(ctx, w, () => drawTinyMouth(ctx, w, h, landmarks)); break
    case 'wow-face': {
      // Take ONE snapshot so both warps sample clean, undistorted pixels
      const src = snapshot(ctx.canvas)
      drawBigEyesWarp(ctx, w, h, landmarks, src)
      drawBigMouthWarp(ctx, w, h, landmarks, src)
      break
    }
    default: break
  }
}

// ─────────────────────────────────────────
// BIG EYES — zooms actual pixels, masked to the eye outline shape
function drawBigEyesWarp(ctx, w, h, landmarks, src = null) {
  src = src ?? snapshot(ctx.canvas)

  const eyes = [
    { contour: LEFT_EYE_CONTOUR,  outer: 33,  inner: 133 },
    { contour: RIGHT_EYE_CONTOUR, outer: 263, inner: 362 },
  ]

  for (const { contour, outer, inner } of eyes) {
    const o = landmarks[outer]
    const inn = landmarks[inner]
    const eyeW = dist({ x: o.x * w, y: o.y * h }, { x: inn.x * w, y: inn.y * h })

    // Eye center in mirrored canvas space
    const cx = w - ((o.x + inn.x) / 2) * w
    const cy = ((o.y + inn.y) / 2) * h

    const srcR = eyeW * 0.85   // tight sample radius around the eye
    const dstR = eyeW * 1.9    // enlarged draw radius

    zoomWithShapedMask(ctx, src, w, h, landmarks, contour, cx, cy, srcR, dstR, 1.3)
  }
}

// BIG MOUTH — zooms actual pixels, masked to the lip outline shape
function drawBigMouthWarp(ctx, w, h, landmarks, src = null) {
  src = src ?? snapshot(ctx.canvas)

  const lc = landmarks[61]
  const rc = landmarks[291]
  const ul = landmarks[13]
  const ll = landmarks[14]

  const mouthW = dist(
    { x: lc.x * w, y: lc.y * h },
    { x: rc.x * w, y: rc.y * h }
  )

  // Mouth center in mirrored canvas space
  const cx = w - ((lc.x + rc.x) / 2) * w
  const cy = ((ul.y + ll.y) / 2) * h

  const srcR = mouthW * 0.65
  const dstR = mouthW * 1.4

  zoomWithShapedMask(ctx, src, w, h, landmarks, MOUTH_CONTOUR, cx, cy, srcR, dstR, 1.35)
}

// ─────────────────────────────────────────
// GLASSES
function drawGlasses(ctx, w, h, landmarks) {
  const lo = lm(landmarks, 33, w, h)
  const li = lm(landmarks, 133, w, h)
  const ri = lm(landmarks, 362, w, h)
  const ro = lm(landmarks, 263, w, h)

  const eyeW = dist(lo, li)
  const lCx = (lo.x + li.x) / 2, lCy = (lo.y + li.y) / 2
  const rCx = (ri.x + ro.x) / 2, rCy = (ri.y + ro.y) / 2
  const rX = eyeW * 0.72, rY = eyeW * 0.62
  const frameW = eyeW * 0.12

  ctx.save()
  ctx.lineWidth = frameW
  ctx.strokeStyle = '#1a1a1a'

  ctx.fillStyle = 'rgba(80, 200, 255, 0.28)'
  ctx.beginPath(); ctx.ellipse(lCx, lCy, rX, rY, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(rCx, rCy, rX, rY, 0, 0, Math.PI * 2); ctx.fill()

  ctx.beginPath(); ctx.ellipse(lCx, lCy, rX, rY, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(rCx, rCy, rX, rY, 0, 0, Math.PI * 2); ctx.stroke()

  ctx.lineWidth = frameW * 0.7
  ctx.beginPath()
  ctx.moveTo(li.x + eyeW * 0.28, lCy)
  ctx.lineTo(ri.x - eyeW * 0.28, rCy)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(lo.x - eyeW * 0.28, lCy)
  ctx.lineTo(lo.x - eyeW * 1.1, lCy - eyeW * 0.15)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ro.x + eyeW * 0.28, rCy)
  ctx.lineTo(ro.x + eyeW * 1.1, rCy - eyeW * 0.15)
  ctx.stroke()

  ctx.lineWidth = frameW * 0.3
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath(); ctx.arc(lCx - rX * 0.3, lCy - rY * 0.3, rX * 0.2, 0.2, 1.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(rCx - rX * 0.3, rCy - rY * 0.3, rX * 0.2, 0.2, 1.2); ctx.stroke()

  ctx.restore()
}

// ─────────────────────────────────────────
// BUNNY EARS
function drawBunnyEars(ctx, w, h, landmarks) {
  const lo  = lm(landmarks, 33, w, h)
  const ro  = lm(landmarks, 263, w, h)
  const top = lm(landmarks, 10, w, h)

  const faceW = dist(lo, ro)
  const midX  = (lo.x + ro.x) / 2
  const earH  = faceW * 2.0
  const earW  = faceW * 0.28

  ctx.save()

  function drawEar(cx, tilt) {
    const tipX = cx + tilt * faceW * 0.18
    const tipY = top.y - earH
    const baseY = top.y - faceW * 0.05

    ctx.beginPath()
    ctx.moveTo(cx - earW / 2, baseY)
    ctx.bezierCurveTo(cx - earW * 1.1 + tilt * 10, baseY - earH * 0.4, tipX - earW * 0.5, tipY + earH * 0.15, tipX, tipY)
    ctx.bezierCurveTo(tipX + earW * 0.5, tipY + earH * 0.15, cx + earW * 1.1 + tilt * 10, baseY - earH * 0.4, cx + earW / 2, baseY)
    ctx.closePath()
    ctx.fillStyle = '#f9c9d4'
    ctx.fill()
    ctx.strokeStyle = '#d4a0b0'
    ctx.lineWidth = 3
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(cx - earW * 0.22, baseY - earH * 0.08)
    ctx.bezierCurveTo(cx - earW * 0.45 + tilt * 6, baseY - earH * 0.45, tipX - earW * 0.2, tipY + earH * 0.18, tipX, tipY + earH * 0.08)
    ctx.bezierCurveTo(tipX + earW * 0.2, tipY + earH * 0.18, cx + earW * 0.45 + tilt * 6, baseY - earH * 0.45, cx + earW * 0.22, baseY - earH * 0.08)
    ctx.fillStyle = '#f472b6'
    ctx.fill()
  }

  drawEar(midX - faceW * 0.3, -1)
  drawEar(midX + faceW * 0.3,  1)
  ctx.restore()
}

// ─────────────────────────────────────────
// HAT
function drawHat(ctx, w, h, landmarks) {
  const lo  = lm(landmarks, 33, w, h)
  const ro  = lm(landmarks, 263, w, h)
  const top = lm(landmarks, 10, w, h)

  const faceW  = dist(lo, ro)
  const cx     = (lo.x + ro.x) / 2
  const baseY  = top.y - faceW * 0.04
  const crownW = faceW * 1.05
  const crownH = faceW * 1.4
  const brimW  = faceW * 2.0
  const brimH  = faceW * 0.16

  ctx.save()

  ctx.fillStyle = '#111'
  ctx.fillRect(cx - crownW / 2 + 6, baseY - crownH + 6, crownW, crownH)

  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(cx - crownW / 2, baseY - crownH, crownW, crownH)

  ctx.fillStyle = '#c0392b'
  ctx.fillRect(cx - crownW / 2, baseY - brimH * 2, crownW, brimH * 0.9)

  const buckleW = faceW * 0.18, buckleH = brimH * 0.8
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 3
  ctx.strokeRect(cx - buckleW / 2, baseY - brimH * 1.95, buckleW, buckleH * 0.9)
  ctx.strokeRect(cx - buckleW * 0.3, baseY - brimH * 1.88, buckleW * 0.6, buckleH * 0.55)

  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.ellipse(cx, baseY, brimW / 2, brimH / 2, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ─────────────────────────────────────────
// BIG NOSE
function drawBigNose(ctx, w, h, landmarks) {
  const tip   = lm(landmarks, 1, w, h)
  const lNose = lm(landmarks, 129, w, h)
  const rNose = lm(landmarks, 358, w, h)

  const noseW = dist(lNose, rNose)
  const sw = noseW * 3.0
  const sh = noseW * 2.7

  ctx.save()

  ctx.beginPath()
  ctx.ellipse(tip.x + 4, tip.y + sh * 0.15 + 4, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fill()

  ctx.beginPath()
  ctx.ellipse(tip.x, tip.y + sh * 0.1, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(tip.x - sw * 0.15, tip.y - sh * 0.1, sw * 0.05, tip.x, tip.y, sw * 0.6)
  g.addColorStop(0, '#f4a57c')
  g.addColorStop(1, '#c06035')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = '#9a4020'
  ctx.lineWidth = 3
  ctx.stroke()

  const nr = sw * 0.14
  ctx.fillStyle = '#5c2010'
  ctx.beginPath(); ctx.ellipse(tip.x - sw * 0.24, tip.y + sh * 0.2, nr, nr * 0.72, -0.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(tip.x + sw * 0.24, tip.y + sh * 0.2, nr, nr * 0.72, 0.4, 0, Math.PI * 2); ctx.fill()

  ctx.beginPath()
  ctx.ellipse(tip.x - sw * 0.18, tip.y - sh * 0.1, sw * 0.09, sw * 0.07, -0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fill()

  ctx.restore()
}

// ─────────────────────────────────────────
// TINY MOUTH
function drawTinyMouth(ctx, w, h, landmarks) {
  const lc = lm(landmarks, 61, w, h)
  const rc = lm(landmarks, 291, w, h)
  const ul = lm(landmarks, 13, w, h)
  const ll = lm(landmarks, 14, w, h)

  const mouthW = dist(lc, rc)
  const mouthH = dist(ul, ll)
  const cx = (lc.x + rc.x) / 2
  const cy = (ul.y + ll.y) / 2

  ctx.save()

  ctx.beginPath()
  ctx.ellipse(cx, cy, mouthW * 0.65, mouthH + 8, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#dea882'
  ctx.fill()

  const tW = mouthW * 0.28, tH = Math.max(mouthH * 0.3, 5)
  ctx.beginPath()
  ctx.ellipse(cx, cy, tW, tH, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#7a2828'
  ctx.fill()
  ctx.strokeStyle = '#4a1010'
  ctx.lineWidth = 1.5
  ctx.stroke()

  ctx.restore()
}
