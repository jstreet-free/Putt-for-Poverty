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
  location?: {
    lat: number;
    lng: number;
    label: string;
  };
  currentLocation?: {
    lat: number;
    lng: number;
    label: string;
    updatedAt: string;
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
