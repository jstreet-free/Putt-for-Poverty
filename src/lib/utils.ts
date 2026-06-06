import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function calculatePoints(handicap: number, par: number, strokes: number, index: number): number {
  // Simplified points calculation
  // Gross score - (Net par adjustment)
  // Usually involves hole indices, but for a general app we can simplify or ask for net score
  // Points: 0 for 2 over net par, 1 for 1 over net par, 2 for net par, 3 for 1 under net par, etc.
  const netScore = strokes - (handicap / 18); // Basic net score simplification
  const diff = par - netScore;
  const points = diff + 2;
  return Math.max(0, Math.floor(points));
}
