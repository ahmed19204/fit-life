/**
 * FitLife Event System
 * Simple pub/sub for cross-page communication.
 * Used for auto-syncing dashboard/history when meals are saved,
 * profile updates, daily resets, etc.
 */

const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
  return () => off(event, callback);
}

export function off(event, callback) {
  if (listeners.has(event)) {
    listeners.get(event).delete(callback);
  }
}

export function emit(event, data) {
  if (listeners.has(event)) {
    listeners.get(event).forEach(cb => {
      try { cb(data); } catch (e) { console.warn(`[Events] Error in ${event} listener:`, e); }
    });
  }
}

// Standard events
export const EVENTS = {
  MEAL_SAVED: 'meal:saved',
  MEAL_DELETED: 'meal:deleted',
  PROFILE_UPDATED: 'profile:updated',
  DAY_CHANGED: 'day:changed',
  NAVIGATION: 'navigation',
};
