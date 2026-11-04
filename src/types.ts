export interface Participant {
  id: string;
  userId: string;
  name: string;
  email?: string;
  role?: 'user' | 'admin';
  golfClub: string;
  course: string;
  handicap: number;
  paidRounds: number;
  usedRounds: number;
  score?: number;
  avatarUrl?: string;
  location?: {
    lat: number;
    lng: number;
    label: string;
  };
  updatedAt: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logo: string;
  tagline: string;
  order: number;
}

export interface ScoreEntry {
  id?: string;
  participantId: string;
  name: string;
  points: number;
  submittedAt: any;
  golfClub: string;
  flagged?: boolean;
  flagReason?: string;
  moderatedAt?: string;
  moderatedBy?: string;
}

export interface AppUser {
  id: string;
  uid?: string;
  name?: string;
  email?: string;
  emailLower?: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'suspended';
  golfClub?: string;
  course?: string;
  handicap?: number;
  createdAt?: string;
  updatedAt?: string;
  location?: { label?: string; lat?: number; lng?: number };
  membershipProofUrl?: string;
  membershipProofFileName?: string;
  avatarUrl?: string;
  [key: string]: any;
}

export interface DailyAppStats {
  id: string; // date key, e.g. 2026-09-02
  date: string;
  totalVisits: number;
  uniqueVisitors?: number;
  roleBreakdown: {
    user: number;
    admin: number;
    public: number;
  };
  pageViews?: Record<string, number>;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  createdAt: string;
  createdBy?: string;
  pinned?: boolean;
}

export interface NewsletterSubscriber {
  id: string;
  name: string;
  email: string;
  subscribedAt: string;
}

export interface Newsletter {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  linkUrl?: string;
  linkText?: string;
  sentAt: string;
  recipientCount?: number;
}

export interface CommunityNeed {
  id: string;
  title: string;
  category: 'volunteers' | 'sponsorship' | 'equipment' | 'other';
  description: string;
  date: string;
  resolved?: boolean;
}

export interface AdminWarning {
  id: string;
  targetType: 'participant' | 'score' | 'sponsor' | 'general';
  targetId?: string;
  targetName?: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
  createdBy?: string;
  resolved?: boolean;
}

export type LobbyStatus = 'scheduled' | 'live' | 'finished' | 'expired';

// A golf course a par was taken from, as found from the player's location
// (see src/lib/clubLocator.ts). `id` is stable per OpenStreetMap course.
export interface ClubRef {
  id: string;
  name: string;
}

export interface Lobby {
  id: string;
  name: string;
  creatorId: string;
  creatorName: string;
  isClosed: boolean;
  eventDate: any; // Firestore Timestamp
  holes: 9 | 18;
  pars?: number[]; // one per hole; missing on lobbies created before pars existed (treated as all 4s)
  club?: ClubRef | null; // the course the event's par came from, if it was looked up
  status: LobbyStatus;
  startedAt?: any;
  finishedAt?: any;
  expiresAt: any; // when it should be expired/finished if nobody acts
  createdAt: any;
  updatedAt?: any;
}

export interface LobbyMember {
  id: string; // == userId
  userId: string;
  name: string;
  golfClub?: string;
  avatarUrl?: string;
  joinedAt: any;
  chargeStatus?: 'charged' | 'insufficient_credit' | 'no_participant_record';
  chargedAt?: any;
  // The player's own par, for when they're playing a different club from the
  // rest of the event. Missing = they play to the lobby's pars.
  pars?: number[];
  club?: ClubRef | null; // where that par came from (today's course, not their home golfClub)
}

export interface Scorecard {
  id: string; // == userId
  userId: string;
  name: string;
  avatarUrl?: string;
  strokes: Record<string, number>; // { "1": 4, "2": 5 }
  total: number;
  holesPlayed: number;
  updatedAt: any;
}

export type StandingStatus = 'finished' | 'playing' | 'dnf' | 'not_started';

export interface StandingRow {
  userId: string;
  name: string;
  avatarUrl?: string;
  total: number;        // strokes over the holes played
  holesPlayed: number;
  toPar: number;        // total strokes minus par for the same holes; 0 = "E"
  position: number | null; // null for DNF / not started (no place in the standings)
  status: StandingStatus;
  coursePar?: number;   // only set for a player on their own par: its total
  clubName?: string;    // ...and the club it came from, if known
}

export interface LobbyResult {
  lobbyId: string;
  lobbyName: string;
  eventDate: any;
  startedAt: any;
  finishedAt: any;
  holes: 9 | 18;
  standings: StandingRow[];
}

export interface HistoryEntry extends LobbyResult {
  myStatus: StandingStatus | 'spectator';
  myPosition: number | null;
  myTotal: number | null;
  myToPar: number | null;
  playerCount: number;
}

// Live GPS shared inside a lobby, only while its event is running.
export interface LobbyLocation {
  id: string; // == userId
  userId: string;
  lat: number;
  lng: number;
  updatedAt: any;
}

export interface EventSettings {
  dateLabel: string; 
  startDate?: string;
  endDate?: string; 
  updatedAt?: string;
  updatedBy?: string;
}