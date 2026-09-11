import { db, handleFirestoreError, OperationType } from './firebase';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { EventSettings } from '../types';

const SETTINGS_DOC = 'settings/event';

export const DEFAULT_EVENT_SETTINGS: EventSettings = {
  dateLabel: 'September 2nd - 3rd, 2026',
};

export function subscribeToEventSettings(cb: (settings: EventSettings) => void) {
  return onSnapshot(
    doc(db, SETTINGS_DOC),
    (snap) => {
      cb(snap.exists() ? { ...DEFAULT_EVENT_SETTINGS, ...(snap.data() as EventSettings) } : DEFAULT_EVENT_SETTINGS);
    },
    () => cb(DEFAULT_EVENT_SETTINGS)
  );
}

export async function getEventSettings(): Promise<EventSettings> {
  try {
    const snap = await getDoc(doc(db, SETTINGS_DOC));
    return snap.exists() ? { ...DEFAULT_EVENT_SETTINGS, ...(snap.data() as EventSettings) } : DEFAULT_EVENT_SETTINGS;
  } catch {
    return DEFAULT_EVENT_SETTINGS;
  }
}

export async function updateEventSettings(updates: Partial<EventSettings>, updatedBy?: string) {
  try {
    await setDoc(
      doc(db, SETTINGS_DOC),
      { ...updates, updatedAt: new Date().toISOString(), updatedBy: updatedBy || 'unknown' },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, SETTINGS_DOC);
  }
}