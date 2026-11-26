import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { companiesQuery } from './queries'

const sizes = {
  sm: { box: 'h-8 w-8 rounded-[0.6rem]', fetch: 64, icon: 16 },
  md: { box: 'h-11 w-11 rounded-[0.9rem]', fetch: 128, icon: 21 },
}

/** Domains that can never have a public icon, so no request is made for them. */
const PRIVATE = /\.(example|test|invalid|localhost|local|internal)$/i

/** Remembers which domains have a usable icon, so lists never flash the placeholder twice. */
const known = new Map<string, boolean>()

function iconUrl(domain: string, px: number) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${px}`
}

/**
 * The company's own website icon on a white tile. Without one, a quiet building icon.
 * Pass `domain` when it is known; otherwise it is looked up by name in the cached company list.
 */
export function CompanyLogo({ name, domain, size = 'md' }: { name: string; domain?: string; size?: keyof typeof sizes }) {
  const { data } = useQuery({ ...companiesQuery, enabled: false })
  const resolved = (domain ?? data?.companies.find((c) => c.name === name)?.domain)?.trim().toLowerCase()
  const usable = Boolean(resolved && resolved.includes('.') && !PRIVATE.test(resolved))
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>(() => {
    if (!usable || !resolved) return 'bad'
    const seen = known.get(resolved)
    return seen === undefined ? 'loading' : seen ? 'ok' : 'bad'
  })
  const { box, fetch, icon } = sizes[size]

  if (state === 'bad' || !resolved) {
    return (
      <span aria-hidden className={`${box} inline-flex shrink-0 items-center justify-center bg-line/45 text-muted ring-1 ring-inset ring-line`}>
        <Building2 size={icon} strokeWidth={1.8} />
      </span>
    )
  }
  return (
    <span aria-hidden className={`${box} relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-[#fff] ring-1 ring-inset ring-black/8`}>
      {state === 'loading' && <span className="skeleton absolute inset-0" />}
      <img
        src={iconUrl(resolved, fetch)}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(event) => {
          // The service answers unknown sites with a 16px globe, which reads worse than the placeholder.
          const ok = event.currentTarget.naturalWidth > 16
          known.set(resolved, ok)
          setState(ok ? 'ok' : 'bad')
        }}
        onError={() => {
          known.set(resolved, false)
          setState('bad')
        }}
        className={`h-[64%] w-[64%] object-contain transition-[opacity,transform] duration-300 ${state === 'ok' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
      />
    </span>
  )
}
