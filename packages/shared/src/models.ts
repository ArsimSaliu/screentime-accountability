import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

export type Profile = Tables['profiles']['Row'];
export type Partnership = Tables['partnerships']['Row'];
export type Limit = Tables['limits']['Row'];
export type ExtensionRequest = Tables['extension_requests']['Row'];
export type RequestVote = Tables['request_votes']['Row'];
export type TamperEvent = Tables['tamper_events']['Row'];

export type LimitKind = Database['public']['Enums']['limit_kind'];
export type Strictness = Database['public']['Enums']['strictness'];
export type RequestStatus = Database['public']['Enums']['request_status'];
export type VoteDecision = 'approve' | 'deny';

/** Minimal public view of a user, as embedded in joined queries. */
export type ProfileSummary = Pick<Profile, 'id' | 'username' | 'display_name'>;

/** extension_requests row with requester + limit + votes embedded. */
export type RequestWithDetails = ExtensionRequest & {
  requester: ProfileSummary | null;
  limit: Pick<Limit, 'id' | 'name' | 'kind' | 'minutes' | 'strictness'> | null;
  votes: (Pick<RequestVote, 'voter_id' | 'decision' | 'comment' | 'created_at'> & {
    voter: ProfileSummary | null;
  })[];
};

/** PostgREST select string producing RequestWithDetails. */
export const REQUEST_DETAILS_SELECT = `
  *,
  requester:profiles!extension_requests_requester_id_fkey(id, username, display_name),
  limit:limits(id, name, kind, minutes, strictness),
  votes:request_votes(voter_id, decision, comment, created_at, voter:profiles(id, username, display_name))
` as const;

/** partnerships row with both sides embedded. */
export type PartnershipWithProfiles = Partnership & {
  owner: ProfileSummary | null;
  partner: ProfileSummary | null;
};

export const PARTNERSHIP_SELECT = `
  *,
  owner:profiles!partnerships_owner_id_fkey(id, username, display_name),
  partner:profiles!partnerships_partner_id_fkey(id, username, display_name)
` as const;

/** iOS notification category used for Approve/Deny action buttons. */
export const TIME_REQUEST_CATEGORY = 'TIME_REQUEST';
export const NOTIFICATION_ACTION_APPROVE = 'APPROVE';
export const NOTIFICATION_ACTION_DENY = 'DENY';

/** Data payload attached to push notifications. */
export type PushData =
  | { kind: 'request_created'; requestId: string }
  | { kind: 'request_resolved'; requestId: string; status: RequestStatus; minutesGranted: number | null }
  | { kind: 'invite_received'; partnershipId: string }
  | { kind: 'invite_accepted'; partnershipId: string }
  | { kind: 'limit_loosening'; limitId: string }
  | { kind: 'partner_removal'; partnershipId: string }
  | { kind: 'tamper'; eventId: string };

/** A queued loosening of a limit (applied by the server 24 h after it was requested). */
export type PendingLimitChange = {
  delete?: boolean;
  minutes?: number;
  approvals_required?: number;
  strictness?: Strictness;
  active?: boolean;
  kind?: LimitKind;
};

export const EMERGENCY_MAX_MINUTES = 15;

export const REQUEST_MINUTE_OPTIONS = [5, 10, 15, 30, 60] as const;

export const STRICTNESS_INFO: Record<Strictness, { label: string; description: string }> = {
  relaxed: { label: 'Relaxed', description: 'Any one partner can approve.' },
  standard: { label: 'Standard', description: 'The number of approvals you choose.' },
  strict: { label: 'Strict', description: 'A majority of partners must approve within 15 minutes.' },
  locked: { label: 'Locked', description: 'No extensions at all.' },
};
