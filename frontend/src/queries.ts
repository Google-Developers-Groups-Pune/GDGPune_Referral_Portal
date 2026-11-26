import { queryOptions } from '@tanstack/react-query'
import {
  api,
  fetchMe,
  fetchNotifications,
  fetchUnreadCount,
  type Badge,
  type Companies,
  type Profile,
  type ReferralRequestInboxItem,
  type ReferrerSettings,
  type ResumeInfo,
  type SeekerReferralRequest,
} from './api'

/** Every query in one place, so pages and hover-prefetching always share the same cache entry. */
export const meQuery = queryOptions({ queryKey: ['me'], queryFn: fetchMe })

export const companiesQuery = queryOptions({
  queryKey: ['companies'],
  queryFn: () => api<Companies>('/api/companies'),
})

export const profileQuery = queryOptions({
  queryKey: ['profile'],
  queryFn: () => api<Profile>('/api/me/profile'),
})

export const resumeQuery = queryOptions({
  queryKey: ['resume-info'],
  queryFn: async () => (await api<ResumeInfo | null>('/api/me/resume/info')) ?? null,
})

export const referrerSettingsQuery = queryOptions({
  queryKey: ['referrer-settings'],
  queryFn: () => api<ReferrerSettings>('/api/referrer/settings'),
})

export const badgeQuery = queryOptions({
  queryKey: ['badge'],
  queryFn: () => api<Badge>('/api/me/badge'),
  staleTime: Infinity,
})

export const sentRequestsQuery = queryOptions({
  queryKey: ['seeker-referral-requests'],
  queryFn: () => api<SeekerReferralRequest[]>('/api/referral-requests'),
})

export const inboxQuery = queryOptions({
  queryKey: ['referral-request-inbox'],
  queryFn: () => api<ReferralRequestInboxItem[]>('/api/referral-requests/inbox'),
})

export const unreadQuery = queryOptions({
  queryKey: ['notifications', 'unread-count'],
  queryFn: fetchUnreadCount,
})

export const notificationsQuery = queryOptions({
  queryKey: ['notifications', 'list'],
  queryFn: fetchNotifications,
})
