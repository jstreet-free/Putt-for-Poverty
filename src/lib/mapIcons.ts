import L from 'leaflet';

export interface PlayerPin {
  id: string;
  name: string;
  avatarUrl?: string;
  golfClub?: string;
  lat: number;
  lng: number;
  updatedAt?: string;
  isSelf: boolean;
}

// Leaflet's divIcon injects `html` as raw innerHTML, so anything
// user-controlled going into it (name, avatar URL) must be escaped here —
// this is the one place in the app that builds HTML from a string rather
// than JSX, which auto-escapes.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createAvatarIcon(pin: PlayerPin) {
  const ring = pin.isSelf ? '#f59e0b' : '#10b981';
  const inner = pin.avatarUrl
    ? `<img src="${escapeHtml(pin.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${ring};color:#fff;font-weight:800;font-size:16px;font-family:system-ui,sans-serif;">${escapeHtml((pin.name?.[0] || '?').toUpperCase())}</div>`;

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;width:46px;height:56px;">
        <div style="width:44px;height:44px;border-radius:9999px;overflow:hidden;border:3px solid ${ring};box-shadow:0 4px 12px rgba(15,23,42,0.35);background:#fff;">
          ${inner}
        </div>
        <div style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:10px solid ${ring};"></div>
      </div>
    `,
    iconSize: [46, 56],
    iconAnchor: [23, 56],
    popupAnchor: [0, -52],
  });
}

export function formatLastUpdated(updatedAt?: string): string {
  if (!updatedAt) return 'just now';
  const diff = Date.now() - new Date(updatedAt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr ago`;
}
