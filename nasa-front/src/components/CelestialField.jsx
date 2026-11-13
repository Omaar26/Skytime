import { useEffect, useRef } from 'react'

function lerp(current, target, amount) {
  return current + (target - current) * amount
}

function createStars(count) {
  let seed = 27419
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    depth: 0.15 + random() * 0.85,
    radius: 0.35 + random() * 1.15,
    alpha: 0.18 + random() * 0.7,
    tint: random(),
  }))
}

export default function CelestialField({ theme = 'dark' }) {
  const frameRef = useRef(null)
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })

  useEffect(() => {
    const canvas = frameRef.current
    const container = canvas?.parentElement
    const context = canvas?.getContext('2d')
    if (!canvas || !container || !context) return undefined

    const stars = createStars(520)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let width = 0
    let height = 0
    let previousTimestamp = 0
    let animationFrame = 0

    const resize = () => {
      const bounds = container.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = bounds.width
      height = bounds.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (reducedMotion) draw()
    }

    const draw = (timestamp = 0) => {
      const pointer = pointerRef.current
      const frameDuration = previousTimestamp ? Math.min(timestamp - previousTimestamp, 50) : 16.67
      previousTimestamp = timestamp
      const interpolation = 1 - Math.exp(-frameDuration / 220)
      pointer.x = lerp(pointer.x, pointer.targetX, interpolation)
      pointer.y = lerp(pointer.y, pointer.targetY, interpolation)
      const elapsed = reducedMotion ? 0 : timestamp * 0.00054
      const isLight = theme === 'light'

      context.clearRect(0, 0, width, height)
      const base = context.createLinearGradient(0, 0, width, height)
      base.addColorStop(0, isLight ? '#f8fafc' : '#030712')
      base.addColorStop(0.55, isLight ? '#eff5f8' : '#0B0F19')
      base.addColorStop(1, isLight ? '#f8fafc' : '#030712')
      context.fillStyle = base
      context.fillRect(0, 0, width, height)

      const haze = context.createRadialGradient(width * 0.68, height * 0.46, 0, width * 0.68, height * 0.46, width * 0.57)
      haze.addColorStop(0, isLight ? 'rgba(6, 182, 212, 0.14)' : 'rgba(6, 182, 212, 0.13)')
      haze.addColorStop(0.42, isLight ? 'rgba(56, 145, 169, 0.07)' : 'rgba(129, 140, 248, 0.085)')
      haze.addColorStop(1, isLight ? 'rgba(248, 250, 252, 0)' : 'rgba(5, 7, 10, 0)')
      context.fillStyle = haze
      context.fillRect(0, 0, width, height)

      const globeX = width * 0.73
      const globeY = height * 0.53
      const globeRadius = Math.min(width * 0.34, height * 0.39)
      const rotation = elapsed * 1.6 + pointer.x * 0.38
      const tilt = -0.18 + pointer.y * 0.28
      const projectPoint = (latitude, longitude) => {
        const x = Math.cos(latitude) * Math.sin(longitude)
        const y = Math.sin(latitude)
        const z = Math.cos(latitude) * Math.cos(longitude)
        const rotatedX = x * Math.cos(rotation) + z * Math.sin(rotation)
        const rotatedZ = -x * Math.sin(rotation) + z * Math.cos(rotation)
        const rotatedY = y * Math.cos(tilt) - rotatedZ * Math.sin(tilt)
        const depth = y * Math.sin(tilt) + rotatedZ * Math.cos(tilt)
        return {
          x: globeX + rotatedX * globeRadius,
          y: globeY + rotatedY * globeRadius * 0.76,
          depth,
        }
      }

      const globeFill = context.createRadialGradient(
        globeX - globeRadius * 0.3,
        globeY - globeRadius * 0.3,
        0,
        globeX,
        globeY,
        globeRadius,
      )
      globeFill.addColorStop(0, isLight ? 'rgba(255,255,255,.2)' : 'rgba(129,140,248,.09)')
      globeFill.addColorStop(1, isLight ? 'rgba(60,150,170,.015)' : 'rgba(11,15,25,.02)')
      context.beginPath()
      context.arc(globeX, globeY, globeRadius, 0, Math.PI * 2)
      context.fillStyle = globeFill
      context.fill()

      const drawGridLine = (pointAt, steps) => {
        const frontPath = new Path2D()
        const backPath = new Path2D()
        let previous = null
        for (let step = 0; step <= steps; step += 1) {
          const point = pointAt(step / steps)
          if (previous) {
            const front = (point.depth + previous.depth) / 2 > 0
            const path = front ? frontPath : backPath
            path.moveTo(previous.x, previous.y)
            path.lineTo(point.x, point.y)
          }
          previous = point
        }
        context.lineWidth = 0.55
        context.strokeStyle = isLight ? 'rgba(8, 126, 151, 0.055)' : 'rgba(96, 188, 203, 0.065)'
        context.stroke(backPath)
        context.lineWidth = 0.8
        context.strokeStyle = isLight ? 'rgba(8, 126, 151, 0.18)' : 'rgba(96, 188, 203, 0.2)'
        context.stroke(frontPath)
      }

      for (let latitude = -60; latitude <= 60; latitude += 20) {
        const radians = (latitude * Math.PI) / 180
        drawGridLine((progress) => projectPoint(radians, progress * Math.PI * 2), 96)
      }
      for (let longitude = 0; longitude < 180; longitude += 20) {
        const radians = (longitude * Math.PI) / 180
        drawGridLine((progress) => projectPoint((progress - 0.5) * Math.PI, radians), 64)
      }

      for (let index = 0; index < stars.length; index += 1) {
        const star = stars[index]
        const driftX = Math.sin(elapsed + star.y * 8) * star.depth * 3
        const driftY = Math.cos(elapsed * 0.8 + star.x * 6) * star.depth * 2
        const x = ((star.x * width + pointer.x * star.depth * 36 + driftX) % width + width) % width
        const y = ((star.y * height + pointer.y * star.depth * 28 + driftY) % height + height) % height
        const radius = star.radius * (0.72 + star.depth * 0.52)
        const color = isLight
          ? star.tint > 0.86 ? '0, 133, 160' : star.tint > 0.67 ? '76, 104, 119' : '42, 63, 76'
          : star.tint > 0.86 ? '34, 211, 238' : star.tint > 0.67 ? '165, 180, 252' : '226, 232, 240'
        const shimmer = reducedMotion ? 1 : 0.78 + Math.sin(frame * 0.018 + index) * 0.2
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fillStyle = `rgba(${color}, ${star.alpha * shimmer})`
        context.fill()

        if (star.depth > 0.91 && star.radius > 1.15) {
          context.strokeStyle = isLight
            ? `rgba(0, 133, 160, ${0.17 * shimmer})`
            : `rgba(129, 140, 248, ${0.17 * shimmer})`
          context.lineWidth = 0.6
          context.beginPath()
          context.moveTo(x - 5, y)
          context.lineTo(x + 5, y)
          context.moveTo(x, y - 5)
          context.lineTo(x, y + 5)
          context.stroke()
        }
      }

      context.strokeStyle = isLight ? 'rgba(8, 126, 151, 0.12)' : 'rgba(129, 140, 248, 0.11)'
      context.lineWidth = 1
      context.beginPath()
      context.ellipse(width * 0.72, height * 0.56, width * 0.33, height * 0.22, -0.3, 0, Math.PI * 2)
      context.stroke()
      frame += 1
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw)
    }

    const trackPointer = (event) => {
      const bounds = container.getBoundingClientRect()
      pointerRef.current.targetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
      pointerRef.current.targetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
    }
    const resetPointer = () => {
      pointerRef.current.targetX = 0
      pointerRef.current.targetY = 0
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    container.addEventListener('pointermove', trackPointer)
    container.addEventListener('pointerleave', resetPointer)
    resize()
    if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      observer.disconnect()
      container.removeEventListener('pointermove', trackPointer)
      container.removeEventListener('pointerleave', resetPointer)
    }
  }, [theme])

  return <canvas className="celestial-canvas" ref={frameRef} aria-hidden="true" />
}
