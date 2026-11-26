import { useQuery } from '@tanstack/react-query'
import { Maximize2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'
import { type Me } from '../api'
import { haptic } from '../feedback'
import { badgeQuery } from '../queries'
import { Avatar, Card, Chip, ErrorNote, PageTitle, Sheet } from '../ui'

export default function BadgePage({ me }: { me: Me }) {
  const { data, isPending, isError, refetch } = useQuery(badgeQuery)
  const [enlarged, setEnlarged] = useState(false)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  if (isError) return <ErrorNote message="Could not load your badge." onRetry={() => void refetch()} />

  // The QR holds a link with a random token only, never your user id.
  const link = data ? `${window.location.origin}/b/${data.token}` : ''

  return (
    <div className="mx-auto max-w-md">
      <PageTitle title="Your badge" subtitle="Show this at the event. Referrers scan it to open your profile." />
      <div
        className="[perspective:900px]"
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return
          const box = event.currentTarget.getBoundingClientRect()
          setTilt({
            x: ((event.clientY - box.top) / box.height - 0.5) * -9,
            y: ((event.clientX - box.left) / box.width - 0.5) * 9,
          })
        }}
        onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      >
        <div
          className="transition-transform duration-200 ease-out motion-reduce:!transform-none"
          style={{ transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}
        >
          <Card className="relative flex flex-col items-center gap-4 overflow-hidden py-8 text-center">
            <span aria-hidden className="absolute inset-x-0 top-0 grid h-2 grid-cols-4">
              <span className="bg-gblue" /><span className="bg-gred" /><span className="bg-gyellow" /><span className="bg-ggreen" />
            </span>
            {isPending || !data ? (
              <span role="status" aria-label="Loading" className="skeleton h-60 w-60 rounded-3xl" />
            ) : (
              <button
                type="button"
                aria-label="Show a larger QR code"
                onClick={() => {
                  haptic()
                  setEnlarged(true)
                }}
                className="press relative overflow-hidden rounded-[1.75rem] p-1.5"
              >
                <span aria-hidden className="brand-ring absolute -inset-1/2" />
                <span className="relative block rounded-3xl bg-[#fff] p-4"><QRCodeSVG value={link} size={208} fgColor="#202124" bgColor="#ffffff" /></span>
              </button>
            )}
            <div className="flex items-center gap-3">
              <Avatar name={data?.name ?? me.name} />
              <p className="text-xl font-extrabold">{data?.name ?? me.name}</p>
            </div>
            <div className="flex gap-2">
              <Chip tone={0}>Seeker</Chip>
              {me.isReferrer && <Chip tone={3}>Referrer</Chip>}
            </div>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Maximize2 size={14} aria-hidden /> Tap the code to enlarge it</p>
            <p className="max-w-[260px] text-xs text-muted">This code holds only a random token, so it never reveals your account details.</p>
          </Card>
        </div>
      </div>
      <Sheet open={enlarged && Boolean(data)} title={data?.name ?? me.name} subtitle="Turn your brightness up for a faster scan." onClose={() => setEnlarged(false)}>
        <div className="rounded-3xl bg-[#fff] p-5"><QRCodeSVG value={link} size={512} fgColor="#202124" bgColor="#ffffff" className="h-auto w-full" /></div>
      </Sheet>
    </div>
  )
}
