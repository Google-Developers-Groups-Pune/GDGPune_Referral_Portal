import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Award, Building2, CircleUserRound, LogOut, Moon, QrCode, Search, ShieldCheck, Sun, type LucideIcon } from 'lucide-react'
import * as m from 'motion/react-m'
import { Suspense, lazy, useEffect, useState, type CSSProperties } from 'react'
import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { api, type Me } from './api'
import { haptic, switchTheme, type Theme } from './feedback'
import NotificationBell from './NotificationBell'
import {
  adminEvidenceCountsQuery,
  adminEvidenceQuery,
  badgeQuery,
  companiesQuery,
  inboxQuery,
  meQuery,
  profileQuery,
  referrerSettingsQuery,
  resumeQuery,
  sentRequestsQuery,
} from './queries'
import CommandPalette from './CommandPalette'
import { usePointerEffects } from './effects'
import { Avatar, Button, ConfirmSheet, ErrorNote, IconButton, Logo, SkeletonList } from './ui'

const loadCompanies = () => import('./pages/Companies')
const loadReferrals = () => import('./pages/Referrals')
const loadBadge = () => import('./pages/Badge')
const loadProfile = () => import('./pages/Profile')
const loadAdmin = () => import('./pages/Admin')
const CompaniesPage = lazy(loadCompanies)
const ReferralsPage = lazy(loadReferrals)
const BadgePage = lazy(loadBadge)
const ProfilePage = lazy(loadProfile)
const AdminPage = lazy(loadAdmin)
const SignIn = lazy(() => import('./pages/SignIn'))

type Tab = {
  to: string
  label: string
  icon: LucideIcon
  /** Runs on hover, focus or finger-down, so the page is usually ready before the click lands. */
  prefetch: (qc: QueryClient) => void
}

const tabs: Tab[] = [
  {
    to: '/companies',
    label: 'Companies',
    icon: Building2,
    prefetch: (qc) => {
      void loadCompanies()
      void qc.prefetchQuery(companiesQuery)
    },
  },
  {
    to: '/referrals',
    label: 'Referrals',
    icon: Award,
    prefetch: (qc) => {
      void loadReferrals()
      void qc.prefetchQuery(sentRequestsQuery)
      void qc.prefetchQuery(inboxQuery)
    },
  },
  {
    to: '/badge',
    label: 'Badge',
    icon: QrCode,
    prefetch: (qc) => {
      void loadBadge()
      void qc.prefetchQuery(badgeQuery)
    },
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: CircleUserRound,
    prefetch: (qc) => {
      void loadProfile()
      void qc.prefetchQuery(profileQuery)
      void qc.prefetchQuery(resumeQuery)
      void qc.prefetchQuery(referrerSettingsQuery)
    },
  },
]

/** Shown only to admins (users.is_admin). */
const adminTab: Tab = {
  to: '/admin',
  label: 'Admin',
  icon: ShieldCheck,
  prefetch: (qc) => {
    void loadAdmin()
    void qc.prefetchQuery(adminEvidenceQuery('pending'))
  },
}

function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: (origin: { x: number; y: number }) => void }) {
  return (
    <IconButton
      icon={theme === 'dark' ? Sun : Moon}
      label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect()
        onToggle({ x: box.left + box.width / 2, y: box.top + box.height / 2 })
      }}
    />
  )
}

/** Number of things waiting on this person, shown on the Referrals tab. */
function useWaitingCount() {
  const { data: sent } = useQuery({ ...sentRequestsQuery, refetchInterval: 30_000 })
  const { data: inbox } = useQuery({ ...inboxQuery, refetchInterval: 30_000 })
  const toAnswer = inbox?.filter((item) => item.status === 'pending'
    || (item.status === 'accepted' && item.evidenceStatus === 'rejected')).length ?? 0
  const toDecide = sent?.filter((r) => r.canContinueWithOtherReferrers).length ?? 0
  return toAnswer + toDecide
}

/** Screenshots waiting for an admin, shown on the Admin tab. */
function usePendingReviewCount(enabled: boolean) {
  const { data } = useQuery({ ...adminEvidenceCountsQuery, enabled, refetchInterval: 30_000 })
  return enabled ? data?.pending ?? 0 : 0
}

function NavItem({ tab, count, layout }: { tab: Tab; count: number; layout: 'bar' | 'side' }) {
  const qc = useQueryClient()
  const { to, label, icon: Icon, prefetch } = tab
  const side = layout === 'side'
  return (
    <NavLink
      to={to}
      onPointerEnter={() => prefetch(qc)}
      onPointerDown={() => prefetch(qc)}
      onFocus={() => prefetch(qc)}
      onClick={() => haptic()}
      className={({ isActive }) =>
        `press wiggle-host relative flex rounded-2xl font-semibold ${side ? 'items-center gap-3 px-4 py-3 text-sm' : 'flex-col items-center gap-0.5 py-2 text-[0.7rem]'} ${isActive ? 'text-primary' : 'text-muted hover:text-ink'}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <m.span
              layoutId={`nav-${layout}`}
              layoutDependency={to}
              transition={{ type: 'spring', stiffness: 480, damping: 36 }}
              className="absolute inset-0 rounded-2xl bg-gblue/12"
            />
          )}
          <m.span className="relative" animate={{ scale: isActive ? 1.08 : 1, y: isActive && !side ? -1 : 0 }} transition={{ type: 'spring', stiffness: 600, damping: 18 }}>
            <Icon size={21} strokeWidth={isActive ? 2.4 : 2} className="wiggle" aria-hidden />
            {count > 0 && !side && <CountBadge count={count} className="absolute -right-2.5 -top-1.5" />}
          </m.span>
          <span className="relative flex-1">{label}</span>
          {count > 0 && side && <CountBadge count={count} className="relative" />}
        </>
      )}
    </NavLink>
  )
}

function CountBadge({ count, className }: { count: number; className: string }) {
  return (
    <m.span
      key={count}
      initial={{ scale: 0.4 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 16 }}
      className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-danger-fill px-1 text-[0.65rem] font-bold leading-[1.15rem] text-white ${className}`}
    >
      {count > 9 ? '9+' : count}
      <span className="sr-only"> waiting for you</span>
    </m.span>
  )
}

/** Slides each page in from the side its tab sits on. There is no exit phase, so taps never wait. */
function PageFrame() {
  const { pathname } = useLocation()
  const index = [...tabs, adminTab].findIndex((tab) => tab.to === pathname)
  const [last, setLast] = useState({ pathname, index, from: 0 })
  if (last.pathname !== pathname) setLast({ pathname, index, from: Math.sign(index - last.index) * 18 })
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return (
    <div key={pathname} className="page-in" style={{ '--from': `${last.from}px` } as CSSProperties}>
      <Suspense fallback={<SkeletonList />}>
        <Outlet />
      </Suspense>
    </div>
  )
}

function Shell({ me, theme, toggleTheme }: { me: Me; theme: Theme; toggleTheme: (origin: { x: number; y: number }) => void }) {
  const qc = useQueryClient()
  const waiting = useWaitingCount()
  const pendingReviews = usePendingReviewCount(me.isAdmin)
  const shownTabs = me.isAdmin ? [...tabs, adminTab] : tabs
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    // Fetch the other screens' code once the browser is idle so every later tab switch is instant.
    const id = window.setTimeout(() => {
      for (const load of [loadCompanies, loadReferrals, loadBadge, loadProfile]) void load().catch(() => undefined)
    }, 1500)
    return () => window.clearTimeout(id)
  }, [])

  const signOut = async () => {
    try {
      await api('/logout', { method: 'POST' })
    } finally {
      qc.clear()
      window.location.assign('/')
    }
  }
  const countFor = (tab: Tab) => (tab.to === '/referrals' ? waiting : tab.to === '/admin' ? pendingReviews : 0)

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px]">
      <m.aside layoutRoot className="sticky top-4 my-4 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 glass flex-col rounded-3xl px-4 py-6 lg:flex">
        <Link to="/" aria-label="Referral Portal home" className="rounded-xl px-3"><Logo /></Link>
        <nav aria-label="Main" className="mt-8 space-y-1">
          {shownTabs.map((tab) => <NavItem key={tab.to} tab={tab} count={countFor(tab)} layout="side" />)}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-2xl border border-line bg-surface/60 p-3">
          <Avatar name={me.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{me.name}</p>
            <p className="truncate text-xs text-muted">{[me.isReferrer ? 'Seeker and referrer' : 'Seeker', me.isAdmin ? 'Admin' : null].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
      </m.aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between px-4 max-[340px]:px-2 pb-2 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 lg:relative lg:px-8">
          {/* A sibling layer, so the notification panel can blur the page itself. */}
          <span aria-hidden className="glass glass-flat absolute inset-0 -z-10 lg:hidden" />
          <Link to="/" aria-label="Referral Portal home" className="rounded-xl lg:hidden"><Logo /></Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="press hidden min-h-11 w-72 items-center gap-3 rounded-full border border-line bg-surface/70 px-4 text-sm text-muted hover:border-primary/40 hover:text-ink lg:flex"
          >
            <Search size={16} aria-hidden /> Search or jump to
            <kbd className="ml-auto rounded-md border border-line px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold">{/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <div className="ml-auto flex items-center">
            <IconButton icon={Search} label="Search and commands" onClick={() => setPaletteOpen(true)} className="max-[375px]:hidden lg:hidden" />
            <NotificationBell />
            <ThemeButton theme={theme} onToggle={toggleTheme} />
            <IconButton icon={LogOut} label="Sign out" onClick={() => setConfirmSignOut(true)} className="-mr-2" />
          </div>
        </header>
        <main className="flex-1 px-4 pb-32 pt-3 sm:px-6 lg:px-8 lg:pb-16">
          <PageFrame />
        </main>
      </div>

      <m.nav layoutRoot aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className={`mx-auto grid max-w-md gap-1 rounded-3xl glass p-1.5 ${shownTabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {shownTabs.map((tab) => <NavItem key={tab.to} tab={tab} count={countFor(tab)} layout="bar" />)}
        </div>
      </m.nav>

      <CommandPalette
        open={paletteOpen}
        setOpen={setPaletteOpen}
        canBrowse={me.hasProfile}
        theme={theme}
        onToggleTheme={() => toggleTheme({ x: window.innerWidth / 2, y: window.innerHeight / 3 })}
        onSignOut={() => setConfirmSignOut(true)}
      />
      <ConfirmSheet
        open={confirmSignOut}
        title="Sign out?"
        text="Your requests keep running. Sign back in any time to see what happened."
        confirmLabel="Sign out"
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => void signOut()}
      />
    </div>
  )
}

function Splash() {
  return (
    <div role="status" aria-label="Loading" className="flex min-h-dvh items-center justify-center">
      <Logo size="lg" loading />
    </div>
  )
}

function AppContent() {
  const { data: me, isPending, isError, isFetching, refetch } = useQuery(meQuery)
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'))

  const toggleTheme = (origin: { x: number; y: number }) => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    haptic()
    switchTheme(next, origin, () => setTheme(next))
    try {
      localStorage.setItem('referral-theme', next)
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  }

  const floatingTheme = <div className="fixed right-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-30"><ThemeButton theme={theme} onToggle={toggleTheme} /></div>

  if (isPending) return <Splash />
  if (isError && me === undefined) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-5 p-6 text-center">
        {floatingTheme}
        <Logo size="lg" />
        <ErrorNote message="Cannot reach the server. Check your connection and try again." />
        <Button loading={isFetching} onClick={() => void refetch()}>Try again</Button>
      </div>
    )
  }
  if (!me) {
    return (
      <>
        {floatingTheme}
        <Suspense fallback={<Splash />}>
          <SignIn loginError={new URLSearchParams(window.location.search).has('loginError')} />
        </Suspense>
      </>
    )
  }

  return (
    <Routes>
      <Route element={<Shell me={me} theme={theme} toggleTheme={toggleTheme} />}>
        <Route index element={<Navigate to={me.hasProfile ? '/companies' : '/profile'} replace />} />
        <Route path="profile" element={<ProfilePage me={me} />} />
        <Route path="companies" element={me.hasProfile ? <CompaniesPage /> : <Navigate to="/profile" replace />} />
        <Route path="badge" element={<BadgePage me={me} />} />
        <Route path="referrals" element={<ReferralsPage />} />
        <Route path="admin" element={me.isAdmin ? <AdminPage /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  usePointerEffects()
  return (
    <>
      <AppContent />
      <Toaster
        position="top-center"
        offset={16}
        gap={8}
        duration={2800}
        toastOptions={{
          style: {
            background: 'var(--glass-dense)',
            border: '1px solid var(--glass-edge)',
            boxShadow: 'var(--shadow-pop)',
            color: 'var(--color-ink)',
            borderRadius: '1.1rem',
            fontFamily: 'var(--font-sans)',
          },
          classNames: { toast: 'glass glass-dense', success: '[&_[data-icon]]:text-success', error: '[&_[data-icon]]:text-danger', description: '!text-muted' },
        }}
      />
    </>
  )
}
