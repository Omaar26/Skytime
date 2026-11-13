import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Maximize2, Pause, Play, ScanLine } from 'lucide-react'

function drawField(canvas, target, epoch, mode) {
  const bounds = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  const width = Math.max(1, bounds.width)
  const height = Math.max(1, bounds.height)
  canvas.width = width * ratio
  canvas.height = height * ratio
  const context = canvas.getContext('2d')
  context.scale(ratio, ratio)

  const background = context.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, '#08121d')
  background.addColorStop(0.52, '#070b13')
  background.addColorStop(1, '#10101a')
  context.fillStyle = background
  context.fillRect(0, 0, width, height)

  const seed = target.id.split('').reduce((value, char) => value + char.charCodeAt(0), 0)
  for (let index = 0; index < 190; index += 1) {
    const x = ((index * 127.1 + seed * 31.7) % 997) / 997 * width
    const y = ((index * 311.7 + seed * 17.3) % 991) / 991 * height
    const radius = ((index * 7 + seed) % 21) / 10 + 0.3
    const alpha = 0.2 + ((index * 13 + seed) % 65) / 100
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fillStyle = index % 17 === 0 ? `rgba(111, 202, 223, ${alpha})` : `rgba(219, 232, 247, ${alpha})`
    context.fill()
  }

  const centerX = width * (0.5 + (((seed % 11) - 5) * 0.008))
  const centerY = height * (0.49 + (((seed % 7) - 3) * 0.009))
  const shift = (epoch - 2) * (mode === 'difference' ? 14 : 6)
  const colors = target.color || '#f5a46f'
  context.save()
  context.globalCompositeOperation = mode === 'difference' ? 'screen' : 'source-over'
  const glow = context.createRadialGradient(centerX + shift, centerY, 1, centerX + shift, centerY, 62)
  glow.addColorStop(0, `${colors}99`)
  glow.addColorStop(0.18, `${colors}52`)
  glow.addColorStop(1, `${colors}00`)
  context.fillStyle = glow
  context.fillRect(centerX - 70 + shift, centerY - 70, 140, 140)
  context.beginPath()
  context.arc(centerX + shift, centerY, 5 + ((seed + epoch) % 3), 0, Math.PI * 2)
  context.fillStyle = '#fff4df'
  context.shadowColor = colors
  context.shadowBlur = 20
  context.fill()
  context.shadowBlur = 0
  if (mode === 'difference') {
    context.beginPath()
    context.arc(centerX - shift * 1.4, centerY, 7, 0, Math.PI * 2)
    context.strokeStyle = 'rgba(248, 105, 117, 0.9)'
    context.lineWidth = 1.4
    context.stroke()
  }
  context.restore()

  context.strokeStyle = 'rgba(104, 173, 194, 0.16)'
  context.lineWidth = 1
  context.setLineDash([3, 5])
  context.beginPath()
  context.moveTo(centerX - 38, centerY)
  context.lineTo(centerX + 38, centerY)
  context.moveTo(centerX, centerY - 38)
  context.lineTo(centerX, centerY + 38)
  context.stroke()
  context.setLineDash([])
  context.strokeStyle = 'rgba(255,255,255,0.07)'
  context.strokeRect(18, 18, width - 36, height - 36)
}


const MAX_IMAGE_ATTEMPTS = 3
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function resolveApiUrl(url) {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

function isSimulated(frame) {
  return Array.isArray(frame?.flags) && frame.flags.includes('simulated')
}

function describeFrame(frame) {
  if (!frame) return 'LOCAL PREVIEW'
  const band = Number.isFinite(frame.wavelengthMin) && Number.isFinite(frame.wavelengthMax)
    ? ` / ${frame.wavelengthMin.toFixed(2)}–${frame.wavelengthMax.toFixed(2)} µm`
    : ''
  return `Detector ${frame.detector}${band}${isSimulated(frame) ? ' / simulated' : ''}`
}

// Draws |frame - reference| stretched to full contrast. Both images are same-origin PNG/SVG
// served through the backend, so reading their pixels is allowed.
function drawDifference(canvas, image, reference) {
  const width = image.naturalWidth || 1
  const height = image.naturalHeight || 1
  canvas.width = width
  canvas.height = height
  const read = (source) => {
    const scratch = document.createElement('canvas')
    scratch.width = width
    scratch.height = height
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true })
    scratchContext.drawImage(source, 0, 0, width, height)
    return scratchContext.getImageData(0, 0, width, height)
  }
  const current = read(image)
  const base = read(reference)
  const output = new ImageData(width, height)
  let peak = 1
  for (let index = 0; index < current.data.length; index += 4) {
    const delta = Math.abs(current.data[index] - base.data[index])
    output.data[index] = output.data[index + 1] = output.data[index + 2] = delta
    output.data[index + 3] = 255
    if (delta > peak) peak = delta
  }
  const scale = 255 / peak
  for (let index = 0; index < output.data.length; index += 4) {
    const value = Math.min(255, output.data[index] * scale)
    output.data[index] = output.data[index + 1] = output.data[index + 2] = value
  }
  canvas.getContext('2d').putImageData(output, 0, 0)
}

export default function BlinkPlayer({ target, onFrames }) {
  const canvasRef = useRef(null)
  const diffCanvasRef = useRef(null)
  const viewportRef = useRef(null)
  const imagesRef = useRef({})
  const [frames, setFrames] = useState([])
  const [framesLoading, setFramesLoading] = useState(false)
  const [frameError, setFrameError] = useState('')
  const [imageStatus, setImageStatus] = useState({})
  const [epoch, setEpoch] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [fps, setFps] = useState(2)
  const [mode, setMode] = useState('blink')

  // Frames whose image failed every attempt are dropped from the sequence.
  const visibleFrames = frames.filter((frame) => imageStatus[frame.id] !== 'error')
  const hasFrames = visibleFrames.length > 0
  const allReady = hasFrames && visibleFrames.every((frame) => imageStatus[frame.id] === 'ready')
  const pendingCount = visibleFrames.filter((frame) => imageStatus[frame.id] !== 'ready').length
  const fallbackEpochs = target.epochs || ['2023-08-14', '2023-11-02', '2024-02-18', '2024-05-21', '2024-08-09']
  const epochs = hasFrames ? visibleFrames.map((frame) => frame.date) : fallbackEpochs
  const index = hasFrames ? epoch % visibleFrames.length : epoch % fallbackEpochs.length
  const currentFrame = hasFrames ? visibleFrames[index] : null
  const currentReady = currentFrame ? imageStatus[currentFrame.id] === 'ready' : false
  const showLocalPreview = !hasFrames && !framesLoading
  const waiting = framesLoading || (hasFrames && !currentReady)

  // Reference for difference mode: the first frame taken by the same detector.
  const reference = currentFrame
    ? visibleFrames.find((frame) => frame.detector === currentFrame.detector && imageStatus[frame.id] === 'ready')
    : null
  const isReference = !!currentFrame && reference?.id === currentFrame.id

  // 1. Load the frame list (metadata is quick; the images are fetched afterwards).
  useEffect(() => {
    const ra = Number(target.ra)
    const dec = Number(target.dec)
    setFrames([])
    setImageStatus({})
    setFrameError('')
    setEpoch(0)
    imagesRef.current = {}
    onFrames?.(null)
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) return undefined
    const controller = new AbortController()
    const loadFrames = async () => {
      setFramesLoading(true)
      try {
        const query = new URLSearchParams({ ra: String(ra), dec: String(dec), fov: String(target.fov || 0.1) })
        const response = await fetch(resolveApiUrl(`/api/frames?${query}`), { signal: controller.signal })
        if (!response.ok) {
          let message = `Frame request failed (${response.status})`
          try { message = (await response.json())?.error?.message || message } catch { /* keep the status message */ }
          throw new Error(message)
        }
        const data = await response.json()
        const list = (Array.isArray(data.frames) ? data.frames : []).map((frame) => ({
          ...frame,
          imageUrl: resolveApiUrl(frame.imageUrl),
        }))
        setFrames(list)
        onFrames?.({ count: list.length, simulated: list.some(isSimulated) })
        if (!list.length) setFrameError('No SPHEREx frames cover this position.')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setFrameError(`${requestError.message || 'Backend frames unavailable'}. Showing the local preview.`)
        }
      } finally {
        if (!controller.signal.aborted) setFramesLoading(false)
      }
    }
    loadFrames()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.ra, target.dec, target.fov])

  // 2. Preload every frame image (the backend renders each cutout on first request, which
  //    can take a while), retrying transient failures.
  useEffect(() => {
    if (!frames.length) return undefined
    let cancelled = false
    const timers = []
    const setStatus = (id, status) => {
      if (!cancelled) setImageStatus((current) => ({ ...current, [id]: status }))
    }
    const load = (frame, attempt) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        imagesRef.current[frame.id] = image
        setStatus(frame.id, 'ready')
      }
      image.onerror = () => {
        if (cancelled) return
        if (attempt + 1 < MAX_IMAGE_ATTEMPTS) timers.push(window.setTimeout(() => load(frame, attempt + 1), 1500 * (attempt + 1)))
        else setStatus(frame.id, 'error')
      }
      image.src = frame.imageUrl
    }
    frames.forEach((frame) => load(frame, 0))
    return () => {
      cancelled = true
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [frames])

  // 3. Local procedural preview, only used when the backend has no frames to show.
  const paint = useCallback(() => {
    if (showLocalPreview && canvasRef.current) drawField(canvasRef.current, target, epoch, mode)
  }, [showLocalPreview, target, epoch, mode])

  useEffect(() => {
    paint()
    const observer = new ResizeObserver(paint)
    if (canvasRef.current) observer.observe(canvasRef.current)
    return () => observer.disconnect()
  }, [paint])

  // 4. Real difference image computed from the loaded frames.
  const currentId = currentFrame?.id
  const referenceId = reference?.id
  useEffect(() => {
    if (mode !== 'difference' || !currentReady || isReference || !diffCanvasRef.current) return
    const image = imagesRef.current[currentId]
    const base = imagesRef.current[referenceId]
    if (!image || !base) return
    try {
      drawDifference(diffCanvasRef.current, image, base)
    } catch {
      setFrameError('Could not compute the difference image in this browser.')
    }
  }, [mode, currentReady, isReference, currentId, referenceId])

  // Only animate once every frame is available, so the blink never flashes empty frames.
  const canPlay = hasFrames ? allReady : !framesLoading
  const isPlaying = playing && canPlay
  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = window.setInterval(() => setEpoch((current) => (current + 1) % epochs.length), 1000 / fps)
    return () => window.clearInterval(timer)
  }, [isPlaying, fps, epochs.length])

  const toggleMode = (nextMode) => setMode(nextMode)

  let viewportState = 'LOCAL PREVIEW'
  if (currentFrame) viewportState = isSimulated(currentFrame) ? 'BACKEND MOCK FRAME' : 'SPHEREx FRAME'
  if (currentFrame && mode === 'difference') viewportState = isReference ? 'REFERENCE FRAME' : 'DIFFERENCE VS FIRST FRAME'
  if (!currentFrame && mode === 'difference') viewportState = 'LOCAL PREVIEW DIFFERENCE'

  let waitingText = ''
  if (framesLoading) waitingText = 'SEARCHING SPHEREx ARCHIVE…'
  else if (waiting) waitingText = `FETCHING FRAME FROM ARCHIVE… ${visibleFrames.length - pendingCount}/${visibleFrames.length} READY`

  return (
    <section className="panel viewer-panel">
      <div className="viewer-heading">
        <div className="viewer-title">
          <div className="heading-icon"><ScanLine size={16} /></div>
          <div>
            <span className="eyebrow">MULTI-EPOCH VIEWER <span className="live-dot" /></span>
            <h2>{target.name}</h2>
          </div>
        </div>
        <div className="viewer-tools">
          <span className="frame-counter">FRAME {String(index + 1).padStart(2, '0')} / {String(epochs.length).padStart(2, '0')}</span>
          <button className="icon-button" aria-label="Toggle fullscreen" onClick={() => viewportRef.current?.requestFullscreen?.()}><Maximize2 size={15} /></button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="sky-viewport"
        aria-label={`Infrared sky image for ${target.name}`}
        aria-busy={waiting}
      >
        {currentFrame && currentReady && mode === 'blink' && <img className="backend-frame-image" crossOrigin="anonymous" src={currentFrame.imageUrl} alt={`Frame ${currentFrame.id} for ${target.name}`} />}
        {currentFrame && currentReady && mode === 'difference' && (isReference
          ? <img className="backend-frame-image" crossOrigin="anonymous" src={currentFrame.imageUrl} alt={`Reference frame ${currentFrame.id} for ${target.name}`} />
          : <canvas ref={diffCanvasRef} className="backend-frame-image" aria-label={`Difference between frame ${currentFrame.id} and the first frame`} />)}
        {showLocalPreview && <canvas ref={canvasRef} />}
        <div className="viewport-coordinate">RA {Number(target.ra).toFixed(4)}°<br />DEC {Number(target.dec).toFixed(4)}°</div>
        <div className="viewport-state"><Activity size={12} /> {viewportState}</div>
        {waiting && <div className="pause-notice loading-notice" role="status"><i className="loading-spinner" />{waitingText}<small>The first view of a new patch can take up to a minute.</small></div>}
        {frameError && !waiting && <div className="pause-notice" role="status">{frameError}</div>}
        <span className="corner-mark top-left" /><span className="corner-mark top-right" />
        <span className="corner-mark bottom-left" /><span className="corner-mark bottom-right" />
      </div>
      <div className="epoch-line">
        <span>OBSERVATION EPOCH</span>
        <strong>{currentFrame?.date || epochs[index]}</strong>
        <span className="epoch-band">{describeFrame(currentFrame)}</span>
      </div>
      <div className="timeline">
        <button className={`play-button ${isPlaying ? 'is-playing' : ''}`} onClick={() => setPlaying((current) => !current)} disabled={!canPlay} aria-label={isPlaying ? 'Pause playback' : 'Start playback'}>
          {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>
        <div className="scrubber-wrap">
          <div className="scrubber-labels"><span>{epochs[0]}</span><span>{epochs[epochs.length - 1]}</span></div>
          <input aria-label="Observation epoch" type="range" min="0" max={Math.max(0, epochs.length - 1)} step="1" value={index} onChange={(event) => setEpoch(Number(event.target.value))} />
          <div className="epoch-ticks">{epochs.map((date, tick) => <button key={visibleFrames[tick]?.id || `${date}-${tick}`} className={tick === index ? 'active' : ''} onClick={() => setEpoch(tick)} aria-label={`Show epoch ${date}`} />)}</div>
        </div>
        <label className="speed-control"><span>FPS</span><input aria-label="Playback speed in frames per second" type="range" min="1" max="6" step="1" value={fps} onChange={(event) => setFps(Number(event.target.value))} /><b>{fps}</b></label>
      </div>
      <div className="mode-row">
        <span className="field-label">VIEW MODE</span>
        <div className="mode-switch">
          <button className={mode === 'blink' ? 'selected' : ''} onClick={() => toggleMode('blink')}>BLINK MODE</button>
          <button className={mode === 'difference' ? 'selected' : ''} onClick={() => toggleMode('difference')}>DIFFERENCE / SUBTRACT</button>
        </div>
      </div>
    </section>
  )
}
