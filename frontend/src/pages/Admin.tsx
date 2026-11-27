import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CircleX, ExternalLink, Hourglass, ImageOff, Mail, Maximize2 } from 'lucide-react'
import { useState } from 'react'
import { api, type AdminEvidenceItem, type EvidenceStatus } from '../api'
import { CompanyLogo } from '../CompanyLogo'
import { celebrate, failure, haptic, success } from '../feedback'
import { adminEvidenceQuery } from '../queries'
import { Avatar, Button, Card, Chip, ConfirmSheet, EmptyState, ErrorNote, PageTitle, Segmented, Sheet, SkeletonList } from '../ui'

type Review =
  | { kind: 'approve'; responseId: number; sha256: string }
  | { kind: 'reject'; responseId: number; sha256: string; note: string }

const REJECT_REASONS = [
  'The candidate’s name is not visible.',
  'This does not show a referral submission.',
  'The screenshot is unreadable. Upload a clearer one.',
  'The company or role does not match this request.',
]

const reviewChips: Record<EvidenceStatus, { text: string; tone: number }> = {
  pending: { text: 'Awaiting review', tone: 2 },
  approved: { text: 'Approved', tone: 3 },
  rejected: { text: 'Rejected', tone: 1 },
}

function screenshotUrl(item: AdminEvidenceItem) {
  // Keyed by the image's hash, so a replaced screenshot is fetched again and the one shown is the one reviewed.
  return `/api/admin/referral-evidence/${item.responseId}/screenshot?v=${item.sha256}`
}

function when(iso: string | null) {
  if (!iso) return ''
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function Person({ role, name, detail, email }: { role: string; name: string; detail?: string | null; email: string | null }) {
  return (
    <div className="min-w-0 space-y-1 rounded-2xl bg-page p-3">
      <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted">{role}</p>
      <div className="flex items-center gap-2.5">
        <Avatar name={name} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          {detail && <p className="truncate text-xs text-muted">{detail}</p>}
        </div>
      </div>
      {email && (
        <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-1.5 pt-1 text-xs font-semibold text-primary hover:underline">
          <Mail size={13} className="shrink-0" aria-hidden /><span className="truncate">{email}</span>
        </a>
      )}
    </div>
  )
}

function Thumbnail({ item, onOpen, onShown }: { item: AdminEvidenceItem; onOpen: () => void; onShown: (sha256: string) => void }) {
  const [broken, setBroken] = useState(false)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View screenshot from ${item.referrerName}`}
      className="press group relative flex h-44 w-full items-center justify-center overflow-hidden rounded-2xl border border-line bg-page"
    >
      {broken ? (
        <span className="flex flex-col items-center gap-1 text-xs text-muted"><ImageOff size={22} aria-hidden />Could not load the screenshot</span>
      ) : (
        <img src={screenshotUrl(item)} alt="" loading="lazy" onLoad={() => onShown(item.sha256)} onError={() => setBroken(true)} className="h-full w-full object-contain" />
      )}
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white opacity-90 group-hover:opacity-100">
        <Maximize2 size={12} aria-hidden /> View
      </span>
    </button>
  )
}

function EvidenceCard({ item, index, busy, shown, onShown, onApprove, onReject, onView }: {
  item: AdminEvidenceItem
  index: number
  busy: Review | null
  /** True once this exact screenshot (by hash) has loaded on screen. Reviewing stays off until then. */
  shown: boolean
  onShown: (sha256: string) => void
  onApprove: () => void
  onReject: () => void
  onView: () => void
}) {
  const chip = reviewChips[item.reviewStatus]
  const mine = busy?.responseId === item.responseId
  return (
    <Card index={index} className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
        <CompanyLogo name={item.companyName} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{item.companyName}</p>
          <p className="truncate text-sm text-muted">{item.roleTitle}</p>
        </div>
        <Chip tone={chip.tone} className="order-last basis-full justify-center sm:order-none sm:basis-auto">{chip.text}</Chip>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Person role="Seeker" name={item.seekerName} email={item.seekerEmail} />
        <Person role="Referrer" name={item.referrerName} detail={item.referrerTitle} email={item.referrerWorkEmail} />
      </div>

      {/* Keyed by hash: a replaced screenshot remounts and must load before it can be reviewed. */}
      <Thumbnail key={item.sha256} item={item} onOpen={onView} onShown={onShown} />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>Uploaded {when(item.uploadedAt)} · {Math.ceil(item.sizeBytes / 1024)} KB</span>
        {item.jobUrl && (
          <a href={item.jobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            Job posting <ExternalLink size={12} aria-hidden />
          </a>
        )}
      </div>

      {item.reviewStatus !== 'pending' && (
        <div className={`rounded-2xl p-3 text-sm ${item.reviewStatus === 'approved' ? 'bg-ggreen/10' : 'bg-gred/10'}`}>
          <p className="font-semibold">
            {item.reviewStatus === 'approved' ? 'Approved' : 'Rejected'}{item.reviewerName ? ` by ${item.reviewerName}` : ''} · {when(item.reviewedAt)}
          </p>
          {item.reviewNote && <p className="mt-1 break-words text-muted">{item.reviewNote}</p>}
        </div>
      )}

      {item.reviewStatus === 'pending' && (
        <div className="space-y-2 border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="danger" disabled={busy !== null || !shown} loading={mine && busy?.kind === 'reject'} onClick={onReject}>
              <CircleX size={16} aria-hidden /> Reject
            </Button>
            <Button variant="success" disabled={busy !== null || !shown} loading={mine && busy?.kind === 'approve'} onClick={onApprove}>
              <BadgeCheck size={16} aria-hidden /> Approve
            </Button>
          </div>
          {!shown && <p className="text-center text-xs text-muted">You can review once the screenshot has loaded.</p>}
        </div>
      )}
    </Card>
  )
}

function RejectSheet({ item, onClose, onSubmit }: { item: AdminEvidenceItem | null; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('')
  const close = () => {
    setNote('')
    onClose()
  }
  const trimmed = note.trim()
  return (
    <Sheet
      open={item !== null}
      title="Reject this screenshot?"
      subtitle={item ? `${item.referrerName} will be asked to upload a new one within 4 days.` : undefined}
      onClose={close}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="ghost" onClick={close}>Go back</Button>
          <Button
            variant="dangerSolid"
            disabled={trimmed.length === 0}
            onClick={() => {
              onSubmit(trimmed)
              close()
            }}
          >
            Reject
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label htmlFor="reject-reason" className="text-sm font-semibold">Reason the referrer will see</label>
        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((reason) => (
            <button key={reason} type="button" onClick={() => setNote(reason)} className="press rounded-full border border-line px-3 py-1.5 text-left text-xs font-semibold text-muted hover:border-primary/40 hover:text-primary">
              {reason}
            </button>
          ))}
        </div>
        <textarea id="reject-reason" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain what is missing or wrong." className="field resize-y" />
        <p className="text-right text-xs tabular-nums text-muted">{note.length}/500</p>
      </div>
    </Sheet>
  )
}

export default function AdminPage() {
  const qc = useQueryClient()
  const [view, setView] = useState<EvidenceStatus>('pending')
  const [viewing, setViewing] = useState<AdminEvidenceItem | null>(null)
  const [approving, setApproving] = useState<AdminEvidenceItem | null>(null)
  const [rejecting, setRejecting] = useState<AdminEvidenceItem | null>(null)
  const queue = useQuery({ ...adminEvidenceQuery(view), refetchInterval: 15_000 })
  // Hashes of screenshots that have actually loaded on screen. A review always carries the hash of the item it was
  // started from, so polling that swaps in a replacement can never turn a click into approval of an unseen image.
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())
  const markSeen = (sha256: string) => setSeen((prev) => (prev.has(sha256) ? prev : new Set(prev).add(sha256)))
  const liveViewing = viewing ? queue.data?.items.find((i) => i.responseId === viewing.responseId) : undefined
  const viewingReplaced = liveViewing !== undefined && viewing !== null && liveViewing.sha256 !== viewing.sha256

  const review = useMutation({
    mutationFn: (input: Review) => input.kind === 'approve'
      ? api<{ status: string; creditAwarded: boolean }>(`/api/admin/referral-evidence/${input.responseId}/approve`, {
          method: 'POST',
          body: { screenshotSha256: input.sha256 },
        })
      : api<{ status: string }>(`/api/admin/referral-evidence/${input.responseId}/reject`, {
          method: 'POST',
          body: { note: input.note, screenshotSha256: input.sha256 },
        }),
    onSuccess: (result, input) => {
      if (input.kind === 'approve') {
        celebrate()
        const awarded = (result as { creditAwarded?: boolean }).creditAwarded
        success('Referral verified', awarded ? 'The referrer earned a request credit.' : 'The referrer has reached the monthly credit cap, so no credit was added.')
      } else {
        success('Screenshot rejected', 'The referrer was asked to upload a new one.')
      }
    },
    onError: failure,
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-evidence'] }),
  })
  const busy = review.isPending ? review.variables : null
  const counts = queue.data?.counts

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Admin" subtitle="Verify referral screenshots before referrers earn credits." />
      <Segmented
        id="admin-evidence"
        label="Screenshot review status"
        className="mb-4"
        value={view}
        onChange={setView}
        segments={[
          { value: 'pending', label: 'To review', icon: Hourglass, count: counts?.pending },
          { value: 'approved', label: 'Approved', count: counts?.approved },
          { value: 'rejected', label: 'Rejected', count: counts?.rejected },
        ]}
      />
      <section id={`admin-evidence-${view}-panel`} role="tabpanel" aria-labelledby={`admin-evidence-${view}-tab`}>
        {queue.isPending ? (
          <SkeletonList />
        ) : !queue.data ? (
          <ErrorNote message="Could not load the review queue." onRetry={() => void queue.refetch()} />
        ) : queue.data.items.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title={view === 'pending' ? 'All caught up' : `No ${view} screenshots yet`}
            text={view === 'pending' ? 'New referral screenshots appear here as referrers submit them.' : 'Reviewed screenshots are listed here.'}
          />
        ) : (
          <div className="space-y-3">
            {counts && counts[view] > queue.data.items.length && (
              <p className="text-center text-xs text-muted">
                Showing the {view === 'pending' ? 'oldest' : 'latest'} {queue.data.items.length} of {counts[view]}.
              </p>
            )}
            {queue.data.items.map((item, i) => (
              <EvidenceCard
                key={item.responseId}
                item={item}
                index={i}
                busy={busy}
                shown={seen.has(item.sha256)}
                onShown={markSeen}
                onView={() => setViewing(item)}
                onApprove={() => {
                  haptic()
                  setApproving(item)
                }}
                onReject={() => {
                  haptic()
                  setRejecting(item)
                }}
              />
            ))}
          </div>
        )}
      </section>

      <Sheet open={viewing !== null} title="Referral screenshot" subtitle={viewing ? `${viewing.referrerName} · ${viewing.companyName}` : undefined} onClose={() => setViewing(null)}>
        {viewing && (
          <div className="space-y-3">
            {viewingReplaced && (
              <p role="status" className="rounded-2xl bg-gyellow/15 p-3 text-sm font-semibold">
                The referrer uploaded a new screenshot since you opened this one. Close this and review the new one.
              </p>
            )}
            <img src={screenshotUrl(viewing)} alt={`Screenshot uploaded by ${viewing.referrerName}`} onLoad={() => markSeen(viewing.sha256)} className="w-full rounded-2xl border border-line object-contain" />
            <a href={screenshotUrl(viewing)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
              Open full size <ExternalLink size={14} aria-hidden />
            </a>
          </div>
        )}
      </Sheet>
      <ConfirmSheet
        open={approving !== null}
        title="Approve this referral?"
        text={approving
          ? `${approving.referrerName}’s referral of ${approving.seekerName} counts as done. They earn a request credit unless they have reached the cap of 2 per 30 days, and ${approving.seekerName}’s request stays used.`
          : ''}
        confirmLabel="Approve"
        onClose={() => setApproving(null)}
        onConfirm={() => approving && review.mutate({ kind: 'approve', responseId: approving.responseId, sha256: approving.sha256 })}
      />
      <RejectSheet
        item={rejecting}
        onClose={() => setRejecting(null)}
        onSubmit={(note) => rejecting && review.mutate({ kind: 'reject', responseId: rejecting.responseId, sha256: rejecting.sha256, note })}
      />
    </div>
  )
}
