import { Metadata } from './interfaces';

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