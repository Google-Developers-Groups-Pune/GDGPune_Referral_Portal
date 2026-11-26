import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, BadgeCheck, Check, CloudUpload, Download, FileText, HandHeart, Plus, Trash2, UserRound } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, deleteResume, downloadPdf, uploadResume, type Me, type Profile as ProfileData, type ReferrerSettings, type ResumeInfo } from '../api'
import { celebrate, failure, haptic, success } from '../feedback'
import { meQuery, profileQuery, referrerSettingsQuery, resumeQuery } from '../queries'
import { AnimatedNumber, Button, Card, Chip, ConfirmSheet, ErrorNote, OtpInput, PageTitle, ProgressRing, Segmented, SkeletonList, Switch } from '../ui'

const LOOKING_FOR = ['Frontend', 'Backend', 'Full Stack', 'Mobile', 'Data', 'ML / AI', 'DevOps', 'Cloud', 'QA', 'Design']
const SKILLS = ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Java', 'Spring Boot', 'Python', 'SQL', 'Kotlin', 'Flutter', 'Go', 'GCP', 'AWS', 'Docker', 'Kubernetes', 'TensorFlow', 'Firebase', 'Angular']
const LEVELS = [
  { value: 'student', label: 'Student' },
  { value: 'fresher', label: 'Fresher' },
  { value: '1-3', label: '1-3 years' },
  { value: '3-6', label: '3-6 years' },
  { value: '6+', label: '6+ years' },
]
const MAX_RESUME_BYTES = 5 * 1024 * 1024

type SetField = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => void
type SectionProps = { form: ProfileData; set: SetField }

function PickChip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={() => {
        haptic()
        onClick()
      }}
      className={`press inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium disabled:opacity-45 ${on ? 'border-primary-fill bg-primary-fill text-white' : 'border-line bg-surface text-muted hover:border-primary/50 hover:text-ink'}`}
    >
      <span className={`grid transition-[grid-template-columns,opacity] duration-200 ${on ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'}`}>
        <span className="overflow-hidden"><Check size={15} strokeWidth={3} className="mr-1.5" aria-hidden /></span>
      </span>
      {children}
    </button>
  )
}

function ChipPicker({ options, value, onChange, max, label }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max: number; label: string }) {
  const [custom, setCustom] = useState('')
  const all = Array.from(new Set([...options, ...value]))
  const full = value.length >= max
  const toggle = (item: string) =>
    onChange(value.includes(item) ? value.filter((v) => v !== item) : full ? value : [...value, item])
  const addCustom = () => {
    const item = custom.trim()
    if (!item) return
    if (full && !value.includes(item)) {
      failure(new Error(`You can pick up to ${max}. Remove one first.`))
      return
    }
    if (!value.includes(item)) onChange([...value, item])
    setCustom('')
  }
  return (
    <div role="group" aria-label={label}>
      <div className="flex flex-wrap gap-2">
        {all.map((item) => {
          const on = value.includes(item)
          return <PickChip key={item} on={on} disabled={full && !on} onClick={() => toggle(item)}>{item}</PickChip>
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          maxLength={30}
          placeholder="Add your own"
          aria-label={`Add your own to ${label}`}
          className="field min-w-0 flex-1 !rounded-full"
        />
        <Button variant="outline" disabled={!custom.trim()} onClick={addCustom}><Plus size={16} aria-hidden /> Add</Button>
      </div>
      <p className="mt-2 text-xs tabular-nums text-muted">{value.length} of {max} selected</p>
    </div>
  )
}

function LevelPicker({ form, set }: SectionProps) {
  return (
    <div role="group" aria-label="Experience" className="flex flex-wrap gap-2">
      {LEVELS.map((l) => <PickChip key={l.value} on={form.experienceLevel === l.value} onClick={() => set('experienceLevel', l.value)}>{l.label}</PickChip>)}
    </div>
  )
}

function PitchField({ form, set }: SectionProps) {
  const length = (form.pitch ?? '').length
  return (
    <div>
      <label className="text-sm font-bold" htmlFor="pitch">Your pitch</label>
      <textarea id="pitch" value={form.pitch ?? ''} onChange={(e) => set('pitch', e.target.value)} maxLength={200} rows={3} placeholder="One line about what you are looking for" className="field mt-2 resize-none" />
      <p className={`text-right text-xs tabular-nums ${length > 180 ? 'text-warn' : 'text-muted'}`}>{length}/200</p>
    </div>
  )
}

function LinkFields({ form, set }: SectionProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="text-sm font-bold" htmlFor="gh">GitHub</label>
        <input id="gh" inputMode="url" value={form.githubUrl ?? ''} onChange={(e) => set('githubUrl', e.target.value)} placeholder="https://github.com/you" className="field mt-1" />
      </div>
      <div>
        <label className="text-sm font-bold" htmlFor="li">LinkedIn</label>
        <input id="li" inputMode="url" value={form.linkedinUrl ?? ''} onChange={(e) => set('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/you" className="field mt-1" />
      </div>
      <div>
        <label className="text-sm font-bold" htmlFor="portfolio">Portfolio <span className="font-normal text-muted">(optional)</span></label>
        <input id="portfolio" type="url" maxLength={500} value={form.portfolioUrl ?? ''} onChange={(e) => set('portfolioUrl', e.target.value)} placeholder="https://your-portfolio.com" className="field mt-1" />
      </div>
      <div>
        <label className="text-sm font-bold" htmlFor="phone-number">Phone number <span className="font-normal text-muted">(optional)</span></label>
        <input id="phone-number" type="tel" autoComplete="tel" maxLength={32} value={form.phoneNumber ?? ''} onChange={(e) => set('phoneNumber', e.target.value)} placeholder="+1 555 010 1234" className="field mt-1" />
      </div>
    </div>
  )
}

function PrivacyField({ form, set }: SectionProps) {
  return (
    <Switch
      checked={form.hideFromMyCompany}
      onChange={(v) => set('hideFromMyCompany', v)}
      title="Hide my profile from people at my own company"
      text="On by default. Colleagues will not see you in lists or scans."
    />
  )
}

function ResumeCard() {
  const qc = useQueryClient()
  const { data: resumeInfo } = useQuery(resumeQuery)
  const [dragging, setDragging] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const resumeUpload = useMutation({
    mutationFn: (file: File) => uploadResume(file),
    onSuccess: async () => {
      success('Resume uploaded', 'It will be attached to your new requests.')
      await qc.invalidateQueries({ queryKey: resumeQuery.queryKey })
    },
    onError: failure,
  })
  const resumeDelete = useMutation({
    mutationFn: () => deleteResume(),
    onSuccess: async () => {
      success('Resume removed')
      await qc.invalidateQueries({ queryKey: resumeQuery.queryKey })
    },
    onError: failure,
  })

  const upload = (file: File | undefined) => {
    if (!file || resumeUpload.isPending) return
    // Checked here for an instant answer; the server still has the final say.
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') failure(new Error('Only PDF resumes are accepted.'))
    else if (file.size > MAX_RESUME_BYTES) failure(new Error('Resume must be 5 MB or smaller.'))
    else resumeUpload.mutate(file)
  }
  const download = async (info: ResumeInfo) => {
    setDownloading(true)
    try {
      await downloadPdf('/api/me/resume', info.filename)
    } catch (error) {
      failure(error)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="font-bold">Resume</p>
        <p className="text-sm text-muted">Referrers can open it when you send a request.</p>
      </div>
      {resumeInfo && (
        <div className="flex items-center gap-3 rounded-2xl bg-page p-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gred/10 text-danger"><FileText size={20} aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{resumeInfo.filename}</p>
            <p className="text-xs text-muted">{Math.ceil(resumeInfo.sizeBytes / 1024)} KB</p>
          </div>
          <button type="button" aria-label="Download resume" disabled={downloading} onClick={() => void download(resumeInfo)} className="press flex h-11 w-11 items-center justify-center rounded-full text-primary hover:bg-gblue/10 disabled:opacity-50"><Download size={18} aria-hidden /></button>
          <button type="button" aria-label="Remove resume" disabled={resumeDelete.isPending} onClick={() => setConfirmRemove(true)} className="press flex h-11 w-11 items-center justify-center rounded-full text-danger hover:bg-gred/10 disabled:opacity-50"><Trash2 size={18} aria-hidden /></button>
        </div>
      )}
      <label
        htmlFor="resume-file"
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          upload(event.dataTransfer.files[0])
        }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-3xl border-2 border-dashed px-4 py-8 text-center transition focus-within:border-primary ${dragging ? 'scale-[1.015] border-primary bg-gblue/10' : 'border-line hover:border-primary/50 hover:bg-gblue/5'}`}
      >
        <CloudUpload size={30} className={`text-primary ${resumeUpload.isPending ? 'animate-bounce' : ''}`} aria-hidden />
        <span className="text-sm font-semibold" aria-live="polite">
          {resumeUpload.isPending ? 'Uploading resume…' : dragging ? 'Drop it here' : resumeInfo ? 'Replace resume' : 'Upload resume'}
        </span>
        <span className="text-xs text-muted">Choose or drop a PDF, up to 5 MB</span>
        <input
          id="resume-file"
          type="file"
          accept="application/pdf,.pdf"
          disabled={resumeUpload.isPending}
          onChange={(event) => {
            upload(event.target.files?.[0])
            event.target.value = ''
          }}
          className="sr-only"
        />
      </label>
      <ConfirmSheet
        open={confirmRemove}
        title="Remove your resume?"
        text="It is also removed from requests you have already sent, so referrers will no longer be able to open it."
        confirmLabel="Remove"
        danger
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => resumeDelete.mutate()}
      />
    </Card>
  )
}

function VerifiedReferrer({ settings }: { settings: ReferrerSettings }) {
  return (
    <Card className="space-y-4 bg-referrer-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold text-referrer">Referrer at {settings.companyName}</p>
          <p className="truncate text-sm text-muted">{settings.workEmail}</p>
        </div>
        <Chip tone={3}><BadgeCheck size={14} aria-hidden /> Verified</Chip>
      </div>
      <p className="text-sm text-muted">You’ll receive referral requests from seekers applying to {settings.companyName}. Accept as many as you can help with.</p>
    </Card>
  )
}

function BecomeReferrer() {
  const qc = useQueryClient()
  const [workEmail, setWorkEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)

  const startVerification = useMutation({
    mutationFn: () => api<{ sent: boolean }>('/api/referrer/verify/start', {
      method: 'POST',
      body: { workEmail },
    }),
    onSuccess: () => {
      success('Code sent', `Check ${workEmail}`)
      confirmVerification.reset()
      setCodeSent(true)
      setVerificationCode('')
    },
  })
  const confirmVerification = useMutation({
    mutationFn: () => api<ReferrerSettings>('/api/referrer/verify/confirm', {
      method: 'POST',
      body: { workEmail, code: verificationCode },
    }),
    onSuccess: async () => {
      celebrate()
      success('You’re a verified referrer', 'Requests for your company will land in Referrals.')
      await qc.invalidateQueries({ queryKey: meQuery.queryKey })
      await qc.invalidateQueries({ queryKey: referrerSettingsQuery.queryKey })
    },
  })
  const error = confirmVerification.error?.message ?? startVerification.error?.message ?? null

  return (
    <Card className="bg-referrer-soft">
      <p className="text-lg font-bold text-referrer">Become a referrer</p>
      <p className="text-sm text-muted">Verify your work email to refer people. You can still use your seeker profile without verifying.</p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (codeSent) confirmVerification.mutate()
          else startVerification.mutate()
        }}
      >
        {codeSent ? (
          <div className="rise">
            <label className="block text-sm font-semibold" htmlFor="verification-code">Verification code</label>
            <p className="mb-3 text-sm text-muted">Enter the 6-digit code sent to {workEmail}. It expires in 10 minutes.</p>
            <OtpInput id="verification-code" value={verificationCode} onChange={setVerificationCode} disabled={confirmVerification.isPending} />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-semibold" htmlFor="work-email">Work email</label>
            <input id="work-email" type="email" required maxLength={190} value={workEmail} onChange={(event) => setWorkEmail(event.target.value)} disabled={startVerification.isPending} placeholder="you@company.com" className="field mt-1" />
          </div>
        )}
        <ErrorNote key={error} message={error} />
        {codeSent ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="success" loading={confirmVerification.isPending} disabled={verificationCode.length !== 6}>
              {confirmVerification.isPending ? 'Verifying…' : 'Verify email'}
            </Button>
            <Button variant="outline" loading={startVerification.isPending} onClick={() => startVerification.mutate()}>
              {startVerification.isPending ? 'Sending…' : 'Resend code'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCodeSent(false)
                startVerification.reset()
                confirmVerification.reset()
              }}
            >
              Change email
            </Button>
          </div>
        ) : (
          <Button type="submit" variant="success" loading={startVerification.isPending} disabled={!workEmail.includes('@')}>
            {startVerification.isPending ? 'Sending…' : 'Send verification code'}
          </Button>
        )}
      </form>
    </Card>
  )
}

function ReferrerSection() {
  const { data, isError, refetch } = useQuery(referrerSettingsQuery)
  if (data) return data.verified ? <VerifiedReferrer settings={data} /> : <BecomeReferrer />
  return isError ? <ErrorNote message="Could not load referrer settings." onRetry={() => void refetch()} /> : <SkeletonList count={1} />
}

/** What makes a profile useful to a referrer. Each missing item is a suggestion, never a requirement. */
function strengthOf(form: ProfileData, hasResume: boolean) {
  const checks = [
    { done: form.rolesWanted.length > 0, tip: 'Add a role you want' },
    { done: form.skills.length >= 3, tip: 'Add 3 or more skills' },
    { done: Boolean(form.pitch?.trim()), tip: 'Write a one-line pitch' },
    { done: Boolean(form.linkedinUrl?.trim()), tip: 'Add your LinkedIn' },
    { done: Boolean(form.githubUrl?.trim() || form.portfolioUrl?.trim()), tip: 'Add GitHub or a portfolio' },
    { done: hasResume, tip: 'Upload your resume' },
  ]
  return { value: checks.filter((c) => c.done).length / checks.length, next: checks.find((c) => !c.done)?.tip ?? null }
}

const ONBOARDING = [
  { title: 'Where are you now?', text: 'Pick your experience and the roles you want.' },
  { title: 'What are you good at?', text: 'A few skills help referrers match you quickly.' },
  { title: 'Introduce yourself', text: 'One honest line and your links go a long way.' },
  { title: 'Finishing touches', text: 'Optional, and you can add them any time.' },
]

function Onboarding({ me, form, set, onFinish, saving, error }: SectionProps & { me: Me; onFinish: () => void; saving: boolean; error: string | null }) {
  const [step, setStep] = useState(0)
  const last = step === ONBOARDING.length - 1
  const go = (next: number) => {
    haptic()
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle title={`Welcome, ${me.name.split(' ')[0]}!`} subtitle="Takes about 2 minutes. You can edit it later from the Profile tab." />
      <div role="progressbar" aria-label="Profile setup" aria-valuemin={1} aria-valuemax={ONBOARDING.length} aria-valuenow={step + 1} className="mb-6 grid grid-cols-4 gap-2">
        {['bg-gblue', 'bg-gred', 'bg-gyellow', 'bg-ggreen'].map((color, i) => (
          <span key={color} className="h-1.5 overflow-hidden rounded-full bg-line">
            <span className={`block h-full origin-left rounded-full transition-transform duration-500 ease-out-soft ${color} ${i <= step ? 'scale-x-100' : 'scale-x-0'}`} />
          </span>
        ))}
      </div>
      <div key={step} className="page-in space-y-4" style={{ '--from': '24px' } as CSSProperties}>
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">{ONBOARDING[step].title}</h2>
          <p className="text-sm text-muted">{ONBOARDING[step].text}</p>
        </div>
        {step === 0 && (
          <>
            <Card><p className="mb-3 text-sm font-bold">Experience</p><LevelPicker form={form} set={set} /></Card>
            <Card index={1}><p className="mb-3 text-sm font-bold">Looking for</p><ChipPicker label="Looking for" options={LOOKING_FOR} value={form.rolesWanted} onChange={(v) => set('rolesWanted', v)} max={6} /></Card>
          </>
        )}
        {step === 1 && <Card><p className="mb-3 text-sm font-bold">Skills</p><ChipPicker label="Skills" options={SKILLS} value={form.skills} onChange={(v) => set('skills', v)} max={12} /></Card>}
        {step === 2 && <><Card><PitchField form={form} set={set} /></Card><Card index={1}><LinkFields form={form} set={set} /></Card></>}
        {step === 3 && <><ResumeCard /><Card index={1}><PrivacyField form={form} set={set} /></Card><ReferrerSection /></>}
      </div>
      <div className="mt-6 space-y-3">
        <ErrorNote key={error} message={error} />
        <div className="flex gap-3">
          {step > 0 && <Button variant="outline" onClick={() => go(step - 1)}><ArrowLeft size={16} aria-hidden /> Back</Button>}
          {last ? (
            <Button variant="success" loading={saving} onClick={onFinish} className="flex-1 py-3">{saving ? 'Saving…' : 'Save and continue'}</Button>
          ) : (
            <Button disabled={!form.experienceLevel} onClick={() => go(step + 1)} className="flex-1 py-3">Continue <ArrowRight size={16} aria-hidden /></Button>
          )}
        </div>
      </div>
    </div>
  )
}

type ProfileTab = 'about' | 'resume' | 'refer'

export default function ProfilePage({ me }: { me: Me }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const { data, isError, refetch } = useQuery(profileQuery)
  const { data: resumeInfo } = useQuery(resumeQuery)
  const [draft, setDraft] = useState<ProfileData | null>(null)
  const form = draft ?? data
  const dirty = Boolean(draft && data && JSON.stringify(draft) !== JSON.stringify(data))

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const save = useMutation({
    mutationFn: (p: ProfileData) =>
      api('/api/me/profile', {
        method: 'PUT',
        body: {
          pitch: p.pitch ?? '',
          experienceLevel: p.experienceLevel,
          skills: p.skills,
          rolesWanted: p.rolesWanted,
          githubUrl: p.githubUrl ?? '',
          linkedinUrl: p.linkedinUrl ?? '',
          portfolioUrl: p.portfolioUrl ?? '',
          phoneNumber: p.phoneNumber ?? '',
          hideFromMyCompany: p.hideFromMyCompany,
        },
      }),
    onSuccess: async (_, submitted) => {
      if (!me.hasProfile) {
        celebrate()
        success('Your profile is ready', 'Pick a company to ask for a referral.')
        qc.setQueryData(meQuery.queryKey, (old) => (old ? { ...old, hasProfile: true } : old))
        void navigate('/companies')
        void qc.invalidateQueries({ queryKey: meQuery.queryKey })
        void qc.invalidateQueries({ queryKey: profileQuery.queryKey })
        return
      }
      success('Profile saved')
      void qc.invalidateQueries({ queryKey: meQuery.queryKey })
      await qc.invalidateQueries({ queryKey: profileQuery.queryKey })
      // Keep anything typed while the save was in flight.
      setDraft((current) => (current === submitted ? null : current))
    },
    onError: (error) => {
      if (me.hasProfile) failure(error)
    },
  })

  if (!form) {
    return isError
      ? <ErrorNote message="Could not load your profile." onRetry={() => void refetch()} />
      : <><PageTitle title="Your profile" /><SkeletonList /></>
  }

  const set: SetField = (key, value) => setDraft((current) => ({ ...(current ?? form), [key]: value }))
  const submit = () => {
    if (!save.isPending) save.mutate(form)
  }

  if (!me.hasProfile) {
    return <Onboarding me={me} form={form} set={set} onFinish={submit} saving={save.isPending} error={save.error?.message ?? null} />
  }

  const requested = params.get('tab')
  const tab: ProfileTab = requested === 'resume' || requested === 'refer' ? requested : 'about'
  const strength = strengthOf(form, Boolean(resumeInfo))
  const percent = Math.round(strength.value * 100)

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        title="Your profile"
        subtitle="Keep it short and honest. Referrers see this when they scan your badge."
        action={
          <ProgressRing value={strength.value} size={68} color={strength.value === 1 ? 'var(--color-ggreen)' : 'var(--color-gblue)'}>
            <span className="text-sm font-extrabold"><AnimatedNumber value={percent} />%</span>
            <span className="sr-only">profile strength</span>
          </ProgressRing>
        }
      />
      <p className="-mt-2 mb-4 text-sm font-semibold" aria-live="polite">
        {strength.next ? <span className="text-primary">Next: {strength.next}</span> : <span className="text-success">Your profile is complete. Nicely done.</span>}
      </p>

      <Segmented<ProfileTab>
        id="profile"
        label="Profile sections"
        className="mb-4"
        value={tab}
        onChange={(next) => setParams(next === 'about' ? {} : { tab: next }, { replace: true })}
        segments={[
          { value: 'about', label: 'About', icon: UserRound },
          { value: 'resume', label: 'Resume', icon: FileText },
          { value: 'refer', label: 'Refer', icon: HandHeart },
        ]}
      />

      <div key={tab} id={`profile-${tab}-panel`} role="tabpanel" aria-labelledby={`profile-${tab}-tab`}>
        {tab === 'about' && (
          <form
            id="profile-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
            className="space-y-4"
          >
            <Card><p className="mb-3 text-sm font-bold">Experience</p><LevelPicker form={form} set={set} /></Card>
            <Card index={1}><p className="mb-3 text-sm font-bold">Looking for</p><ChipPicker label="Looking for" options={LOOKING_FOR} value={form.rolesWanted} onChange={(v) => set('rolesWanted', v)} max={6} /></Card>
            <Card index={2}><p className="mb-3 text-sm font-bold">Skills</p><ChipPicker label="Skills" options={SKILLS} value={form.skills} onChange={(v) => set('skills', v)} max={12} /></Card>
            <Card index={3}><PitchField form={form} set={set} /></Card>
            <Card index={4}><LinkFields form={form} set={set} /></Card>
            <Card index={5}><PrivacyField form={form} set={set} /></Card>
          </form>
        )}
        {tab === 'resume' && <ResumeCard />}
        {tab === 'refer' && <ReferrerSection />}
      </div>

      <AnimatePresence>
        {dirty && (
          <m.div
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="sticky bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-20 mt-4 flex items-center gap-2 rounded-full glass glass-dense p-2 pl-5 lg:bottom-6"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Unsaved<span className="hidden sm:inline"> changes</span></span>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setDraft(null)} className="!px-4">Discard</Button>
            <Button loading={save.isPending} onClick={submit}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
