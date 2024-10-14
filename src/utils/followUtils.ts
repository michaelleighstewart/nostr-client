import { SimplePool, nip19, getPublicKey } from "nostr-tools";
import { finalizeEvent } from "nostr-tools";
import { bech32Decoder } from "./helperFunctions";
import { RELAYS } from "./constants";
import { API_URLS } from "./apiConstants";
import { showCustomToast } from "../components/CustomToast";

export const handleFollow = async (
  pool: SimplePool | null,
  nostrExists: boolean,
  keyValue: string,
  pubkeyToFollow: string,
  isFollowing: boolean,
  followingList: string[]
): Promise<boolean> => {
  if (!pool) return false;

  const pkDecoded = nip19.decode(pubkeyToFollow).data as string;

  const event = {
    kind: 3,
    created_at: Math.floor(Date.now() / 1000),
    tags: isFollowing
      ? followingList.filter(pk => pk !== pkDecoded.toString()).map(pk => ['p', pk])
      : [...followingList.map(pk => ['p', pk]), ['p', pkDecoded.toString()]],
    content: '',
  };

  try {
    if (nostrExists) {
      const signedEvent = await (window as any).nostr.signEvent(event);
      await pool.publish(RELAYS, signedEvent);
    } else {
      const skDecoded = bech32Decoder("nsec", keyValue);
      const signedEvent = finalizeEvent(event, skDecoded);
      await pool.publish(RELAYS, signedEvent);
    }

    const currentUserPubkey = nostrExists 
      ? await (window as any).nostr.getPublicKey()
      : getPublicKey(bech32Decoder("nsec", keyValue));

    const response = await fetch(API_URLS.API_URL + 'batch-processor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'social_graph_processor',
        params: {
          npub: nip19.npubEncode(currentUserPubkey),
          [isFollowing ? 'to_remove' : 'to_create']: pubkeyToFollow,
          fill_missing: false
        }
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to call batch-processor API');
    }

    showCustomToast(`Successfully ${isFollowing ? 'unfollowed' : 'followed'} user!`);
    return true;
  } catch (error) {
    console.error(`Error ${isFollowing ? 'unfollowing' : 'following'} user or calling batch-processor API:`, error);
    showCustomToast(`Failed to ${isFollowing ? 'unfollow' : 'follow'} user. Please try again.`, "error");
    return false;
  }
};