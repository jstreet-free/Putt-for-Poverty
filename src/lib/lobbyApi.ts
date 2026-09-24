import { auth } from './firebase';

// Thin client for the server-side lobby endpoints. Every lobby action that
// touches credits, membership, or lifecycle status goes through one of these
// — never a direct client write — so the server (via firebase-admin) is the
// only thing that can ever change usedRounds/paidRounds or a lobby's status.
async function post<T>(path: string, body: unknown): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function apiCreateLobby(input: { name: string; isClosed: boolean; eventDate: string; holes: 9 | 18 }) {
  return post<{ id: string; shareCode: string | null }>('/api/create-lobby', input);
}

export function apiJoinLobby(input: { lobbyId: string; code?: string }) {
  return post<{ ok: true; alreadyMember?: boolean }>('/api/join-lobby', input);
}

export function apiStartLobby(lobbyId: string) {
  return post<{ charged: number; skipped: number }>('/api/start-lobby', { lobbyId });
}

export function apiFinishLobby(lobbyId: string) {
  return post<{ standingsCount: number }>('/api/finish-lobby', { lobbyId });
}

export function apiDeleteLobby(lobbyId: string) {
  return post<{ ok: true }>('/api/delete-lobby', { lobbyId });
}
