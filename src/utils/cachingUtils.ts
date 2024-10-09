import { Metadata } from './interfaces';
import { ExtendedEvent } from './interfaces';

const NOTES_CACHE_KEY = 'cachedNotes';
const ONE_DAY = 24 * 60 * 60 * 1000;
//const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const METADATA_CACHE_KEY = 'nostr_metadata_cache';
const CACHE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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


export function cacheNotes(notes: ExtendedEvent[]): void {
  const currentTime = Date.now();
  const notesToCache = notes.filter(note => (currentTime - note.created_at * 1000) <= ONE_DAY);
  localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(notesToCache));
}

export function getCachedNotes(): ExtendedEvent[] {
  const cachedNotesString = localStorage.getItem(NOTES_CACHE_KEY);
  if (!cachedNotesString) return [];

  const cachedNotes: ExtendedEvent[] = JSON.parse(cachedNotesString);
  const currentTime = Date.now();
  return cachedNotes.filter(note => (currentTime - note.created_at * 1000) <= ONE_DAY);
}

export function clearCachedNotes(): void {
  localStorage.removeItem(NOTES_CACHE_KEY);
}

export function clearCachedNotesOlderThanOneDay(): void {
  const cachedNotesString = localStorage.getItem(NOTES_CACHE_KEY);
  if (!cachedNotesString) return;

  const cachedNotes: ExtendedEvent[] = JSON.parse(cachedNotesString);
  const currentTime = Date.now();
  const updatedNotes = cachedNotes.filter(note => (currentTime - note.created_at * 1000) <= ONE_DAY);

  if (updatedNotes.length < cachedNotes.length) {
    localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(updatedNotes));
  }
}