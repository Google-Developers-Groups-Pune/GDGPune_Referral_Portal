import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BadgeCheck, Building2, Check, FileText, Search, SearchX, Share2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useDeferredValue, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type Company, type SeekerReferralRequest } from '../api'
import { CompanyLogo } from '../CompanyLogo'
import { celebrate, failure, haptic, success } from '../feedback'
import { companiesQuery, meQuery, profileQuery, resumeQuery, sentRequestsQuery } from '../queries'
import {
  AnimatedNumber,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  PageTitle,
  ProgressRing,
  Segmented,
  Sheet,
  SkeletonList,
  SuccessCheck,
  Switch,
} from '../ui'

type Draft = { roleTitle: string; jobUrl: string; seekerNote: string }

/** Keeps a half-written request if the sheet is dismissed by accident. Cleared on reload. */
const drafts = new Map<number, Draft>()

function ReferralRequestSheet({ company, open, requestsLeft, onClose }: {
  company: Company
  open: boolean
  requestsLeft: number
  onClose: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: profile } = useQuery({ ...profileQuery, enabled: open })
  const { data: resume } = useQuery({ ...resumeQuery, enabled: open })
  const [draft, setDraft] = useState<Draft>(() => drafts.get(company.id) ?? { roleTitle: '', jobUrl: '', seekerNote: '' })
  const [shareProfile, setShareProfile] = useState(true)
  const [sharePhone, setSharePhone] = useState(false)
  const edit = (change: Partial<Draft>) => {
    const next = { ...draft, ...change }
    drafts.set(company.id, next)
    setDraft(next)
  }
  const create = useMutation({
    mutationFn: () => api('/api/referral-requests', {
      method: 'POST',
      body: { companyId: company.id, ...draft, shareProfile, shareSeekerPhone: sharePhone },
    }),
    onSuccess: () => {
      drafts.delete(company.id)
      celebrate()
      void qc.invalidateQueries({ queryKey: companiesQuery.queryKey })
      void qc.invalidateQueries({ queryKey: ['seeker-referral-requests'] })
    },
    onError: () => haptic([20, 40, 20]),
  })

  if (create.isSuccess) {
    return (
      <Sheet open={open} title="Request sent" subtitle={company.name} onClose={onClose}>
        <div className="py-5 text-center">
          <SuccessCheck />
          <p className="mt-5 text-lg font-bold">It’s with the {company.name} referrers now</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-muted">We’ll notify you as soon as someone accepts. Unanswered requests expire and your request comes back to you.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={onClose}>Keep browsing</Button>
          <Button onClick={() => void navigate('/referrals')}>Track it <ArrowRight size={16} aria-hidden /></Button>
        </div>
      </Sheet>
    )
  }

  const suggestions = profile?.rolesWanted ?? []
  return (
    <Sheet
      open={open}
      title="Request a referral"
      subtitle={company.name}
      onClose={onClose}
      footer={
        <>
          <p className="mb-2 text-xs text-muted">Request allowance remaining: {requestsLeft}. One request covers this company and role, regardless of how many employees accept.</p>
          <Button type="submit" form="referral-request" loading={create.isPending} disabled={requestsLeft < 1 || !shareProfile} className="w-full py-3">
            {create.isPending ? 'Sending…' : 'Send request'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">Your request goes to verified referrers at this company. Accepting means someone is willing to help; it does not guarantee an opening, referral, or interview.</p>
      <form
        id="referral-request"
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!create.isPending) create.mutate()
        }}
      >
        <div>
          <label className="text-sm font-semibold" htmlFor="role-title">Role you’re interested in</label>
          <input id="role-title" required maxLength={160} value={draft.roleTitle} onChange={(event) => edit({ roleTitle: event.target.value })} placeholder="e.g. Backend Engineer" className="field mt-1" />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggestions from your profile">
              {suggestions.map((role) => (
                <button
                  key={role}
                  type="button"
                  aria-pressed={draft.roleTitle === role}
                  onClick={() => {
                    haptic()
                    edit({ roleTitle: role })
                  }}
                  className={`press min-h-8 rounded-full border px-3 text-xs font-semibold ${draft.roleTitle === role ? 'border-primary-fill bg-primary-fill text-white' : 'border-line text-muted hover:border-primary/50'}`}
                >
                  {role}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="job-url">Job link</label>
          <input id="job-url" type="url" inputMode="url" required maxLength={500} value={draft.jobUrl} onChange={(event) => edit({ jobUrl: event.target.value })} placeholder="https://company.com/jobs/..." className="field mt-1" />
        </div>
        <div>
          <label className="text-sm font-semibold" htmlFor="request-context">A note for the referrers <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="request-context" maxLength={1000} rows={3} value={draft.seekerNote} onChange={(event) => edit({ seekerNote: event.target.value })} placeholder="What kind of help are you looking for?" className="field mt-1 resize-y" />
          <p className="text-right text-xs tabular-nums text-muted">{draft.seekerNote.length}/1000</p>
        </div>
        <fieldset className="space-y-4 rounded-2xl border border-line bg-page p-4">
          <legend className="px-1 text-sm font-bold">Information sharing</legend>
          <Switch
            checked={shareProfile}
            onChange={setShareProfile}
            title="Share my profile summary"
            text={`With verified referrers at ${company.name}: experience, skills, role interests, and pitch. Required to send a request.`}
          />
          {profile?.phoneNumber && (
            <Switch checked={sharePhone} onChange={setSharePhone} title="Share my phone number" text="Only with employees who accept." />
          )}
          <p className="text-sm text-muted">Your sign-in email is shared only with employees who accept.</p>
          {resume ? (
            <p className="text-sm text-muted">By sending this request, you agree to share your uploaded resume with verified referrers at {company.name}.</p>
          ) : resume === null ? (
            <p className="flex gap-2 rounded-2xl bg-gyellow/20 p-3 text-sm text-warn">
              <FileText size={18} className="mt-0.5 shrink-0" aria-hidden />
              <span>No resume will be attached. <Link to="/profile?tab=resume" className="font-bold underline">Add one first</Link> to give referrers more to work with. Your draft stays here.</span>
            </p>
          ) : null}
        </fieldset>
        <ErrorNote message={create.error?.message ?? null} />
      </form>
    </Sheet>
  )
}

const STAGES = ['Sent', 'Accepted', 'Submitted', 'Verified']
const STAGE_STATUSES = ['pending', 'accepted', 'submitted', 'confirmed']

/** 0 sent, 1 accepted, 2 submitted, 3 verified by an admin. */
function stageOf(request: SeekerReferralRequest) {
  return Math.max(0, ...request.responses.map((x) => STAGE_STATUSES.indexOf(x.status)))
}

function isLive(request: SeekerReferralRequest) {
  return ['open', 'no_acceptances', 'in_progress', 'awaiting_seeker'].includes(request.status)
}

function LatestRequests({ requests }: { requests: SeekerReferralRequest[] }) {
  return (
    <Card index={2}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">Your requests</h2>
        <Link to="/referrals" className="press rounded-full px-2 py-1 text-xs font-semibold text-primary hover:bg-gblue/10">See all</Link>
      </div>
      <ul className="-mx-2">
        {requests.slice(0, 3).map((request) => {
          const stage = stageOf(request)
          const over = !isLive(request) && stage === 0
          return (
            <li key={request.id}>
              <Link to="/referrals" className="press flex items-center gap-3 rounded-2xl p-2 hover:bg-line/40">
                <CompanyLogo name={request.companyName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{request.companyName}</span>
                    <span className={`shrink-0 text-xs font-semibold ${over ? 'text-muted' : 'text-success'}`}>{over ? 'Ended' : STAGES[stage]}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{request.roleTitle}</span>
                  <span aria-hidden className="mt-1.5 grid grid-cols-4 gap-1">
                    {STAGES.map((name, i) => <span key={name} className={`h-1 rounded-full transition-colors duration-500 ${!over && i <= stage ? 'bg-ggreen' : 'bg-line'}`} />)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function HowItWorks() {
  return (
    <Card index={2}>
      <h2 className="mb-3 font-bold">How it works</h2>
      <ol className="space-y-3 text-sm">
        {[
          ['bg-gblue', 'Pick a company and paste the job link.'],
          ['bg-gyellow', 'Verified employees there see your request.'],
          ['bg-ggreen', 'One accepts, submits it, and you confirm.'],
        ].map(([color, text], i) => (
          <li key={text} className="flex items-start gap-3">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#202124] ${color}`}>{i + 1}</span>
            <span className="pt-0.5 text-muted">{text}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** Shown under a short list: the directory only grows when employees verify. */
function GrowTheList() {
  const invite = async () => {
    const url = window.location.origin
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Referral Portal', text: 'Verify your work email and help people get referred at your company.', url })
      } else {
        await navigator.clipboard.writeText(url)
        success('Invite link copied', 'Send it to someone at a company you like.')
      }
    } catch (error) {
      // Closing the share menu is not a failure.
      if (!(error instanceof DOMException && error.name === 'AbortError')) failure(new Error('Could not copy the link.'))
    }
  }
  return (
    <div className="rise flex flex-wrap items-center gap-4 rounded-3xl border-2 border-dashed border-line p-5" style={{ animationDelay: '240ms' }}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gblue/10 text-primary"><Building2 size={20} aria-hidden /></span>
      <div className="min-w-48 flex-1">
        <p className="font-bold">Looking for another company?</p>
        <p className="text-sm text-muted">It appears here once someone who works there verifies their work email.</p>
      </div>
      <Button variant="outline" onClick={() => void invite()} className="max-sm:w-full"><Share2 size={16} aria-hidden /> Invite someone</Button>
    </div>
  )
}

/** Base requests per 30 days once a work email is verified. Mirrors ReferralRequestBudget on the server. */
const VERIFIED_BASE_MAX = 5

type Filter = 'all' | 'sponsors'

export default function CompaniesPage() {
  const { data, isPending, isError, refetch } = useQuery(companiesQuery)
  const { data: me } = useQuery(meQuery)
  const { data: sent } = useQuery(sentRequestsQuery)
  // The company stays set while the sheet animates out; `attempt` gives every opening a fresh form.
  const [target, setTarget] = useState<{ company: Company; open: boolean; attempt: number } | null>(null)
  const [params, setParams] = useSearchParams()
  const { key: visit } = useLocation()
  const [handledVisit, setHandledVisit] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const query = useDeferredValue(search).trim().toLowerCase()

  if (isPending) return <><PageTitle title="Companies" subtitle="Ask for help from verified referrers at their companies." /><SkeletonList count={6} className="max-w-3xl space-y-3" /></>
  if (isError && !data) return <ErrorNote message="Could not load companies." onRetry={() => void refetch()} />

  // The command palette links here with ?request=<company id>. Each visit opens the form once.
  const requestedId = params.get('request')
  if (requestedId && handledVisit !== visit) {
    setHandledVisit(visit)
    const company = data.companies.find((c) => String(c.id) === requestedId)
    if (company) setTarget({ company, open: true, attempt: (target?.attempt ?? 0) + 1 })
  }

  const sponsors = data.companies.filter((c) => c.sponsor)
  const visible = data.companies.filter((c) =>
    (filter === 'all' || c.sponsor)
    && (!query || c.name.toLowerCase().includes(query) || c.domain.toLowerCase().includes(query)),
  )
  const requested = new Set(sent?.filter(isLive).map((request) => request.companyName))
  const allowance = data.referralRequestsMax + data.referralBonusCredits

  return (
    <div>
      <PageTitle title="Companies" subtitle="Ask for help from verified referrers at their companies." />

      {/* Phones stack: allowance, companies, then the rest. Wide screens get a side panel. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-5">
        <aside aria-label="Your activity" className="contents lg:sticky lg:top-4 lg:order-2 lg:block lg:space-y-4">
          <div className="order-1 space-y-4">
          <Card className="flex items-center gap-4">
            <ProgressRing value={allowance > 0 ? data.referralRequestsLeft / allowance : 0} size={68} color={data.referralRequestsLeft === 0 ? 'var(--color-gred)' : 'var(--color-gblue)'}>
              <span className="text-xl font-extrabold"><AnimatedNumber value={data.referralRequestsLeft} /></span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {data.referralRequestsLeft === 0 ? 'No requests left right now' : `You can send ${data.referralRequestsLeft} ${data.referralRequestsLeft === 1 ? 'request' : 'requests'}`}
              </p>
              <p className="text-sm text-muted">Your limit is {data.referralRequestsMax} every 30 days</p>
              {data.referralBonusCredits > 0 && <Chip tone={3} className="mt-1.5"><Sparkles size={13} aria-hidden />Includes {data.referralBonusCredits} bonus</Chip>}
            </div>
          </Card>

          {me && !me.isReferrer && data.referralRequestsMax < VERIFIED_BASE_MAX && (
            <Link to="/profile?tab=refer" className="press rise group flex items-center gap-3 rounded-3xl bg-referrer-soft p-4 text-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-fill text-white"><ShieldCheck size={20} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-referrer">Get {VERIFIED_BASE_MAX} requests every 30 days</span>
                <span className="text-muted">Verify your work email to raise your limit.</span>
              </span>
              <ArrowRight size={18} className="shrink-0 text-referrer transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          )}
          </div>
          <div className="order-3">
            {sent && sent.length > 0 ? <LatestRequests requests={sent} /> : <HowItWorks />}
          </div>
        </aside>
        <div className="order-2 min-w-0 lg:order-1">
          {data.companies.length === 0 ? (
            <EmptyState icon={Building2} title="No companies have verified referrers yet" text="Check back when more employees verify their work email." />
          ) : (
            <>
              <div className="sticky top-[calc(3.6rem+env(safe-area-inset-top))] z-20 mb-4 grid gap-2 lg:top-4 md:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => { if (event.key === 'Escape') setSearch('') }}
                    placeholder="Search companies"
                    aria-label="Search companies"
                    className="field min-h-13 rounded-2xl pl-11 pr-12 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {search && (
                    <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className="press absolute right-1.5 top-1/2 -mt-5 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-line/60">
                      <X size={16} aria-hidden />
                    </button>
                  )}
                </div>
                {sponsors.length > 0 && (
                  <Segmented<Filter>
                    id="companies"
                    label="Filter companies"
                    value={filter}
                    onChange={setFilter}
                    className="!bg-[color-mix(in_srgb,var(--color-line)_55%,var(--color-page))] md:min-w-60"
                    segments={[
                      { value: 'all', label: 'All', count: data.companies.length },
                      { value: 'sponsors', label: 'Sponsors', count: sponsors.length },
                    ]}
                  />
                )}
              </div>

              <div id={`companies-${filter}-panel`} role={sponsors.length > 0 ? 'tabpanel' : undefined} aria-labelledby={sponsors.length > 0 ? `companies-${filter}-tab` : undefined}>
                {visible.length === 0 ? (
                  <EmptyState icon={SearchX} title={`Nothing matches “${search.trim()}”`} text="Try a shorter name or the company’s email domain." action={<Button variant="outline" onClick={() => { setSearch(''); setFilter('all') }}>Show all companies</Button>} />
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {visible.map((company, i) => (
                        <m.div
                          key={company.id}
                          className="min-w-0"
                          layout="position"
                          layoutDependency={`${filter}|${query}|${visible.length}`}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.14 } }}
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                        >
                          <Card index={i} interactive className="wiggle-host flex items-center gap-3">
                            <span className="wiggle flex"><CompanyLogo name={company.name} domain={company.domain} /></span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold">{company.name}</p>
                              <p className="truncate text-xs text-muted">{company.domain}</p>
                              <p className="mt-1.5 flex flex-wrap gap-1.5 max-sm:mt-1">
                                <Chip tone={3} className="!px-2 !py-0.5 max-sm:hidden"><BadgeCheck size={12} aria-hidden />Verified referrers</Chip>
                                {company.sponsor && <Chip tone={2} className="!px-2 !py-0.5">Sponsor</Chip>}
                                {requested.has(company.name) && <Chip className="!px-2 !py-0.5"><Check size={12} aria-hidden />Requested</Chip>}
                              </p>
                            </div>
                            <Button
                              disabled={data.referralRequestsLeft === 0}
                              onClick={() => {
                                haptic()
                                setTarget((old) => ({ company, open: true, attempt: (old?.attempt ?? 0) + 1 }))
                              }}
                              className="group shrink-0 !px-4"
                            >
                              Request <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
                            </Button>
                          </Card>
                        </m.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
              {!query && visible.length < 6 && <div className="mt-3"><GrowTheList /></div>}
            </>
          )}
        </div>
      </div>
      {target && (
        <ReferralRequestSheet
          key={target.attempt}
          company={target.company}
          open={target.open}
          requestsLeft={data.referralRequestsLeft}
          onClose={() => {
            setTarget({ ...target, open: false })
            if (requestedId) setParams({}, { replace: true })
          }}
        />
      )}
    </div>
  )
}
