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
  participantId: string;
  name: string;
  points: number;
  submittedAt: any;
  golfClub: string;
}
