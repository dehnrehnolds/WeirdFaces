// ── Landmark contour index groups ────────────────────────────────────────────
const LEFT_EYE_CONTOUR  = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
const MOUTH_CONTOUR     = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
const FACE_OVAL         = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
                           400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

// Left jaw downward to chin, right jaw from chin upward
const LEFT_JAW  = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152]
const RIGHT_JAW = [152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454]

// Forehead arc from left temple (234) across top of head to right temple (454).
// In the original video these go left→right; in the mirrored canvas they go right→left.
const FOREHEAD_ARC = [234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454]

// ── Coordinate helpers ────────────────────────────────────────────────────────
function lm(landmarks, i, w, h) {
  return { x: landmarks[i].x * w, y: landmarks[i].y * h }
}
function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// ── Face center + radius from face oval (in mirrored canvas space) ────────────
function getFaceCenter(landmarks, w, h) {
  let sumOrigX = 0, sumY = 0
  for (const idx of FACE_OVAL) { sumOrigX += landmarks[idx].x; sumY += landmarks[idx].y }
  const n   = FACE_OVAL.length
  const cx  = w - (sumOrigX / n) * w   // mirrored canvas x
  const cy  = (sumY / n) * h
  let avgR  = 0
  for (const idx of FACE_OVAL) {
    avgR += Math.hypot((w - landmarks[idx].x * w) - cx, landmarks[idx].y * h - cy)
  }
  return { cx, cy, r: avgR / n }
}

// ── Offscreen snapshot (reused each frame) ────────────────────────────────────
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

// ── Zoom with feature-shaped mask (for eyes, mouth, face oval) ───────────────
// cx/cy are in mirrored canvas space; landmarks are in original video space.
function zoomWithShapedMask(ctx, src, w, h, landmarks, contourIndices, cx, cy, srcR, dstR, expand = 1.25) {
  const d     = dstR * 2
  const scale = dstR / srcR
  const tmp   = document.createElement('canvas')
  tmp.width = tmp.height = d
  const tCtx  = tmp.getContext('2d')

  tCtx.drawImage(src, cx - srcR, cy - srcR, srcR * 2, srcR * 2, 0, 0, d, d)

  tCtx.globalCompositeOperation = 'destination-in'
  tCtx.filter = `blur(${Math.round(dstR * 0.07)}px)`
  tCtx.beginPath()
  contourIndices.forEach((idx, i) => {
    const tx = ((w - landmarks[idx].x * w) - cx + srcR) * scale
    const ty = (landmarks[idx].y * h      - cy + srcR) * scale
    const ex = dstR + (tx - dstR) * expand
    const ey = dstR + (ty - dstR) * expand
    i === 0 ? tCtx.moveTo(ex, ey) : tCtx.lineTo(ex, ey)
  })
  tCtx.closePath()
  tCtx.fillStyle = 'white'
  tCtx.fill()

  ctx.drawImage(tmp, cx - dstR, cy - dstR)
}

// ── Zoom with circular mask (for balloon head) ────────────────────────────────
function zoomWithCircleMask(ctx, src, cx, cy, srcR, dstR) {
  const d   = dstR * 2
  const tmp = document.createElement('canvas')
  tmp.width = tmp.height = d
  const tCtx = tmp.getContext('2d')

  tCtx.drawImage(src, cx - srcR, cy - srcR, srcR * 2, srcR * 2, 0, 0, d, d)

  tCtx.globalCompositeOperation = 'destination-in'
  tCtx.filter = `blur(${Math.round(dstR * 0.03)}px)`
  tCtx.beginPath()
  tCtx.arc(dstR, dstR, dstR * 0.97, 0, Math.PI * 2)
  tCtx.fillStyle = 'white'
  tCtx.fill()

  ctx.drawImage(tmp, cx - dstR, cy - dstR)
}

// ── Draw in mirrored ctx so landmark coords map to correct display position ───
function withMirror(ctx, w, fn) {
  ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); fn(); ctx.restore()
}

// ═════════════════════════════════════════════════════════════════════════════
// ── FACE SWAP ─────────────────────────────────────────────────────────────────
// Operates on all detected faces at once — call separately, not inside the
// per-face loop. allFaces must have length >= 2.
export function drawFaceSwap(ctx, w, h, allFaces) {
  if (allFaces.length < 2) return

  const src = snapshot(ctx.canvas)

  // Extract face from src, masked to its oval, draw it at the other face's position
  function swapFaceOnto(srcLandmarks, srcC, dstC) {
    const pad  = 1.3                          // padding ratio around face radius
    const srcD = Math.round(srcC.r * 2 * pad)
    const dstD = Math.round(dstC.r * 2 * pad)

    const tmp  = document.createElement('canvas')
    tmp.width  = tmp.height = srcD
    const tCtx = tmp.getContext('2d')

    // Copy the source face region from the snapshot
    tCtx.drawImage(
      src,
      srcC.cx - srcC.r * pad, srcC.cy - srcC.r * pad, srcD, srcD,
      0, 0, srcD, srcD
    )

    // Feathered oval mask — convert landmarks to temp-canvas space then expand slightly
    tCtx.globalCompositeOperation = 'destination-in'
    tCtx.filter = `blur(${Math.round(srcC.r * 0.06)}px)`
    tCtx.beginPath()
    FACE_OVAL.forEach((idx, i) => {
      const px = (w - srcLandmarks[idx].x * w) - srcC.cx + srcC.r * pad
      const py = srcLandmarks[idx].y * h      - srcC.cy + srcC.r * pad
      // Expand 8 % outward from centre for better hairline coverage
      const ex = srcD / 2 + (px - srcD / 2) * 1.08
      const ey = srcD / 2 + (py - srcD / 2) * 1.08
      i === 0 ? tCtx.moveTo(ex, ey) : tCtx.lineTo(ex, ey)
    })
    tCtx.closePath()
    tCtx.fillStyle = 'white'
    tCtx.fill()

    // Composite onto destination position, scaled to match destination face size
    ctx.drawImage(
      tmp,
      0, 0, srcD, srcD,
      dstC.cx - dstC.r * pad, dstC.cy - dstC.r * pad, dstD, dstD
    )
  }

  const c1 = getFaceCenter(allFaces[0], w, h)
  const c2 = getFaceCenter(allFaces[1], w, h)

  swapFaceOnto(allFaces[0], c1, c2)
  swapFaceOnto(allFaces[1], c2, c1)
}

// ═════════════════════════════════════════════════════════════════════════════
// ── Reusable offscreen canvas for hair color (avoid allocation every frame) ───
let _hair = null
function hairCanvas(w, h) {
  if (!_hair || _hair.width !== w || _hair.height !== h) {
    _hair = document.createElement('canvas')
    _hair.width = w; _hair.height = h
  }
  return _hair
}

// ── HAIR COLOR ────────────────────────────────────────────────────────────────
// Paints the hair region (above forehead arc, minus face oval) with chosen HSL
// color using the 'color' blend mode — changes hue/sat while preserving luminosity.
function drawHairColor(ctx, w, h, landmarks, hslColor) {
  const { h: hue, s, l } = hslColor
  const colorStr = `hsl(${Math.round(hue)},${Math.round(s * 100)}%,${Math.round(l * 100)}%)`

  const tmp  = hairCanvas(w, h)
  const tCtx = tmp.getContext('2d')
  tCtx.clearRect(0, 0, w, h)

  const mirX = idx => w - landmarks[idx].x * w
  const mirY = idx => landmarks[idx].y * h

  // Single beginPath with two sub-paths; evenodd makes the face oval a hole.
  tCtx.beginPath()

  // Outer sub-path: rectangle from top of frame down to the forehead arc.
  // FOREHEAD_ARC in mirrored canvas space runs right→left (234=right, 454=left).
  // We traverse it reversed (454→234 = left→right) so the winding is correct.
  tCtx.moveTo(w, 0)                                          // top-right
  tCtx.lineTo(0, 0)                                          // top-left
  tCtx.lineTo(0, mirY(FOREHEAD_ARC[FOREHEAD_ARC.length - 1])) // left edge to 454 level
  ;[...FOREHEAD_ARC].reverse().forEach(idx => tCtx.lineTo(mirX(idx), mirY(idx)))
  tCtx.lineTo(w, mirY(FOREHEAD_ARC[0]))                      // right edge at 234 level
  tCtx.closePath()                                           // back to top-right

  // Inner sub-path: face oval (punched out by evenodd)
  FACE_OVAL.forEach((idx, i) => {
    i === 0 ? tCtx.moveTo(mirX(idx), mirY(idx)) : tCtx.lineTo(mirX(idx), mirY(idx))
  })
  tCtx.closePath()

  tCtx.fillStyle = colorStr
  tCtx.fill('evenodd')

  // Composite onto main canvas — blur softens the hairline edge
  ctx.save()
  ctx.filter = 'blur(5px)'
  ctx.globalCompositeOperation = 'color'
  ctx.globalAlpha = 0.82
  ctx.drawImage(tmp, 0, 0)
  ctx.filter = 'none'
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.restore()
}

// ═════════════════════════════════════════════════════════════════════════════
export function drawFilter(ctx, w, h, landmarks, filter, opts = {}) {
  switch (filter) {
    case 'glasses':      withMirror(ctx, w, () => drawGlasses(ctx, w, h, landmarks));   break
    case 'bunny':        withMirror(ctx, w, () => drawBunnyEars(ctx, w, h, landmarks)); break
    case 'hat':          withMirror(ctx, w, () => drawHat(ctx, w, h, landmarks));       break
    case 'big-nose':     withMirror(ctx, w, () => drawBigNose(ctx, w, h, landmarks));   break
    case 'tiny-mouth':   withMirror(ctx, w, () => drawTinyMouth(ctx, w, h, landmarks)); break
    case 'beard':        withMirror(ctx, w, () => drawBeard(ctx, w, h, landmarks));     break
    case 'hair-color':   drawHairColor(ctx, w, h, landmarks, opts.hairColor ?? { h: 30, s: 0.65, l: 0.30 }); break
    case 'big-eyes':     drawBigEyesWarp(ctx, w, h, landmarks);    break
    case 'big-mouth':    drawBigMouthWarp(ctx, w, h, landmarks);   break
    case 'big-head':     drawBigHeadWarp(ctx, w, h, landmarks);    break
    case 'balloon-head': drawBalloonHeadWarp(ctx, w, h, landmarks); break
    case 'wow-face': {
      const src = snapshot(ctx.canvas)
      drawBigEyesWarp(ctx, w, h, landmarks, src)
      drawBigMouthWarp(ctx, w, h, landmarks, src)
      break
    }
    default: break
  }
}

// ── BIG EYES ─────────────────────────────────────────────────────────────────
function drawBigEyesWarp(ctx, w, h, landmarks, src = null) {
  src = src ?? snapshot(ctx.canvas)
  const eyes = [
    { contour: LEFT_EYE_CONTOUR,  outer: 33,  inner: 133 },
    { contour: RIGHT_EYE_CONTOUR, outer: 263, inner: 362 },
  ]
  for (const { contour, outer, inner } of eyes) {
    const o = landmarks[outer], inn = landmarks[inner]
    const eyeW = dist({ x: o.x * w, y: o.y * h }, { x: inn.x * w, y: inn.y * h })
    const cx   = w - ((o.x + inn.x) / 2) * w
    const cy   = ((o.y + inn.y) / 2) * h
    zoomWithShapedMask(ctx, src, w, h, landmarks, contour, cx, cy, eyeW * 0.85, eyeW * 1.9, 1.3)
  }
}

// ── BIG MOUTH ────────────────────────────────────────────────────────────────
function drawBigMouthWarp(ctx, w, h, landmarks, src = null) {
  src = src ?? snapshot(ctx.canvas)
  const lc = landmarks[61], rc = landmarks[291]
  const ul = landmarks[13], ll = landmarks[14]
  const mouthW = dist({ x: lc.x * w, y: lc.y * h }, { x: rc.x * w, y: rc.y * h })
  const cx = w - ((lc.x + rc.x) / 2) * w
  const cy = ((ul.y + ll.y) / 2) * h
  zoomWithShapedMask(ctx, src, w, h, landmarks, MOUTH_CONTOUR, cx, cy, mouthW * 0.65, mouthW * 1.4, 1.35)
}

// ── BIG HEAD ─────────────────────────────────────────────────────────────────
function drawBigHeadWarp(ctx, w, h, landmarks) {
  const src = snapshot(ctx.canvas)
  const { cx, cy, r } = getFaceCenter(landmarks, w, h)
  zoomWithShapedMask(ctx, src, w, h, landmarks, FACE_OVAL, cx, cy, r * 1.05, r * 1.7, 1.08)
}

// ── BALLOON HEAD ─────────────────────────────────────────────────────────────
function drawBalloonHeadWarp(ctx, w, h, landmarks) {
  const src = snapshot(ctx.canvas)
  const { cx, cy, r } = getFaceCenter(landmarks, w, h)
  const dstR = r * 2.1

  zoomWithCircleMask(ctx, src, cx, cy, r * 1.0, dstR)

  // Balloon highlight (top-left shine)
  ctx.save()
  ctx.globalAlpha = 0.18
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.ellipse(cx - dstR * 0.28, cy - dstR * 0.32, dstR * 0.3, dstR * 0.2, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // String from bottom of balloon to below frame
  const chinX    = w - landmarks[152].x * w
  const stringTopY = cy + dstR
  const stringLen  = r * 1.4

  ctx.save()
  ctx.strokeStyle = '#999'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(chinX, stringTopY)
  ctx.bezierCurveTo(
    chinX + 18, stringTopY + stringLen * 0.3,
    chinX - 12, stringTopY + stringLen * 0.65,
    chinX + 6,  stringTopY + stringLen
  )
  ctx.stroke()

  // Knot
  ctx.beginPath()
  ctx.arc(chinX + 6, stringTopY + stringLen + 6, 5, 0, Math.PI * 2)
  ctx.fillStyle = '#777'
  ctx.fill()
  ctx.restore()
}

// ── BEARD ─────────────────────────────────────────────────────────────────────
function drawBeard(ctx, w, h, landmarks) {
  const mouthL = lm(landmarks, 61,  w, h)
  const mouthR = lm(landmarks, 291, w, h)
  const chin   = lm(landmarks, 152, w, h)
  const jawL   = lm(landmarks, 234, w, h)
  const jawR   = lm(landmarks, 454, w, h)
  const noseTip = lm(landmarks, 1,  w, h)
  const lipTop  = lm(landmarks, 0,  w, h)   // philtrum center (between nose & upper lip)

  const beardH = chin.y - mouthL.y

  ctx.save()

  // ── Main beard: jaw → chin → jaw, close across mouth-corner level ──
  ctx.beginPath()
  ctx.moveTo(lm(landmarks, LEFT_JAW[0], w, h).x, lm(landmarks, LEFT_JAW[0], w, h).y)
  for (let i = 1; i < LEFT_JAW.length; i++) {
    const p = lm(landmarks, LEFT_JAW[i], w, h)
    ctx.lineTo(p.x, p.y)
  }
  for (let i = 1; i < RIGHT_JAW.length; i++) {
    const p = lm(landmarks, RIGHT_JAW[i], w, h)
    ctx.lineTo(p.x, p.y)
  }
  // Close: right jaw top → right mouth corner → left mouth corner → left jaw top
  ctx.bezierCurveTo(
    jawR.x, jawR.y * 0.6 + mouthR.y * 0.4,
    mouthR.x + 8, mouthR.y + 4,
    mouthR.x, mouthR.y
  )
  ctx.lineTo(mouthL.x, mouthL.y)
  ctx.bezierCurveTo(
    mouthL.x - 8, mouthL.y + 4,
    jawL.x, jawL.y * 0.6 + mouthL.y * 0.4,
    jawL.x, jawL.y
  )
  ctx.closePath()

  const beardGrad = ctx.createLinearGradient(0, mouthL.y, 0, chin.y + beardH * 0.25)
  beardGrad.addColorStop(0,   'rgba(55, 28, 12, 0.75)')
  beardGrad.addColorStop(0.4, 'rgba(32, 14, 4, 0.92)')
  beardGrad.addColorStop(1,   'rgba(12, 4, 1, 0.97)')
  ctx.fillStyle = beardGrad
  ctx.fill()

  // ── Hair strokes for texture ──
  ctx.save()
  ctx.globalAlpha = 0.35
  const strokeColors = ['#5c3010', '#3d1a06', '#7a4520']
  const leftEdge  = jawL.x
  const rightEdge = jawR.x
  const topY      = mouthL.y
  const bottomY   = chin.y + beardH * 0.2

  for (let i = 0; i < 120; i++) {
    const sx = leftEdge + Math.random() * (rightEdge - leftEdge)
    const sy = topY + Math.random() * (bottomY - topY)
    const len = 6 + Math.random() * 10
    const angle = (Math.PI / 2) + (Math.random() - 0.5) * 0.6
    ctx.strokeStyle = strokeColors[Math.floor(Math.random() * strokeColors.length)]
    ctx.lineWidth = 0.8 + Math.random() * 0.7
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + Math.cos(angle) * len, sy + Math.sin(angle) * len)
    ctx.stroke()
  }
  ctx.restore()

  // ── Mustache ──
  ctx.beginPath()
  ctx.moveTo(mouthL.x, mouthL.y)
  ctx.bezierCurveTo(
    mouthL.x + (lipTop.x - mouthL.x) * 0.25, mouthL.y - beardH * 0.35,
    lipTop.x - 10, noseTip.y + (lipTop.y - noseTip.y) * 0.55,
    lipTop.x, noseTip.y + (lipTop.y - noseTip.y) * 0.62
  )
  ctx.bezierCurveTo(
    lipTop.x + 10, noseTip.y + (lipTop.y - noseTip.y) * 0.55,
    mouthR.x - (mouthR.x - lipTop.x) * 0.25, mouthR.y - beardH * 0.35,
    mouthR.x, mouthR.y
  )
  ctx.bezierCurveTo(
    mouthR.x - 4, mouthR.y + beardH * 0.12,
    lipTop.x + 6, lipTop.y + beardH * 0.08,
    lipTop.x, lipTop.y + beardH * 0.05
  )
  ctx.bezierCurveTo(
    lipTop.x - 6, lipTop.y + beardH * 0.08,
    mouthL.x + 4, mouthL.y + beardH * 0.12,
    mouthL.x, mouthL.y
  )
  ctx.fillStyle = 'rgba(28, 11, 2, 0.93)'
  ctx.fill()

  ctx.restore()
}

// ── GLASSES ───────────────────────────────────────────────────────────────────
function drawGlasses(ctx, w, h, landmarks) {
  const lo = lm(landmarks, 33, w, h),  li = lm(landmarks, 133, w, h)
  const ri = lm(landmarks, 362, w, h), ro = lm(landmarks, 263, w, h)
  const eyeW = dist(lo, li)
  const lCx = (lo.x + li.x) / 2, lCy = (lo.y + li.y) / 2
  const rCx = (ri.x + ro.x) / 2, rCy = (ri.y + ro.y) / 2
  const rX = eyeW * 0.72, rY = eyeW * 0.62, fw = eyeW * 0.12

  ctx.save()
  ctx.lineWidth = fw; ctx.strokeStyle = '#1a1a1a'
  ctx.fillStyle = 'rgba(80, 200, 255, 0.28)'
  ctx.beginPath(); ctx.ellipse(lCx, lCy, rX, rY, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(rCx, rCy, rX, rY, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(lCx, lCy, rX, rY, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.ellipse(rCx, rCy, rX, rY, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = fw * 0.7
  ctx.beginPath(); ctx.moveTo(li.x + eyeW * 0.28, lCy); ctx.lineTo(ri.x - eyeW * 0.28, rCy); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(lo.x - eyeW * 0.28, lCy); ctx.lineTo(lo.x - eyeW * 1.1, lCy - eyeW * 0.15); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ro.x + eyeW * 0.28, rCy); ctx.lineTo(ro.x + eyeW * 1.1, rCy - eyeW * 0.15); ctx.stroke()
  ctx.lineWidth = fw * 0.3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.beginPath(); ctx.arc(lCx - rX * 0.3, lCy - rY * 0.3, rX * 0.2, 0.2, 1.2); ctx.stroke()
  ctx.beginPath(); ctx.arc(rCx - rX * 0.3, rCy - rY * 0.3, rX * 0.2, 0.2, 1.2); ctx.stroke()
  ctx.restore()
}

// ── BUNNY EARS ────────────────────────────────────────────────────────────────
function drawBunnyEars(ctx, w, h, landmarks) {
  const lo  = lm(landmarks, 33,  w, h)
  const ro  = lm(landmarks, 263, w, h)
  const top = lm(landmarks, 10,  w, h)
  const faceW = dist(lo, ro)
  const midX  = (lo.x + ro.x) / 2

  ctx.save()
  function drawEar(cx, tilt) {
    const tipX = cx + tilt * faceW * 0.18
    const tipY = top.y - faceW * 2.0
    const baseY = top.y - faceW * 0.05
    ctx.beginPath()
    ctx.moveTo(cx - faceW * 0.14, baseY)
    ctx.bezierCurveTo(cx - faceW * 0.31 + tilt * 10, baseY - faceW * 0.8, tipX - faceW * 0.14, tipY + faceW * 0.3, tipX, tipY)
    ctx.bezierCurveTo(tipX + faceW * 0.14, tipY + faceW * 0.3, cx + faceW * 0.31 + tilt * 10, baseY - faceW * 0.8, cx + faceW * 0.14, baseY)
    ctx.closePath()
    ctx.fillStyle = '#f9c9d4'; ctx.fill()
    ctx.strokeStyle = '#d4a0b0'; ctx.lineWidth = 3; ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx - faceW * 0.055, baseY - faceW * 0.08)
    ctx.bezierCurveTo(cx - faceW * 0.12 + tilt * 6, baseY - faceW * 0.9, tipX - faceW * 0.05, tipY + faceW * 0.35, tipX, tipY + faceW * 0.08)
    ctx.bezierCurveTo(tipX + faceW * 0.05, tipY + faceW * 0.35, cx + faceW * 0.12 + tilt * 6, baseY - faceW * 0.9, cx + faceW * 0.055, baseY - faceW * 0.08)
    ctx.fillStyle = '#f472b6'; ctx.fill()
  }
  drawEar(midX - faceW * 0.3, -1)
  drawEar(midX + faceW * 0.3,  1)
  ctx.restore()
}

// ── HAT ───────────────────────────────────────────────────────────────────────
function drawHat(ctx, w, h, landmarks) {
  const lo  = lm(landmarks, 33,  w, h)
  const ro  = lm(landmarks, 263, w, h)
  const top = lm(landmarks, 10,  w, h)
  const faceW = dist(lo, ro)
  const cx    = (lo.x + ro.x) / 2
  const baseY = top.y - faceW * 0.04
  const crownW = faceW * 1.05, crownH = faceW * 1.4
  const brimW  = faceW * 2.0,  brimH  = faceW * 0.16

  ctx.save()
  ctx.fillStyle = '#111'; ctx.fillRect(cx - crownW / 2 + 6, baseY - crownH + 6, crownW, crownH)
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(cx - crownW / 2, baseY - crownH, crownW, crownH)
  ctx.fillStyle = '#c0392b'; ctx.fillRect(cx - crownW / 2, baseY - brimH * 2, crownW, brimH * 0.9)
  const bkW = faceW * 0.18, bkH = brimH * 0.8
  ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3
  ctx.strokeRect(cx - bkW / 2, baseY - brimH * 1.95, bkW, bkH * 0.9)
  ctx.strokeRect(cx - bkW * 0.3, baseY - brimH * 1.88, bkW * 0.6, bkH * 0.55)
  ctx.fillStyle = '#1a1a1a'
  ctx.beginPath(); ctx.ellipse(cx, baseY, brimW / 2, brimH / 2, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ── BIG NOSE ──────────────────────────────────────────────────────────────────
function drawBigNose(ctx, w, h, landmarks) {
  const tip   = lm(landmarks, 1,   w, h)
  const lNose = lm(landmarks, 129, w, h)
  const rNose = lm(landmarks, 358, w, h)
  const noseW = dist(lNose, rNose)
  const sw = noseW * 3.0, sh = noseW * 2.7

  ctx.save()
  ctx.beginPath(); ctx.ellipse(tip.x + 4, tip.y + sh * 0.15 + 4, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill()
  ctx.beginPath(); ctx.ellipse(tip.x, tip.y + sh * 0.1, sw / 2, sh / 2, 0, 0, Math.PI * 2)
  const g = ctx.createRadialGradient(tip.x - sw * 0.15, tip.y - sh * 0.1, sw * 0.05, tip.x, tip.y, sw * 0.6)
  g.addColorStop(0, '#f4a57c'); g.addColorStop(1, '#c06035')
  ctx.fillStyle = g; ctx.fill()
  ctx.strokeStyle = '#9a4020'; ctx.lineWidth = 3; ctx.stroke()
  const nr = sw * 0.14
  ctx.fillStyle = '#5c2010'
  ctx.beginPath(); ctx.ellipse(tip.x - sw * 0.24, tip.y + sh * 0.2, nr, nr * 0.72, -0.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(tip.x + sw * 0.24, tip.y + sh * 0.2, nr, nr * 0.72,  0.4, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(tip.x - sw * 0.18, tip.y - sh * 0.1, sw * 0.09, sw * 0.07, -0.5, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill()
  ctx.restore()
}

// ── TINY MOUTH ────────────────────────────────────────────────────────────────
function drawTinyMouth(ctx, w, h, landmarks) {
  const lc = lm(landmarks, 61,  w, h), rc = lm(landmarks, 291, w, h)
  const ul = lm(landmarks, 13,  w, h), ll = lm(landmarks, 14,  w, h)
  const mouthW = dist(lc, rc), mouthH = dist(ul, ll)
  const cx = (lc.x + rc.x) / 2, cy = (ul.y + ll.y) / 2

  ctx.save()
  ctx.beginPath(); ctx.ellipse(cx, cy, mouthW * 0.65, mouthH + 8, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#dea882'; ctx.fill()
  ctx.beginPath(); ctx.ellipse(cx, cy, mouthW * 0.28, Math.max(mouthH * 0.3, 5), 0, 0, Math.PI * 2)
  ctx.fillStyle = '#7a2828'; ctx.fill()
  ctx.strokeStyle = '#4a1010'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.restore()
}
