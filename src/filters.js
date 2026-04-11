// MediaPipe FaceLandmarker landmark indices (468 points)
// Key landmarks:
//   Left eye center: 468, Right eye center: 473 (iris, if enabled)
//   Left eye outer: 33, Right eye outer: 263
//   Left eye inner: 133, Right eye inner: 362
//   Nose tip: 1, Nose bottom: 2
//   Top of head (approx): 10
//   Mouth corners: 61 (left), 291 (right)
//   Upper lip center: 13, Lower lip center: 14
//   Chin: 152
//   Left cheek: 234, Right cheek: 454

function lm(landmarks, index, w, h) {
  const p = landmarks[index]
  return { x: p.x * w, y: p.y * h }
}

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function drawFilter(ctx, w, h, landmarks, filter) {
  switch (filter) {
    case 'glasses': drawGlasses(ctx, w, h, landmarks); break
    case 'bunny':   drawBunnyEars(ctx, w, h, landmarks); break
    case 'hat':     drawHat(ctx, w, h, landmarks); break
    case 'big-nose':  drawBigNose(ctx, w, h, landmarks); break
    case 'big-eyes':  drawBigEyes(ctx, w, h, landmarks); break
    case 'tiny-mouth': drawTinyMouth(ctx, w, h, landmarks); break
    default: break
  }
}

// ---- GLASSES ----
function drawGlasses(ctx, w, h, landmarks) {
  const leftOuter  = lm(landmarks, 33, w, h)
  const leftInner  = lm(landmarks, 133, w, h)
  const rightInner = lm(landmarks, 362, w, h)
  const rightOuter = lm(landmarks, 263, w, h)
  const noseBridge = lm(landmarks, 6, w, h)

  const eyeW = dist(leftOuter, leftInner)
  const pad = eyeW * 0.3

  ctx.save()
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = eyeW * 0.08

  // Left lens
  const lCx = (leftOuter.x + leftInner.x) / 2
  const lCy = (leftOuter.y + leftInner.y) / 2
  ctx.beginPath()
  ctx.ellipse(lCx, lCy, eyeW / 2 + pad, eyeW * 0.6, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(100,180,255,0.2)'
  ctx.fill()
  ctx.stroke()

  // Right lens
  const rCx = (rightOuter.x + rightInner.x) / 2
  const rCy = (rightOuter.y + rightInner.y) / 2
  ctx.beginPath()
  ctx.ellipse(rCx, rCy, eyeW / 2 + pad, eyeW * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Bridge
  ctx.beginPath()
  ctx.moveTo(leftInner.x + pad, lCy)
  ctx.lineTo(rightInner.x - pad, rCy)
  ctx.stroke()

  // Arms
  ctx.beginPath()
  ctx.moveTo(leftOuter.x - pad, lCy)
  ctx.lineTo(leftOuter.x - eyeW, lCy - eyeW * 0.1)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(rightOuter.x + pad, rCy)
  ctx.lineTo(rightOuter.x + eyeW, rCy - eyeW * 0.1)
  ctx.stroke()

  ctx.restore()
}

// ---- BUNNY EARS ----
function drawBunnyEars(ctx, w, h, landmarks) {
  const leftEye  = lm(landmarks, 33, w, h)
  const rightEye = lm(landmarks, 263, w, h)
  const top      = lm(landmarks, 10, w, h)

  const faceW = dist(leftEye, rightEye)
  const earH  = faceW * 1.5
  const earW  = faceW * 0.22

  ctx.save()

  function drawEar(cx, tiltDir) {
    const tipX = cx + tiltDir * faceW * 0.12
    const tipY = top.y - earH
    ctx.beginPath()
    ctx.moveTo(cx - earW / 2, top.y - faceW * 0.1)
    ctx.quadraticCurveTo(cx - earW * 0.8 + tiltDir * 5, tipY + earH * 0.3, tipX - earW * 0.3, tipY)
    ctx.quadraticCurveTo(tipX, tipY - earH * 0.05, tipX + earW * 0.3, tipY)
    ctx.quadraticCurveTo(cx + earW * 0.8 + tiltDir * 5, tipY + earH * 0.3, cx + earW / 2, top.y - faceW * 0.1)
    ctx.closePath()
    ctx.fillStyle = '#f9c9d4'
    ctx.fill()
    ctx.strokeStyle = '#e8a0b0'
    ctx.lineWidth = 2
    ctx.stroke()

    // Inner pink
    ctx.beginPath()
    ctx.moveTo(cx - earW * 0.2, top.y - faceW * 0.15)
    ctx.quadraticCurveTo(cx - earW * 0.3 + tiltDir * 3, tipY + earH * 0.4, tipX, tipY + earH * 0.1)
    ctx.quadraticCurveTo(cx + earW * 0.3 + tiltDir * 3, tipY + earH * 0.4, cx + earW * 0.2, top.y - faceW * 0.15)
    ctx.fillStyle = '#f472b6'
    ctx.fill()
  }

  const midX = (leftEye.x + rightEye.x) / 2
  drawEar(midX - faceW * 0.28, -1)
  drawEar(midX + faceW * 0.28,  1)

  ctx.restore()
}

// ---- HAT ----
function drawHat(ctx, w, h, landmarks) {
  const leftEye  = lm(landmarks, 33, w, h)
  const rightEye = lm(landmarks, 263, w, h)
  const top      = lm(landmarks, 10, w, h)

  const faceW = dist(leftEye, rightEye)
  const cx = (leftEye.x + rightEye.x) / 2
  const brimW = faceW * 1.8
  const brimH = faceW * 0.12
  const crownW = faceW * 1.0
  const crownH = faceW * 1.1
  const baseY = top.y - faceW * 0.05

  ctx.save()
  ctx.fillStyle = '#1a1a1a'

  // Crown
  ctx.fillRect(cx - crownW / 2, baseY - crownH, crownW, crownH)

  // Band
  ctx.fillStyle = '#c0392b'
  ctx.fillRect(cx - crownW / 2, baseY - brimH * 1.5, crownW, brimH * 0.7)

  // Brim
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath()
  ctx.ellipse(cx, baseY, brimW / 2, brimH, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ---- BIG NOSE ----
function drawBigNose(ctx, w, h, landmarks) {
  const noseTip    = lm(landmarks, 1, w, h)
  const noseBottom = lm(landmarks, 2, w, h)
  const leftNose   = lm(landmarks, 129, w, h)
  const rightNose  = lm(landmarks, 358, w, h)

  const noseW = dist(leftNose, rightNose)
  const scale = 2.2
  const sw = noseW * scale
  const sh = noseW * scale * 1.1

  ctx.save()
  ctx.beginPath()
  ctx.ellipse(noseTip.x, noseTip.y + sh * 0.1, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#e8956d'
  ctx.fill()
  ctx.strokeStyle = '#c0724a'
  ctx.lineWidth = 2
  ctx.stroke()

  // Nostrils
  const nostrilR = sw * 0.13
  ctx.fillStyle = '#7a3b1e'
  ctx.beginPath()
  ctx.ellipse(noseTip.x - sw * 0.22, noseTip.y + sh * 0.22, nostrilR, nostrilR * 0.7, -0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(noseTip.x + sw * 0.22, noseTip.y + sh * 0.22, nostrilR, nostrilR * 0.7, 0.3, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

// ---- BIG EYES ----
function drawBigEyes(ctx, w, h, landmarks) {
  const leftOuter  = lm(landmarks, 33, w, h)
  const leftInner  = lm(landmarks, 133, w, h)
  const rightInner = lm(landmarks, 362, w, h)
  const rightOuter = lm(landmarks, 263, w, h)

  const eyeW = dist(leftOuter, leftInner)
  const scale = 1.8
  const r = (eyeW / 2) * scale

  function drawEye(cx, cy) {
    // White
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, r * 0.85, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 2
    ctx.stroke()

    // Iris
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 0.55, r * 0.55, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#3b82f6'
    ctx.fill()

    // Pupil
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * 0.28, r * 0.28, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#000'
    ctx.fill()

    // Shine
    ctx.beginPath()
    ctx.ellipse(cx - r * 0.15, cy - r * 0.18, r * 0.1, r * 0.1, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fill()
  }

  const lCx = (leftOuter.x + leftInner.x) / 2
  const lCy = (leftOuter.y + leftInner.y) / 2
  const rCx = (rightOuter.x + rightInner.x) / 2
  const rCy = (rightOuter.y + rightInner.y) / 2

  ctx.save()
  drawEye(lCx, lCy)
  drawEye(rCx, rCy)
  ctx.restore()
}

// ---- TINY MOUTH ----
function drawTinyMouth(ctx, w, h, landmarks) {
  const leftCorner  = lm(landmarks, 61, w, h)
  const rightCorner = lm(landmarks, 291, w, h)
  const upperLip    = lm(landmarks, 13, w, h)
  const lowerLip    = lm(landmarks, 14, w, h)

  const mouthW = dist(leftCorner, rightCorner)
  const mouthH = dist(upperLip, lowerLip)
  const cx = (leftCorner.x + rightCorner.x) / 2
  const cy = (upperLip.y + lowerLip.y) / 2

  const scale = 0.35
  const tinyW = mouthW * scale
  const tinyH = Math.max(mouthH * scale, 4)

  ctx.save()

  // Cover original mouth with skin tone
  ctx.beginPath()
  ctx.ellipse(cx, cy, mouthW * 0.6, mouthH * 0.8 + 4, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#e8b89a'
  ctx.fill()

  // Draw tiny mouth
  ctx.beginPath()
  ctx.ellipse(cx, cy, tinyW, tinyH, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#8b3a3a'
  ctx.fill()
  ctx.strokeStyle = '#5c2020'
  ctx.lineWidth = 1
  ctx.stroke()

  ctx.restore()
}
