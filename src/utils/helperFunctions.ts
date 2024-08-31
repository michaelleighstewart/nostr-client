import { bech32 } from 'bech32';
import { Buffer } from 'buffer';
import { RELAYS } from "../utils/constants";
import { LightningAddress } from "@getalby/lightning-tools";
import { SimplePool, getPublicKey, finalizeEvent } from "nostr-tools";
import { Reaction } from "../components/Home";

export interface User {
    name: string;
    image: string | undefined;
    pubkey: string;
    nip05: string | undefined;
}

export type ExtendedEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  deleted: boolean;
  content: string;
  tags: string[][];
}

export function insertEventIntoDescendingList<T extends ExtendedEvent>(
  sortedArray: T[],
  event: T
) {
  let start = 0;
  let end = sortedArray.length - 1;
  let midPoint;
  let position = start;

    if (end < 0) {
      position = 0;
    } else if (event.created_at < sortedArray[end].created_at) {
      position = end + 1;
    } else if (event.created_at >= sortedArray[start].created_at) {
      position = start;
    } else
      while (true) {
        if (end <= start + 1) {
          position = end;
          break;
        }
        midPoint = Math.floor(start + (end - start) / 2);
        if (sortedArray[midPoint].created_at > event.created_at) {
          start = midPoint;
        } else if (sortedArray[midPoint].created_at < event.created_at) {
          end = midPoint;
        } else {
          position = midPoint;
          break;
        }
      }
  if (sortedArray[position]?.id !== event.id) {
    return [
      ...sortedArray.slice(0, position),
      event,
      ...sortedArray.slice(position),
    ];
  }

  return sortedArray;
}

export function bech32Decoder(currPrefix: string, data: string) {
  const { prefix, words } = bech32.decode(data);
  if (prefix !== currPrefix) {
      throw Error('Invalid address format');
  }
  return Buffer.from(bech32.fromWords(words));
}

export async function sendZap(user: User, id: string) {
  if (user.nip05) {
    const ln = new LightningAddress(user.nip05);
    await ln.fetch();
    const event = {
        satoshi: 10,
        comment: "Awesome post!",
        relays: RELAYS,
        e: id
    };
    await ln.zap(event);
  }
}

//NIP-25: https://github.com/nostr-protocol/nips/blob/master/25.md
export async function reactToPost(user: User, id: string, pool: SimplePool | null, nostrExists: boolean, reaction: string, publicKey: string | null, keyValue: string | null): Promise<Reaction | null> {
  const event = {
    kind: 7,
    created_at: Math.floor(Date.now() / 1000),
    content: reaction,
    tags: [
      ['e', id],
      ['p', user.pubkey],
    ],
  };
  if (nostrExists) {
    try {
      const signedEvent = await (window as any).nostr.signEvent(event);
      await pool?.publish(RELAYS, signedEvent);
      return {
        liker_pubkey: publicKey ?? "",
        type: reaction,
        sig: signedEvent.sig,
      };
    } catch {
      console.log("Unable to react to post");
    }
  }
  else {
    try {
      let sk = keyValue ?? "";
      let skDecoded = bech32Decoder('nsec', sk);
      let pk = getPublicKey(skDecoded);
      let eventFinal = finalizeEvent(event, skDecoded);
      await pool?.publish(RELAYS, eventFinal);
      return {
        liker_pubkey: pk,
        type: reaction,
        sig: eventFinal.sig,
      };
    } catch {
      console.log("Unable to react to post");
    }
  }
  return null;
}

//NIP-09: https://github.com/nostr-protocol/nips/blob/master/09.md
export async function deletePost(id: string, pool: SimplePool | null, nostrExists: boolean, keyValue: string | null) {
  const event = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    content: "Post deleted",
    tags: [
      ['e', id],
      ['k', '1']
    ],
  };
  if (nostrExists) {
    try {
      const signedEvent = await (window as any).nostr.signEvent(event);
      await pool?.publish(RELAYS, signedEvent);
      return {
        success: true,
      };
    } catch {
      console.log("Unable to delete post");
    }
  }
  else {
    try {
      let sk = keyValue ?? "";
      let skDecoded = bech32Decoder('nsec', sk);
      let eventFinal = finalizeEvent(event, skDecoded);
      await pool?.publish(RELAYS, eventFinal);
      return {
        success: true,
      };
    } catch {
      console.log("Unable to delete post");
    }
  }
  return {
    success: false,
  }
}
