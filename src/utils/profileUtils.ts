import { getPublicKey, SimplePool } from "nostr-tools";
import { bech32Decoder } from "./helperFunctions";
import { RELAYS } from "./constants";
import { Metadata } from "./interfaces";
import { getMetadataFromCache, setMetadataToCache } from './cachingUtils';

export const getFollowing = async (pool: SimplePool, isLoggedIn: boolean, nostrExists: boolean | null, keyValue: string | null, 
  setUserPublicKey: (pk: string) => void, publicKeyOverride: string | null): Promise<string[]> => {
    if (!isLoggedIn) return [];
      
    let pk: string = publicKeyOverride ?? "";
    let followers: string[] = [];
    if (!publicKeyOverride) {
      if (nostrExists) { 
        try {
          pk = await (window as any).nostr.getPublicKey();
        }
        catch (error) {
          console.log("Error getting public key: ", error);
        }
      }
      else {
        const sk = keyValue;
        if (!sk) {
          return [];
        }
        let skDecoded = bech32Decoder('nsec', sk);
        pk = getPublicKey(skDecoded);
      }
    }
    else {
    if (publicKeyOverride.startsWith('npub')) {
      try {
        pk = bech32Decoder('npub', publicKeyOverride).toString('hex');
      } catch (error) {
        console.error("Error decoding npub:", error);
        return [];
      }
    } else {
      pk = publicKeyOverride;
    }
    }
    if (pk && !followers.includes(pk)) followers.push(pk);
    setUserPublicKey(pk);
    return new Promise((resolve) => {
      pool.subscribeManyEose(
        RELAYS,
        [{ authors: [pk], kinds: [3] }],
        {
          onevent(event) {
            followers.push(...event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]));
            resolve(followers);
          },
          onclose() {
            resolve(followers);
          }
        }
      );
    });
}

export const fetchUserMetadata = async (pool: SimplePool | null, userPublicKey: string, 
  setShowOstrich: (show: boolean) => void, setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>) => {
  if (!pool || !userPublicKey) return;

    // Check cache first
    const cachedMetadata = getMetadataFromCache(userPublicKey);
    if (cachedMetadata) {
      setMetadata(prevMetadata => ({
        ...prevMetadata,
        [userPublicKey]: cachedMetadata
      }));
      return;
    }

  const events = await pool.querySync(RELAYS, {
    kinds: [0],
    authors: [userPublicKey],
  });

  if (events.length > 0) {
    const event = events[0];
    const metadata = JSON.parse(event.content) as Metadata;
    setMetadata((cur) => ({
      ...cur,
      [userPublicKey]: metadata,
    }));
    setMetadataToCache(userPublicKey, metadata);

    if (!metadata.name) {
      setShowOstrich(true);
    }
  } else {
    setShowOstrich(true);
  }
};