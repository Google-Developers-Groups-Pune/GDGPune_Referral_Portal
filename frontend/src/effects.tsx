import { useEffect, useRef } from 'react'

const COLORS = ['#4285f4', '#ea4335', '#fbbc04', '#34a853']
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * One pair of document listeners drives every card spotlight and button ripple, so adding more
 * cards or buttons adds no listeners and no React renders.
 */
export function usePointerEffects() {
  useEffect(() => {
    let frame = 0
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const { target, clientX, clientY } = event
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const card = target instanceof Element ? target.closest<HTMLElement>('.spot') : null
        if (!card) return
        const box = card.getBoundingClientRect()
        card.style.setProperty('--mx', `${clientX - box.left}px`)
        card.style.setProperty('--my', `${clientY - box.top}px`)
      })
    }
    const onDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || reducedMotion()) return
      const button = event.target.closest<HTMLElement>('.ripple:not(:disabled)')
      if (!button) return
      const box = button.getBoundingClientRect()
      const radius = Math.hypot(box.width, box.height)
      button.style.setProperty('--rx', `${event.clientX - box.left}px`)
      button.style.setProperty('--ry', `${event.clientY - box.top}px`)
      button.animate(
        [
          { opacity: 0.32, transform: 'translate(-50%, -50%) scale(0)' },
          { opacity: 0, transform: `translate(-50%, -50%) scale(${radius / 10})` },
        ],
        { duration: 620, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::after' },
      )
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerdown', onDown, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [])
}

type Particle = { homeX: number; homeY: number; x: number; y: number; vx: number; vy: number; size: number; color: string; phase: number }

/** Google-coloured confetti that drifts, leans away from the cursor and springs back. */
export function ParticleField() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const still = reducedMotion()
    const pointer = { x: -9999, y: -9999 }
    let particles: Particle[] = []
    let width = 0
    let height = 0
    let frame = 0

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height)
      for (const p of particles) {
        const dx = p.x - pointer.x
        const dy = p.y - pointer.y
        const distance = Math.hypot(dx, dy) || 1
        const pull = Math.max(0, 1 - distance / 240)
        p.vx += (dx / distance) * pull * 1.15
        p.vy += (dy / distance) * pull * 1.15
        p.vx += (p.homeX + Math.sin(time / 2600 + p.phase) * 14 - p.x) * 0.012
        p.vy += (p.homeY + Math.cos(time / 3100 + p.phase) * 14 - p.y) * 0.012
        p.vx *= 0.9
        p.vy *= 0.9
        p.x += p.vx
        p.y += p.vy
        // Short capsules that point away from the cursor, longer the closer it is.
        const angle = Math.atan2(dy, dx)
        const reach = 1 + pull * 18
        ctx.globalAlpha = 0.42 + pull * 0.55
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x + Math.cos(angle) * reach, p.y + Math.sin(angle) * reach)
        ctx.stroke()
      }
    }
    const loop = (time: number) => {
      draw(time)
      frame = requestAnimationFrame(loop)
    }
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width * ratio
      canvas.height = height * ratio
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      const count = Math.min(320, Math.round((width * height) / 3600))
      particles = Array.from({ length: count }, (_, i) => {
        const x = Math.random() * width
        const y = Math.random() * height
        return { homeX: x, homeY: y, x, y, vx: 0, vy: 0, size: 2.5 + Math.random() * 3, color: COLORS[i % 4], phase: Math.random() * 6.3 }
      })
      if (still) draw(0)
    }
    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX
      pointer.y = event.clientY
    }
    const onLeave = () => {
      pointer.x = -9999
      pointer.y = -9999
    }
    const onPress = (event: PointerEvent) => {
      onMove(event)
      for (const p of particles) {
        const dx = p.x - event.clientX
        const dy = p.y - event.clientY
        const distance = Math.hypot(dx, dy) || 1
        const kick = Math.max(0, 1 - distance / 320) * 15
        p.vx += (dx / distance) * kick
        p.vy += (dy / distance) * kick
      }
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') onLeave()
    }

    resize()
    window.addEventListener('resize', resize)
    if (!still) {
      // requestAnimationFrame pauses by itself in background tabs.
      frame = requestAnimationFrame(loop)
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerdown', onPress, { passive: true })
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      document.documentElement.addEventListener('pointerleave', onLeave)
    }
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onPress)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [])
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />
}
