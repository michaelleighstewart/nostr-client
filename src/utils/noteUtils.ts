import { SimplePool, Event } from "nostr-tools";
import { RELAYS } from "./constants";
import { Metadata, Reaction } from "../components/Home";
import { ExtendedEvent } from "./helperFunctions";

export const fetchMetadataReactionsAndReplies = async (pool: SimplePool, events: ExtendedEvent[], 
    setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>, 
    setReactions: React.Dispatch<React.SetStateAction<Record<string, Reaction[]>>>, 
    setReplies: React.Dispatch<React.SetStateAction<Record<string, number>>>) => {
        
    const pubkeysToFetch = new Set(events.map(event => event.pubkey));
    const postsToFetch = events.map(event => event.id);

    let sub: any;

    const cleanup = () => {
        if (sub) {
            sub.close();
        }
    };

    sub = pool?.subscribeManyEose(
        RELAYS,
        [
            { kinds: [0], authors: Array.from(pubkeysToFetch) },
            { kinds: [7], '#e': postsToFetch },
            { kinds: [1], '#e': postsToFetch }
        ],
        {
            onevent(event: Event) {
                if (event.kind === 0) {
                    const metadata = JSON.parse(event.content) as Metadata;
                    setMetadata(cur => ({
                        ...cur,
                        [event.pubkey]: metadata
                    }));
                } else if (event.kind === 7) {
                    setReactions(cur => {
                        const newReaction: Reaction = {
                            liker_pubkey: event.pubkey,
                            type: event.content,
                            sig: event.sig
                        };
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            const updatedReactions = { ...cur };
                            if (updatedReactions[postId]) {
                                if (!updatedReactions[postId].some(r => r.sig === newReaction.sig)) {
                                    updatedReactions[postId] = [...updatedReactions[postId], newReaction];
                                }
                            } else {
                                updatedReactions[postId] = [newReaction];
                            }
                            return updatedReactions;
                        }
                        return cur;
                    });
                } else if (event.kind === 1) {
                    setReplies(cur => {
                        const updatedReplies = { ...cur };
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            updatedReplies[postId] = (updatedReplies[postId] || 0) + 1;
                        }
                        return updatedReplies;
                    });
                }
            },
            onclose() {
            }
        }
    );

    return cleanup;
}