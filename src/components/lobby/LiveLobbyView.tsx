import { useState } from 'react';
import { Lobby, LobbyMember } from '../../types';
import { Scorecard } from './Scorecard';
import { LobbyLeaderboard } from './LobbyLeaderboard';
import { LobbyMap } from './LobbyMap';
import { Trophy, MapPin, Target, Flag, Loader2 } from 'lucide-react';

type Tab = 'scorecard' | 'leaderboard' | 'map';

export function LiveLobbyView({ lobby, members, currentUser, isSpectator, canManage, onFinish, busy }: {
  lobby: Lobby;
  members: LobbyMember[];
  currentUser: { uid: string; name: string; avatarUrl?: string };
  isSpectator: boolean;
  canManage: boolean;
  onFinish: () => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<Tab>(isSpectator ? 'leaderboard' : 'scorecard');

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'scorecard', label: 'Scorecard', icon: Target },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'map', label: 'Map', icon: MapPin },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black uppercase transition-colors ${
              tab === t.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
            }`}
          >
            <t.icon size={13} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'scorecard' && (
        <Scorecard lobbyId={lobby.id} holes={lobby.holes} player={currentUser} isSpectator={isSpectator} />
      )}
      {tab === 'leaderboard' && (
        <LobbyLeaderboard lobbyId={lobby.id} currentUserId={currentUser.uid} />
      )}
      {tab === 'map' && (
        <LobbyMap lobbyId={lobby.id} members={members} currentUserId={currentUser.uid} />
      )}

      <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5 justify-center">
        <Flag size={12} />
        {lobby.holes}-hole round · lowest total wins
      </div>

      {canManage && (
        <button
          onClick={onFinish}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white p-3.5 rounded-2xl font-black text-sm uppercase hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Trophy size={16} />}
          {busy ? 'Finishing...' : 'Finish Event'}
        </button>
      )}
    </div>
  );
}
