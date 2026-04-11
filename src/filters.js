// Coordinate helpers
// Landmarks are in [0,1] normalized original-video space.
// The canvas has the video drawn MIRRORED, so mirrored canvas x = w - landmark.x * w

function px(landmark, w, h) {
  return { x: landmark.x * w, y: landmark.y * h }
}

function lm(landmarks, i, w, h) {
  return px(landmarks[i], w, h)
}

// Mirrored x position on canvas for a landmark in original space
function mx(landmark, w) {
  return w - landmark.x * w
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// Reusable offscreen canvas for pixel snapshots (avoids allocation every frame)
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

// Zoom a circular region of src canvas, draw it enlarged with a soft feathered edge.
// cx, cy: center on canvas (already in mirrored canvas space)
// srcR: radius to sample from, dstR: radius to draw at
function zoomRegion(ctx, src, cx, cy, srcR, dstR) {
  const tmp = document.createElement('canvas')
  const d = dstR * 2
  tmp.width = d
  tmp.height = d
  const tCtx = tmp.getContext('2d')

  // Draw zoomed pixels
  tCtx.drawImage(src, cx - srcR, cy - srcR, srcR * 2, srcR * 2, 0, 0, d, d)

  // Soft circular mask — feathers the edge so it blends into the original face
  tCtx.globalCompositeOperation = 'destination-in'
  const grad = tCtx.createRadialGradient(dstR, dstR, dstR * 0.45, dstR, dstR, dstR)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.75, 'rgba(255,255,255,0.95)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  tCtx.fillStyle = grad
  tCtx.fillRect(0, 0, d, d)

  ctx.drawImage(tmp, cx - dstR, cy - dstR)
}

// Draw overlay filters in a mirrored context so landmark coords map directly
// (landmark.x * w in original space → appears at correct mirrored position on canvas)
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
    default: break
  }
}

// ─────────────────────────────────────────
// BIG EYES — pixel warp: zooms the actual video pixels around each eye
function drawBigEyesWarp(ctx, w, h, landmarks) {
  const src = snapshot(ctx.canvas)

  const eyes = [
    { outer: 33, inner: 133 },  // left eye
    { outer: 263, inner: 362 }, // right eye
  ]

  for (const { outer, inner } of eyes) {
    const o = landmarks[outer]
    const inn = landmarks[inner]
    const eyeW = dist({ x: o.x * w, y: o.y * h }, { x: inn.x * w, y: inn.y * h })

    // Center in mirrored canvas space
    const cx = w - ((o.x + inn.x) / 2) * w
    const cy = ((o.y + inn.y) / 2) * h

    const srcR = eyeW * 1.1   // sample radius
    const dstR = eyeW * 2.4   // draw radius — bigger = more bulge
    zoomRegion(ctx, src, cx, cy, srcR, dstR)
  }
}

// BIG MOUTH — pixel warp: zooms the mouth region
function drawBigMouthWarp(ctx, w, h, landmarks) {
  const src = snapshot(ctx.canvas)

  const leftCorner  = landmarks[61]
  const rightCorner = landmarks[291]
  const upperLip    = landmarks[13]
  const lowerLip    = landmarks[14]

  const mouthW = dist(
    { x: leftCorner.x * w, y: leftCorner.y * h },
    { x: rightCorner.x * w, y: rightCorner.y * h }
  )

  const cx = w - ((leftCorner.x + rightCorner.x) / 2) * w
  const cy = ((upperLip.y + lowerLip.y) / 2) * h

  const srcR = mouthW * 0.75
  const dstR = mouthW * 1.6
  zoomRegion(ctx, src, cx, cy, srcR, dstR)
}

// ─────────────────────────────────────────
// GLASSES — big, bold frames
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

  // Lens fill (tinted)
  ctx.fillStyle = 'rgba(80, 200, 255, 0.28)'
  ctx.beginPath(); ctx.ellipse(lCx, lCy, rX, rY, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(rCx, rCy, rX, rY, 0, 0, Math.PI * 2); ctx.fill()

  // Frames
  ctx.beginPath(); ctx.ellipse(lCx, lCy, rX, rY, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(rCx, rCy, rX, rY, 0, 0, Math.PI * 2); ctx.stroke()

  // Bridge
  ctx.lineWidth = frameW * 0.7
  ctx.beginPath()
  ctx.moveTo(li.x + eyeW * 0.28, lCy)
  ctx.lineTo(ri.x - eyeW * 0.28, rCy)
  ctx.stroke()

  // Arms
  ctx.beginPath()
  ctx.moveTo(lo.x - eyeW * 0.28, lCy)
  ctx.lineTo(lo.x - eyeW * 1.1, lCy - eyeW * 0.15)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(ro.x + eyeW * 0.28, rCy)
  ctx.lineTo(ro.x + eyeW * 1.1, rCy - eyeW * 0.15)
  ctx.stroke()

  // Shine on lenses
  ctx.lineWidth = frameW * 0.3
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath()
  ctx.arc(lCx - rX * 0.3, lCy - rY * 0.3, rX * 0.2, 0.2, 1.2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(rCx - rX * 0.3, rCy - rY * 0.3, rX * 0.2, 0.2, 1.2)
  ctx.stroke()

  ctx.restore()
}

// ─────────────────────────────────────────
// BUNNY EARS — tall, fluffy, expressive
function drawBunnyEars(ctx, w, h, landmarks) {
  const lo = lm(landmarks, 33, w, h)
  const ro = lm(landmarks, 263, w, h)
  const top = lm(landmarks, 10, w, h)

  const faceW = dist(lo, ro)
  const midX = (lo.x + ro.x) / 2
  const earH = faceW * 2.0
  const earW = faceW * 0.28

  ctx.save()

  function drawEar(cx, tilt) {
    const tipX = cx + tilt * faceW * 0.18
    const tipY = top.y - earH
    const baseY = top.y - faceW * 0.05

    // Outer ear (white/pink gradient)
    ctx.beginPath()
    ctx.moveTo(cx - earW / 2, baseY)
    ctx.bezierCurveTo(
      cx - earW * 1.1 + tilt * 10, baseY - earH * 0.4,
      tipX - earW * 0.5, tipY + earH * 0.15,
      tipX, tipY
    )
    ctx.bezierCurveTo(
      tipX + earW * 0.5, tipY + earH * 0.15,
      cx + earW * 1.1 + tilt * 10, baseY - earH * 0.4,
      cx + earW / 2, baseY
    )
    ctx.closePath()
    ctx.fillStyle = '#f9c9d4'
    ctx.fill()
    ctx.strokeStyle = '#d4a0b0'
    ctx.lineWidth = 3
    ctx.stroke()

    // Inner pink
    ctx.beginPath()
    ctx.moveTo(cx - earW * 0.22, baseY - earH * 0.08)
    ctx.bezierCurveTo(
      cx - earW * 0.45 + tilt * 6, baseY - earH * 0.45,
      tipX - earW * 0.2, tipY + earH * 0.18,
      tipX, tipY + earH * 0.08
    )
    ctx.bezierCurveTo(
      tipX + earW * 0.2, tipY + earH * 0.18,
      cx + earW * 0.45 + tilt * 6, baseY - earH * 0.45,
      cx + earW * 0.22, baseY - earH * 0.08
    )
    ctx.fillStyle = '#f472b6'
    ctx.fill()
  }

  drawEar(midX - faceW * 0.3, -1)
  drawEar(midX + faceW * 0.3, 1)
  ctx.restore()
}

// ─────────────────────────────────────────
// HAT — tall top hat
function drawHat(ctx, w, h, landmarks) {
  const lo = lm(landmarks, 33, w, h)
  const ro = lm(landmarks, 263, w, h)
  const top = lm(landmarks, 10, w, h)

  const faceW = dist(lo, ro)
  const cx = (lo.x + ro.x) / 2
  const baseY = top.y - faceW * 0.04

  const crownW = faceW * 1.05
  const crownH = faceW * 1.4
  const brimW  = faceW * 2.0
  const brimH  = faceW * 0.16

  ctx.save()

  // Crown shadow
  ctx.fillStyle = '#111'
  ctx.fillRect(cx - crownW / 2 + 6, baseY - crownH + 6, crownW, crownH)

  // Crown
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(cx - crownW / 2, baseY - crownH, crownW, crownH)

  // Red band
  ctx.fillStyle = '#c0392b'
  ctx.fillRect(cx - crownW / 2, baseY - brimH * 2, crownW, brimH * 0.9)

  // Gold buckle on band
  const buckleW = faceW * 0.18, buckleH = brimH * 0.8
  ctx.strokeStyle = '#f59e0b'
  ctx.lineWidth = 3
  ctx.strokeRect(cx - buckleW / 2, baseY - brimH * 1.95, buckleW, buckleH * 0.9)
  ctx.strokeRect(cx - buckleW * 0.3, baseY - brimH * 1.88, buckleW * 0.6, buckleH * 0.55)

  // Brim
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.ellipse(cx, baseY, brimW / 2, brimH / 2, 0, 0, Math.PI * 2)
  ctx.fill()

  // Brim highlight
  ctx.strokeStyle = '#333'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.ellipse(cx, baseY - brimH * 0.1, brimW / 2 - 4, brimH * 0.3, 0, 0, Math.PI)
  ctx.stroke()

  ctx.restore()
}

// ─────────────────────────────────────────
// BIG NOSE — chunky cartoon nose
function drawBigNose(ctx, w, h, landmarks) {
  const tip   = lm(landmarks, 1, w, h)
  const lNose = lm(landmarks, 129, w, h)
  const rNose = lm(landmarks, 358, w, h)

  const noseW = dist(lNose, rNose)
  const scale = 3.0
  const sw = noseW * scale
  const sh = noseW * scale * 0.9

  ctx.save()

  // Shadow
  ctx.beginPath()
  ctx.ellipse(tip.x + 4, tip.y + sh * 0.15 + 4, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.fill()

  // Main nose
  ctx.beginPath()
  ctx.ellipse(tip.x, tip.y + sh * 0.1, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  const noseGrad = ctx.createRadialGradient(tip.x - sw * 0.15, tip.y - sh * 0.1, sw * 0.05, tip.x, tip.y, sw * 0.6)
  noseGrad.addColorStop(0, '#f4a57c')
  noseGrad.addColorStop(1, '#c06035')
  ctx.fillStyle = noseGrad
  ctx.fill()
  ctx.strokeStyle = '#9a4020'
  ctx.lineWidth = 3
  ctx.stroke()

  // Nostrils
  const nr = sw * 0.14
  ctx.fillStyle = '#5c2010'
  ctx.beginPath()
  ctx.ellipse(tip.x - sw * 0.24, tip.y + sh * 0.2, nr, nr * 0.72, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(tip.x + sw * 0.24, tip.y + sh * 0.2, nr, nr * 0.72, 0.4, 0, Math.PI * 2)
  ctx.fill()

  // Highlight
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

  // Cover original mouth with skin tone
  ctx.beginPath()
  ctx.ellipse(cx, cy, mouthW * 0.65, mouthH + 8, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#dea882'
  ctx.fill()

  // Tiny mouth
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
