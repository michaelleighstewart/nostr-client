import { getPublicKey, SimplePool, Event } from "nostr-tools";
import { bech32Decoder } from "./helperFunctions";
import { RELAYS } from "./constants";

export const getFollowers = async (pool: SimplePool, isLoggedIn: boolean, nostrExists: boolean | null, keyValue: string): Promise<string[]> => {
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
    return new Promise((resolve) => {
      
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
    });
}