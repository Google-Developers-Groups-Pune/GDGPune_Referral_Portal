import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { markAllNotificationsRead, markNotificationRead, type AppNotification } from './api'
import { failure, haptic } from './feedback'
import { notificationsQuery, unreadQuery } from './queries'
import { Spinner } from './ui'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** Turns a stored notification type + payload into one readable line. */
function describe(n: AppNotification): string {
  const company = text(n.payload.company) ?? 'a company'
  const role = text(n.payload.roleTitle)
  switch (n.type) {
    case 'referral_request':
      return role ? `New referral request for ${role} at ${company}` : `New referral request at ${company}`
    case 'referral_accepted':
      return `Your referral request at ${company} was accepted`
    case 'referral_submitted':
      return `Your referral at ${company} was submitted and is being verified`
    case 'referral_confirmed':
      return n.payload.creditAwarded === true
        ? `Your referral at ${company} was verified. You earned a request credit`
        : `Your referral at ${company} was verified`
    case 'referral_verified':
      return role ? `Your referral for ${role} at ${company} was verified` : `Your referral at ${company} was verified`
    case 'referral_evidence_rejected':
      return text(n.payload.reason)
        ? `Your referral screenshot for ${company} was rejected: ${text(n.payload.reason)}`
        : `Your referral screenshot for ${company} was rejected. Upload a new one`
    case 'referral_reminder':
      return role ? `Reminder: referral at ${company} for ${role}` : `Reminder: referral at ${company}`
    case 'referral_closed':
      return `Your referral at ${company} was closed`
    case 'referral_request_expired':
      return role ? `Your request for ${role} at ${company} expired` : `Your request at ${company} expired`
    default:
      return n.type.replace(/_/g, ' ')
  }
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function NotificationBell() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const lastUnread = useRef<number | null>(null)

  const { data: unread } = useQuery({ ...unreadQuery, refetchInterval: 30_000 })
  const { data: items, isPending, isError, refetch } = useQuery({ ...notificationsQuery, enabled: open })
  const count = unread ?? 0

  useEffect(() => {
    if (unread === undefined) return
    const before = lastUnread.current
    lastUnread.current = unread
    if (before === null || unread <= before) return
    void qc.invalidateQueries({ queryKey: notificationsQuery.queryKey })
    void qc.invalidateQueries({ queryKey: ['seeker-referral-requests'] })
    void qc.invalidateQueries({ queryKey: ['referral-request-inbox'] })
    haptic([10, 50, 10])
    toast('You have a new update', {
      id: 'new-update',
      icon: <BellRing size={18} className="text-primary" />,
      action: { label: 'See it', onClick: () => void navigate('/referrals') },
    })
  }, [unread, qc, navigate])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Read state changes on screen at once; the server call follows and any failure is re-synced.
  const markLocally = async (matches: (n: AppNotification) => boolean) => {
    await qc.cancelQueries({ queryKey: ['notifications'] })
    let cleared = 0
    qc.setQueryData(notificationsQuery.queryKey, (list) =>
      list?.map((n) => {
        if (n.read || !matches(n)) return n
        cleared++
        return { ...n, read: true }
      }),
    )
    qc.setQueryData(unreadQuery.queryKey, (n) => Math.max(0, (n ?? 0) - cleared))
  }
  const resync = () => qc.invalidateQueries({ queryKey: ['notifications'] })

  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id) => markLocally((n) => n.id === id),
    onSettled: resync,
  })
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => markLocally(() => true),
    onError: failure,
    onSettled: resync,
  })

  const openItem = (n: AppNotification) => {
    haptic()
    if (!n.read) readOne.mutate(n.id)
    setOpen(false)
    void navigate('/referrals')
  }

  const hasUnread = Boolean(items?.some((n) => !n.read))

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          haptic()
          setOpen((v) => !v)
        }}
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        aria-expanded={open}
        className={`press relative inline-flex h-10 w-10 items-center justify-center rounded-full hover:bg-line/60 hover:text-ink ${open ? 'bg-line/60 text-ink' : 'text-muted'}`}
      >
        <m.span key={count} animate={count > 0 ? { rotate: [0, 16, -13, 9, -5, 0] } : undefined} transition={{ duration: 0.6 }} className="inline-flex origin-top">
          <Bell size={19} aria-hidden />
        </m.span>
        {count > 0 && (
          <span className="absolute right-0.5 top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-danger-fill px-1 text-[0.65rem] font-bold leading-[1.1rem] text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ opacity: 0, scale: 0.94, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 520, damping: 34 }}
            className="fixed inset-x-4 top-[calc(4rem+env(safe-area-inset-top))] z-40 origin-top-right overflow-hidden rounded-3xl glass glass-dense sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
          >
            <div className="flex min-h-12 items-center justify-between border-b border-line px-4">
              <span className="text-sm font-bold">Notifications</span>
              {hasUnread && (
                <button type="button" onClick={() => readAll.mutate()} className="press rounded-full px-3 py-2 text-xs font-semibold text-primary hover:bg-gblue/10">
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[min(24rem,65dvh)] overflow-y-auto overscroll-contain">
              {isError ? (
                <button type="button" onClick={() => void refetch()} className="w-full px-4 py-8 text-center text-sm font-semibold text-primary">Could not load. Tap to try again.</button>
              ) : isPending ? (
                <Spinner />
              ) : !items || items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted">
                  <Bell size={26} className="mx-auto mb-2 opacity-60" aria-hidden />
                  You&apos;re all caught up.
                </div>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-line/40 active:bg-line/60 ${n.read ? '' : 'bg-gblue/7'}`}
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full transition-colors ${n.read ? 'bg-transparent' : 'bg-gblue'}`} />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm ${n.read ? 'text-muted' : 'font-semibold text-ink'}`}>{describe(n)}</span>
                          <span className="mt-0.5 block text-xs text-muted">{timeAgo(n.createdAt)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
