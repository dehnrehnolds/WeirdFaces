const RADIUS = 75   // color-wheel canvas is 150×150

let currentH = 30   // defaults: warm brown
let currentS = 0.65
let currentL = 0.30

const PRESETS = [
  { h: 0,   s: 0.00, l: 0.07, label: 'Black'      },
  { h: 20,  s: 0.45, l: 0.14, label: 'Dark Brown' },
  { h: 25,  s: 0.55, l: 0.28, label: 'Brown'      },
  { h: 42,  s: 0.75, l: 0.55, label: 'Blonde'     },
  { h: 8,   s: 0.78, l: 0.38, label: 'Red'        },
  { h: 335, s: 0.68, l: 0.62, label: 'Pink'       },
  { h: 215, s: 0.78, l: 0.50, label: 'Blue'       },
  { h: 278, s: 0.65, l: 0.45, label: 'Purple'     },
]

export function setupColorPicker(onColorChange) {
  const panel       = document.getElementById('hair-picker')
  const wheelCanvas = document.getElementById('color-wheel')
  const stripCanvas = document.getElementById('brightness-strip')
  const preview     = document.getElementById('hair-color-preview')

  drawWheel(wheelCanvas)
  drawStrip(stripCanvas)

  function notify() {
    const css = hsl()
    if (preview) preview.style.background = css
    onColorChange({ h: currentH, s: currentS, l: currentL })
  }

  // ── Color wheel pointer ────────────────────────────────────────────────────
  function onWheelPointer(e) {
    const rect = wheelCanvas.getBoundingClientRect()
    const px   = e.touches ? e.touches[0].clientX : e.clientX
    const py   = e.touches ? e.touches[0].clientY : e.clientY
    const dx   = (px - rect.left)  / rect.width  * (RADIUS * 2) - RADIUS
    const dy   = (py - rect.top)   / rect.height * (RADIUS * 2) - RADIUS
    const d    = Math.sqrt(dx * dx + dy * dy)
    if (d > RADIUS) return
    // atan2(dy, dx) matches conic-gradient clockwise direction (hue 0 = right)
    currentH = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360
    currentS = Math.min(d / RADIUS, 1)
    drawWheel(wheelCanvas)
    drawStrip(stripCanvas)
    notify()
  }

  wheelCanvas.addEventListener('pointerdown', onWheelPointer)
  wheelCanvas.addEventListener('pointermove',  e => { if (e.buttons) onWheelPointer(e) })
  wheelCanvas.addEventListener('touchstart',   e => { e.preventDefault(); onWheelPointer(e) }, { passive: false })
  wheelCanvas.addEventListener('touchmove',    e => { e.preventDefault(); onWheelPointer(e) }, { passive: false })

  // ── Brightness strip pointer ───────────────────────────────────────────────
  function onStripPointer(e) {
    const rect = stripCanvas.getBoundingClientRect()
    const py   = e.touches ? e.touches[0].clientY : e.clientY
    currentL   = Math.max(0.03, Math.min(0.97, (py - rect.top) / rect.height))
    drawStrip(stripCanvas)
    notify()
  }

  stripCanvas.addEventListener('pointerdown', onStripPointer)
  stripCanvas.addEventListener('pointermove',  e => { if (e.buttons) onStripPointer(e) })
  stripCanvas.addEventListener('touchstart',   e => { e.preventDefault(); onStripPointer(e) }, { passive: false })
  stripCanvas.addEventListener('touchmove',    e => { e.preventDefault(); onStripPointer(e) }, { passive: false })

  // ── Preset swatches ────────────────────────────────────────────────────────
  document.querySelectorAll('.hair-swatch').forEach((el, i) => {
    const p = PRESETS[i]
    if (!p) return
    el.style.background = `hsl(${p.h},${Math.round(p.s * 100)}%,${Math.round(p.l * 100)}%)`
    el.setAttribute('title', p.label)
    el.addEventListener('click', () => {
      currentH = p.h; currentS = p.s; currentL = p.l
      drawWheel(wheelCanvas); drawStrip(stripCanvas)
      notify()
    })
  })

  // Fire immediately so main.js has a valid color before picker is opened
  notify()

  return {
    show: () => { panel.classList.remove('hidden'); drawWheel(wheelCanvas); drawStrip(stripCanvas) },
    hide: () => panel.classList.add('hidden'),
  }
}

// ── Canvas drawing helpers ────────────────────────────────────────────────────

function hsl() {
  return `hsl(${Math.round(currentH)},${Math.round(currentS * 100)}%,${Math.round(currentL * 100)}%)`
}

function drawWheel(canvas) {
  const ctx = canvas.getContext('2d')
  const cx  = RADIUS, cy = RADIUS
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Hue: conic gradient starting at 3 o'clock (angle = 0)
  if (typeof ctx.createConicGradient === 'function') {
    const g = ctx.createConicGradient(0, cx, cy)
    for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2); ctx.fill()
  } else {
    // Fallback: draw 360 thin wedge segments (runs once, ~2ms)
    for (let a = 0; a < 360; a++) {
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, RADIUS, (a - 0.5) * Math.PI / 180, (a + 0.5) * Math.PI / 180)
      ctx.closePath()
      ctx.fillStyle = `hsl(${a},100%,50%)`
      ctx.fill()
    }
  }

  // Saturation: white at center fading to transparent at edge
  const satG = ctx.createRadialGradient(cx, cy, 0, cx, cy, RADIUS)
  satG.addColorStop(0, 'rgba(255,255,255,1)')
  satG.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = satG
  ctx.beginPath(); ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2); ctx.fill()

  // Cursor dot at current H/S position
  const dotX = cx + Math.cos(currentH * Math.PI / 180) * currentS * RADIUS
  const dotY = cy + Math.sin(currentH * Math.PI / 180) * currentS * RADIUS
  ctx.beginPath(); ctx.arc(dotX, dotY, 7, 0, Math.PI * 2)
  ctx.strokeStyle = currentL < 0.5 ? '#fff' : '#333'
  ctx.lineWidth = 2.5; ctx.stroke()
  ctx.beginPath(); ctx.arc(dotX, dotY, 4, 0, Math.PI * 2)
  ctx.fillStyle = hsl(); ctx.fill()
}

function drawStrip(canvas) {
  const ctx = canvas.getContext('2d')
  const w = canvas.width, h = canvas.height
  // Vertical strip: dark at top, vivid in middle, light at bottom
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0,   `hsl(${currentH},${Math.round(currentS * 100)}%,3%)`)
  g.addColorStop(0.5, `hsl(${currentH},${Math.round(currentS * 100)}%,50%)`)
  g.addColorStop(1,   `hsl(${currentH},${Math.round(currentS * 100)}%,97%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // Horizontal cursor line
  const y = currentL * h
  ctx.strokeStyle = currentL > 0.55 ? '#333' : '#fff'
  ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
}
