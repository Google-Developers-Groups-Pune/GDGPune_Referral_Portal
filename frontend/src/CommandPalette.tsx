import { useQuery } from '@tanstack/react-query'
import { Award, Building2, CircleUserRound, CornerDownLeft, FileText, HandHeart, LogOut, Moon, QrCode, Search, SearchX, Sun, type LucideIcon } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { haptic, type Theme } from './feedback'
import { companiesQuery } from './queries'
import { CompanyLogo } from './CompanyLogo'

type Command = { id: string; group: string; label: string; hint?: string; icon?: LucideIcon; company?: string; run: () => void }

type PaletteProps = {
  canBrowse: boolean
  theme: Theme
  onToggleTheme: () => void
  onSignOut: () => void
  onClose: () => void
}

function Palette({ canBrowse, theme, onToggleTheme, onSignOut, onClose }: PaletteProps) {
  const navigate = useNavigate()
  const { data } = useQuery({ ...companiesQuery, enabled: canBrowse })
  const [search, setSearch] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    input.current?.focus()
    return () => before?.focus?.({ preventScroll: true })
  }, [])

  const go = (path: string) => () => void navigate(path)
  const commands: Command[] = [
    { id: 'companies', group: 'Go to', label: 'Companies', icon: Building2, run: go('/companies') },
    { id: 'referrals', group: 'Go to', label: 'Referrals', icon: Award, run: go('/referrals') },
    { id: 'badge', group: 'Go to', label: 'My badge', hint: 'QR code', icon: QrCode, run: go('/badge') },
    { id: 'profile', group: 'Go to', label: 'My profile', icon: CircleUserRound, run: go('/profile') },
    { id: 'resume', group: 'Go to', label: 'Resume', hint: 'Upload or replace', icon: FileText, run: go('/profile?tab=resume') },
    { id: 'refer', group: 'Go to', label: 'Refer people', hint: 'Referrer settings', icon: HandHeart, run: go('/profile?tab=refer') },
    ...(data?.companies ?? []).map((company) => ({
      id: `company-${company.id}`,
      group: 'Request a referral',
      label: company.name,
      hint: company.domain,
      company: company.name,
      run: go(`/companies?request=${company.id}`),
    })),
    { id: 'theme', group: 'Actions', label: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`, icon: theme === 'dark' ? Sun : Moon, run: onToggleTheme },
    { id: 'sign-out', group: 'Actions', label: 'Sign out', icon: LogOut, run: onSignOut },
  ]
  const words = search.trim().toLowerCase().split(/\s+/)
  const shown = commands.filter((c) => {
    const text = `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase()
    return words.every((word) => text.includes(word))
  })
  const at = Math.min(active, Math.max(0, shown.length - 1))

  const choose = (command: Command | undefined) => {
    if (!command) return
    haptic()
    onClose()
    command.run()
  }
  const move = (next: number) => {
    if (shown.length === 0) return
    const index = (next + shown.length) % shown.length
    setActive(index)
    list.current?.querySelector(`#command-${shown[index].id}`)?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[max(4rem,12dvh)]">
      <m.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onClick={onClose} />
      <m.div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        initial={{ opacity: 0, scale: 0.95, y: -14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
        className="glass glass-dense relative w-full max-w-[560px] overflow-hidden rounded-3xl"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') move(at + 1)
          else if (event.key === 'ArrowUp') move(at - 1)
          else if (event.key === 'Enter') choose(shown[at])
          else if (event.key === 'Escape') onClose()
          // The input is the only tab stop, so focus cannot leave the dialog.
          else if (event.key !== 'Tab') return
          event.preventDefault()
        }}
      >
        <div className="flex items-center gap-3 border-b border-line px-5">
          <Search size={19} className="shrink-0 text-muted" aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={shown[at] ? `command-${shown[at].id}` : undefined}
            aria-label="Search and commands"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setActive(0)
            }}
            placeholder="Find a company or page"
            className="h-15 w-full min-w-0 bg-transparent text-base !outline-none placeholder:text-muted"
          />
          <button type="button" tabIndex={-1} onClick={onClose} className="press shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-semibold text-muted">Esc</button>
        </div>
        <div ref={list} id="command-list" role="listbox" aria-label="Results" className="max-h-[min(26rem,55dvh)] overflow-y-auto overscroll-contain p-2">
          {shown.length === 0 && (
            <p className="flex flex-col items-center gap-2 py-10 text-sm text-muted"><SearchX size={24} aria-hidden /> Nothing matches “{search.trim()}”</p>
          )}
          {shown.map((command, i) => (
            <div key={command.id} role="presentation">
              {shown[i - 1]?.group !== command.group && <p className="px-3 pb-1 pt-3 text-xs font-bold text-muted">{command.group}</p>}
              <div
                id={`command-${command.id}`}
                role="option"
                aria-selected={i === at}
                onPointerMove={() => { if (i !== at) setActive(i) }}
                onClick={() => choose(command)}
                className={`relative flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${i === at ? 'text-primary' : ''}`}
              >
                {i === at && <m.span layoutId="command-active" transition={{ type: 'spring', stiffness: 700, damping: 44 }} className="absolute inset-0 rounded-2xl bg-gblue/12" />}
                <span className="relative flex w-8 shrink-0 justify-center">
                  {command.company ? <CompanyLogo name={command.company} domain={command.hint} size="sm" /> : command.icon && <command.icon size={19} aria-hidden />}
                </span>
                <span className="relative min-w-0 flex-1 truncate">{command.label}</span>
                {command.hint && <span className="relative truncate text-xs font-normal text-muted">{command.hint}</span>}
                {i === at && <CornerDownLeft size={15} className="relative shrink-0" aria-hidden />}
              </div>
            </div>
          ))}
        </div>
      </m.div>
    </div>
  )
}

/** Ctrl+K or Cmd+K from anywhere. */
export default function CommandPalette({ open, setOpen, ...props }: Omit<PaletteProps, 'onClose'> & { open: boolean; setOpen: (open: boolean) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      // Never stack on top of another open dialog, such as a half-written request.
      if (open) setOpen(false)
      else if (!document.querySelector('[role="dialog"]')) setOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])
  return createPortal(<AnimatePresence>{open && <Palette key="palette" {...props} onClose={() => setOpen(false)} />}</AnimatePresence>, document.body)
}
