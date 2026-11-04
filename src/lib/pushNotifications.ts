import { getApp } from 'firebase/app';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { db } from './firebase';

export type PushStatus = 'enabled' | 'available' | 'blocked' | 'needs-install' | 'unsupported';

function isIos(): boolean {
  // iPads report themselves as Macs, but Macs don't have touchscreens.
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export async function getPushStatus(): Promise<PushStatus> {
  // iOS only offers web push to sites added to the Home Screen.
  if (isIos() && !isInstalled()) return 'needs-install';
  if (!(await isSupported())) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' ? 'enabled' : 'available';
}

// Safe to repeat: tokens rotate, and this also moves the device over to
// whoever is signed in now. Needs notification permission first.
export async function registerDevice(uid: string): Promise<void> {
  const serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(getApp()), {
    serviceWorkerRegistration,
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
  });
  await setDoc(doc(db, 'pushTokens', token), { uid, updatedAt: serverTimestamp() });
}

// Must be called from a tap: browsers refuse the permission prompt otherwise.
export async function enablePush(uid: string): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') await registerDevice(uid);
  return getPushStatus();
}
