import { useEffect, useRef, useState } from 'react'

// The signature element — a live oscilloscope line reflecting event rate
export default function NeuralPulse({ eventRate = 0, height = 40, color = 'var(--acid)', className }) {
  const canvasRef = useRef(null)
  const dataRef   = useRef(Array(120).fill(0))
  const frameRef  = useRef(null)
  const rateRef   = useRef(eventRate)

  useEffect(() => { rateRef.current = eventRate }, [eventRate])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    function resize() {
      canvas.width  = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resize()
    window.addEventListener('resize', resize)

    let tick = 0
    function draw() {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      const rate = rateRef.current

      // Push new data point — random spike proportional to event rate
      const base     = Math.min(rate / 100, 1)
      const noise    = (Math.random() - 0.5) * 0.15
      const spike    = Math.random() < 0.05 ? Math.random() * 0.6 : 0
      const newPoint = Math.max(0, Math.min(1, base + noise + spike))

      dataRef.current.push(newPoint)
      dataRef.current.shift()

      ctx.clearRect(0, 0, w, h)

      const data = dataRef.current
      const step = w / (data.length - 1)
      const mid  = h * 0.6

      // Glow pass
      ctx.save()
      ctx.shadowColor = color.includes('var') ? '#E8FF47' : color
      ctx.shadowBlur  = 8
      ctx.strokeStyle = color.includes('var') ? '#E8FF47' : color
      ctx.lineWidth   = 1.5
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      data.forEach((v, i) => {
        const x = i * step
        const y = mid - v * (h * 0.55)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.restore()

      // Main line
      ctx.save()
      ctx.strokeStyle = color.includes('var') ? '#E8FF47' : color
      ctx.lineWidth   = 1.5
      ctx.lineJoin    = 'round'
      ctx.lineCap     = 'round'

      // Gradient fill
      const grad = ctx.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(232,255,71,0.15)')
      grad.addColorStop(1, 'rgba(232,255,71,0)')
      ctx.fillStyle = grad

      ctx.beginPath()
      data.forEach((v, i) => {
        const x = i * step
        const y = mid - v * (h * 0.55)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.lineTo(w, h)
      ctx.lineTo(0, h)
      ctx.closePath()
      ctx.fill()

      ctx.beginPath()
      data.forEach((v, i) => {
        const x = i * step
        const y = mid - v * (h * 0.55)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.restore()

      tick++
      frameRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(frameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height, display: 'block' }}
    />
  )
}
