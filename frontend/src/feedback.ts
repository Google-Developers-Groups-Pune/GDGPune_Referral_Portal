import { toast } from 'sonner'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** A short tap on phones that support it. Silent everywhere else. */
export function haptic(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported */
  }
}

/** Confetti for real milestones only. Loaded on demand so it never slows the first paint. */
export function celebrate() {
  haptic([12, 40, 18])
  if (reducedMotion()) return
  void import('canvas-confetti')
    .then(({ default: confetti }) => {
      const base = {
        colors: ['#4285f4', '#ea4335', '#fbbc04', '#34a853'],
        disableForReducedMotion: true,
        zIndex: 80,
        ticks: 160,
      }
      void confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 42, origin: { y: 0.7 } })
      void confetti({ ...base, particleCount: 30, angle: 60, spread: 55, origin: { x: 0, y: 0.75 } })
      void confetti({ ...base, particleCount: 30, angle: 120, spread: 55, origin: { x: 1, y: 0.75 } })
    })
    .catch(() => undefined)
}

export function success(message: string, description?: string) {
  haptic(10)
  toast.success(message, { description })
}

export function failure(error: unknown) {
  haptic([20, 40, 20])
  toast.error(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
}

export type Theme = 'light' | 'dark'

/** Flips the theme, revealing it as a circle from the click point where the browser supports it. */
export function switchTheme(next: Theme, origin: { x: number; y: number }, apply: () => void) {
  const run = () => {
    document.documentElement.dataset.theme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#14181c' : '#f8f9fa')
    apply()
  }
  if (!document.startViewTransition || reducedMotion()) {
    run()
    return
  }
  const radius = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y))
  void document
    .startViewTransition(run)
    .ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        { duration: 420, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', pseudoElement: '::view-transition-new(root)' },
      )
    })
    .catch(() => undefined)
}
