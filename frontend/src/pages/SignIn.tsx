import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { api, apiOrigin } from '../api'
import { ParticleField } from '../effects'
import { haptic, success } from '../feedback'
import { Button, Card, ErrorNote, Logo, OtpInput, Segmented } from '../ui'

type Mode = 'login' | 'register'

/** Grows and shrinks its content instead of popping it in. */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="-mx-1 overflow-hidden px-1"
        >
          <div className="pb-3">{children}</div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

export default function SignIn({ loginError }: { loginError: boolean }) {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [registrationCode, setRegistrationCode] = useState('')
  const [registrationStarted, setRegistrationStarted] = useState(false)
  const autoSubmitted = useRef('')

  useEffect(() => {
    void api<void>('/api/auth/csrf').catch(() => undefined)
  }, [])

  const finishAuthentication = async () => {
    await qc.invalidateQueries({ queryKey: ['me'] })
    window.location.assign('/')
  }

  const authenticate = useMutation({
    mutationFn: () => api<void>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
    onSuccess: finishAuthentication,
  })
  const beginRegistration = useMutation({
    mutationFn: () => api<void>('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    }),
    onSuccess: () => {
      if (registrationStarted) success('Code requested again', 'Use the newest code in your inbox.')
      setRegistrationStarted(true)
      setRegistrationCode('')
      autoSubmitted.current = ''
    },
  })
  const verifyRegistration = useMutation({
    mutationFn: (code: string) => api<void>('/api/auth/register/verify', {
      method: 'POST',
      body: { email, code, password },
    }),
    onSuccess: finishAuthentication,
  })
  const registrationPending = beginRegistration.isPending || verifyRegistration.isPending
  const busy = authenticate.isPending || registrationPending
  const errorMessage = mode === 'register'
    ? (verifyRegistration.error?.message ?? beginRegistration.error?.message)
    : authenticate.error?.message
  const registering = mode === 'register'
  const awaitingCode = registering && registrationStarted

  const restartRegistration = () => {
    setRegistrationStarted(false)
    setRegistrationCode('')
    autoSubmitted.current = ''
    beginRegistration.reset()
    verifyRegistration.reset()
  }

  const changeMode = (nextMode: Mode) => {
    setMode(nextMode)
    setShowPassword(false)
    restartRegistration()
    authenticate.reset()
  }

  const enterCode = (code: string) => {
    setRegistrationCode(code)
    // Submits once per distinct code: wrong attempts are limited, so it never retries by itself.
    if (code.length === 6 && autoSubmitted.current !== code && !registrationPending) {
      autoSubmitted.current = code
      verifyRegistration.mutate(code)
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[1080px] items-center gap-12 px-5 pb-8 pt-16 lg:grid-cols-[1fr_430px] lg:py-10">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        {[
          ['rgb(66 133 244 / 42%)', '-10%', '38%', '8vw', '-6vh'],
          ['rgb(234 67 53 / 30%)', '62%', '8%', '-6vw', '8vh'],
          ['rgb(251 188 4 / 34%)', '78%', '52%', '-9vw', '-7vh'],
          ['rgb(52 168 83 / 34%)', '38%', '68%', '7vw', '-9vh'],
        ].map(([orb, left, top, dx, dy], i) => (
          <span
            key={orb}
            className="orb h-[34rem] w-[34rem]"
            style={{ '--orb': orb, '--dx': dx, '--dy': dy, left, top, animationDelay: `${i * -3}s` } as CSSProperties}
          />
        ))}
        <ParticleField />
      </div>
      <section className="rise">
        <Logo />
        <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight lg:text-6xl">
          {['Make', 'good', 'things'].map((word, i) => (
            <span key={word}><span className="word-in" style={{ '--i': i } as CSSProperties}>{word}</span> </span>
          ))}
          <span className="google-text inline-block pb-1">together</span>.
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted lg:mt-5 lg:text-lg">
          DevFest Pune · 13 December. Find companies, request referral help, and support other seekers from one profile.
        </p>
        <ol className="mt-8 hidden space-y-4 lg:block">
          {[
            ['bg-gblue', 'Build one short profile'],
            ['bg-gyellow', 'Ask verified employees for a referral'],
            ['bg-ggreen', 'Track it through to confirmed'],
          ].map(([color, step], i) => (
            <li key={step} className="flex items-center gap-4 font-semibold">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-[#202124] ${color}`}>{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      <Card index={2} className="glass w-full max-w-[460px] justify-self-center lg:p-6">
        {loginError && <div className="mb-4"><ErrorNote message="Sign-in did not complete. Please try again." /></div>}

        <Segmented
          id="auth"
          label="Sign-in method"
          segments={[{ value: 'login', label: 'Sign in' }, { value: 'register', label: 'Register' }]}
          value={mode}
          onChange={changeMode}
        />

        <form
          id={`auth-${mode}-panel`}
          role="tabpanel"
          aria-labelledby={`auth-${mode}-tab`}
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (busy) return
            if (!registering) authenticate.mutate()
            else if (registrationStarted) verifyRegistration.mutate(registrationCode)
            else beginRegistration.mutate()
          }}
        >
          <Reveal show={registering && !awaitingCode}>
            <label className="text-sm font-semibold" htmlFor="auth-name">Name</label>
            <input id="auth-name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" className="field mt-1" />
          </Reveal>
          <Reveal show={!awaitingCode}>
            <label className="text-sm font-semibold" htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" required maxLength={190} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className="field mt-1" />
          </Reveal>
          <Reveal show={!awaitingCode}>
            <label className="text-sm font-semibold" htmlFor="auth-password">Password</label>
            <div className="relative mt-1">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={100}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={registering ? 'new-password' : 'current-password'}
                className="field pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-primary"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
            {registering && (
              <p className={`mt-1 text-xs transition-colors ${password.length >= 8 ? 'text-success' : 'text-muted'}`}>
                At least 8 characters; passwords must stay within 72 UTF-8 bytes.
              </p>
            )}
          </Reveal>
          <Reveal show={awaitingCode}>
            <label className="text-sm font-semibold" htmlFor="registration-code">Email verification code</label>
            <p className="mb-3 mt-1 text-xs text-muted">A code has been sent to <b className="text-ink">{email}</b>. It expires in 10 minutes.</p>
            <OtpInput id="registration-code" value={registrationCode} onChange={enterCode} disabled={registrationPending} />
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-semibold text-primary">
              <button type="button" disabled={registrationPending} onClick={() => { verifyRegistration.reset(); beginRegistration.mutate() }} className="press rounded-full py-2 disabled:opacity-60">Resend code</button>
              <button type="button" disabled={registrationPending} onClick={restartRegistration} className="press rounded-full py-2 disabled:opacity-60">Change details</button>
            </div>
          </Reveal>
          {errorMessage && <div className="pb-3"><ErrorNote key={errorMessage} message={errorMessage} /></div>}
          <Button
            type="submit"
            loading={busy}
            disabled={(registering && name.trim().length === 0) || (awaitingCode && registrationCode.length !== 6)}
            className="w-full py-3"
          >
            {busy
              ? 'Please wait…'
              : !registering
                ? 'Sign in'
                : registrationStarted
                  ? 'Verify email and create account'
                  : 'Send verification code'}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <div className="h-px flex-1 bg-line" />
          <span>or continue with</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <a
            href={`${apiOrigin}/oauth2/authorization/google`}
            aria-label="Continue with Google"
            onClick={() => haptic()}
            className="press flex min-h-12 items-center justify-center gap-2.5 rounded-full border border-line bg-raised text-sm font-semibold hover:shadow-card"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
              <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z" />
              <path fill="#FBBC04" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z" />
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
            </svg>
            Google
          </a>
          <a
            href={`${apiOrigin}/oauth2/authorization/github`}
            aria-label="Continue with GitHub"
            onClick={() => haptic()}
            className="press flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-[#24292f] text-sm font-semibold text-white hover:brightness-125"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white" aria-hidden>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            GitHub
          </a>
        </div>

        <p className="mt-4 text-xs text-muted">
          By continuing you agree to share your name and email so we can create your account. Contact details are shared for a referral only when you choose to share them.
        </p>
      </Card>
    </main>
  )
}
