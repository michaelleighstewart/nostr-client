import { Metadata } from './interfaces';
import { ExtendedEvent } from './interfaces';

const NOTES_CACHE_KEY_PREFIX = 'cachedNotes';
const ONE_DAY = 24 * 60 * 60 * 1000;
//const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const METADATA_CACHE_KEY = 'nostr_metadata_cache';
const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const COUNTS_CACHE_KEY = 'nostr_counts_cache';
const ONE_HOUR = 60 * 60 * 1000;

interface CachedCounts {
  reactions: number;
  reposts: number;
  replies: number;
  timestamp: number;
}

export function getMetadataFromCache(pubkey: string): Metadata | null {
  const cachedData = localStorage.getItem(METADATA_CACHE_KEY);
  if (cachedData) {
    const parsedCache = JSON.parse(cachedData);
    const cachedMetadata = parsedCache[pubkey];
    if (cachedMetadata && Date.now() - cachedMetadata.timestamp < CACHE_EXPIRY_TIME) {
      return cachedMetadata.data;
    }
  }
  return null;
}

export function setMetadataToCache(pubkey: string, metadata: Metadata): void {
  const cachedData = localStorage.getItem(METADATA_CACHE_KEY);
  const parsedCache = cachedData ? JSON.parse(cachedData) : {};
  parsedCache[pubkey] = {
    data: metadata,
    timestamp: Date.now()
  };
  localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(parsedCache));
}

function getNotesCacheKey(algoId: string | null): string {
  return `${NOTES_CACHE_KEY_PREFIX}_${algoId || 'none'}`;
}

export function cacheNotes(notes: ExtendedEvent[], algoId: string | null): void {
  const currentTime = Date.now();
  const notesToCache = notes.filter(note => (currentTime - note.created_at * 1000) <= ONE_DAY);
  localStorage.setItem(getNotesCacheKey(algoId), JSON.stringify(notesToCache));
}

export function getCachedNotes(algoId: string | null): ExtendedEvent[] {
  const cachedNotesString = localStorage.getItem(getNotesCacheKey(algoId));
  if (!cachedNotesString) return [];

  const cachedNotes: ExtendedEvent[] = JSON.parse(cachedNotesString);
  const currentTime = Date.now();
  return cachedNotes.filter(note => (currentTime - note.created_at * 1000) <= ONE_DAY);
}

export function clearCachedNotes(algoId: string | null): void {
  localStorage.removeItem(getNotesCacheKey(algoId));
}

export function clearCachedNotesOlderThanOneDay(algoId: string | null): void {
  const cachedNotesString = localStorage.getItem(getNotesCacheKey(algoId));
  if (!cachedNotesString) return;

  const cachedNotes: ExtendedEvent[] = JSON.parse(cachedNotesString);
  const currentTime = Date.now();
  const updatedNotes = cachedNotes.filter(note => (currentTime - note.created_at * 1000) <= ONE_DAY);

  if (updatedNotes.length < cachedNotes.length) {
    localStorage.setItem(getNotesCacheKey(algoId), JSON.stringify(updatedNotes));
  }
}

export function getCachedCounts(noteId: string): CachedCounts | null {
  const cachedData = localStorage.getItem(COUNTS_CACHE_KEY);
  if (cachedData) {
    const parsedCache = JSON.parse(cachedData);
    const cachedCounts = parsedCache[noteId];
    if (cachedCounts && Date.now() - cachedCounts.timestamp < ONE_HOUR) {
      return cachedCounts;
    }
  }
  return null;
}

export function setCachedCounts(noteId: string, counts: CachedCounts): void {
  const cachedData = localStorage.getItem(COUNTS_CACHE_KEY);
  const parsedCache = cachedData ? JSON.parse(cachedData) : {};
  parsedCache[noteId] = {
    ...counts,
    timestamp: Date.now()
  };
  localStorage.setItem(COUNTS_CACHE_KEY, JSON.stringify(parsedCache));
}

export function updateCachedCounts(noteId: string, newCounts: Partial<CachedCounts>): void {
  const cachedData = localStorage.getItem(COUNTS_CACHE_KEY);
  const parsedCache = cachedData ? JSON.parse(cachedData) : {};
  const existingCounts = parsedCache[noteId] || { reactions: 0, reposts: 0, replies: 0, timestamp: Date.now() };
  parsedCache[noteId] = {
    ...existingCounts,
    ...newCounts,
    timestamp: Date.now()
  };
  localStorage.setItem(COUNTS_CACHE_KEY, JSON.stringify(parsedCache));
}