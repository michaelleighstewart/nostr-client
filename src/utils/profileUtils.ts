import { getPublicKey, SimplePool } from "nostr-tools";
import { bech32Decoder } from "./helperFunctions";
import { RELAYS } from "./constants";
import { ExtendedEvent, Metadata, Reaction, ProfileData } from "./interfaces";

export const getFollowers = async (pool: SimplePool, isLoggedIn: boolean, nostrExists: boolean | null, keyValue: string | null, 
  setUserPublicKey: (pk: string) => void): Promise<string[]> => {
    if (!isLoggedIn) return [];
      
    let pk: string = "";
    let followers: string[] = [];
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
    if (pk && !followers.includes(pk)) followers.push(pk);
    setUserPublicKey(pk);
    /*return new Promise((resolve) => {
      pool.subscribeManyEose(
        RELAYS,
        [{ authors: [pk], kinds: [3] }],
        {
          onevent(event: Event) {
            followers.push(...event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]));
            resolve(followers);
          },
          onclose() {
            resolve(followers);
          }
        }
      );
    });*/
    const followersRet = await pool.querySync(RELAYS, { authors: [pk], kinds: [3] });
    //return followersRet.map(follower => follower.pubkey);
    if (followersRet.length > 0) {
      const firstEvent = followersRet[0];
      return firstEvent.tags.map(tag => tag[1]);
    }
    return followers;
}

export const fetchUserMetadata = async (pool: SimplePool | null, userPublicKey: string, 
  setShowOstrich: (show: boolean) => void, setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>) => {
  if (!pool || !userPublicKey) return;

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

    if (!metadata.name) {
      setShowOstrich(true);
    }
  } else {
    setShowOstrich(true);
  }
};