import { SimplePool, Event } from "nostr-tools";
import { RELAYS } from "./constants";
import { ExtendedEvent, Metadata, Reaction } from "./interfaces";
import { getMetadataFromCache, setMetadataToCache } from "./cachingUtils";


export const fetchMetadataReactionsAndReplies = async (pool: SimplePool, events: ExtendedEvent[], 
    repostEvents: ExtendedEvent[],
    replyEvents: ExtendedEvent[],
    setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>, 
    setReactions: React.Dispatch<React.SetStateAction<Record<string, Reaction[]>>>, 
    setReplies: React.Dispatch<React.SetStateAction<Record<string, ExtendedEvent[]>>>,
    setReposts: React.Dispatch<React.SetStateAction<Record<string, ExtendedEvent[]>>>) => {
    
    const pubkeysToFetch = new Set(events.map(event => event.pubkey));
    const postsToFetch = events.map(event => event.id);
    const repostsToFetch: string[] = [];
    const repostPubkeysToFetch: string[] = [];
    for (const event of repostEvents) {
        if (!repostsToFetch.includes(event.id || "")) {
            repostsToFetch.push(event.id || "");
        }
        if (!repostPubkeysToFetch.includes(event.pubkey || "")) {
            repostPubkeysToFetch.push(event.pubkey || "");
        }
    }
    const replyIdsToFetch: string[] = [];
    const replyPubkeysToFetch: string[] = [];
    for (const event of replyEvents) {
        if (!replyIdsToFetch.includes(event.id || "")) {
            replyIdsToFetch.push(event.id || "");
        }
        if (!replyPubkeysToFetch.includes(event.pubkey || "")) {
            replyPubkeysToFetch.push(event.pubkey || "");
        }
    }
    repostPubkeysToFetch.forEach(pubkey => pubkeysToFetch.add(pubkey));
    const cachedMetadata: Record<string, Metadata> = {};
    const pubkeysToFetchFromNetwork: string[] = [];

    pubkeysToFetch.forEach(pubkey => {
        const cachedData = getMetadataFromCache(pubkey);
        if (cachedData) {
            cachedMetadata[pubkey] = cachedData;
        } else {
            pubkeysToFetchFromNetwork.push(pubkey);
        }
    });

    setMetadata(prevMetadata => ({...prevMetadata, ...cachedMetadata}));

    let sub: any;

    const cleanup = () => {
        if (sub) {
            sub.close();
        }
    };

    let allNewMetadata: Record<string, Metadata> = {...cachedMetadata};
    let allNewReactions: Record<string, Reaction[]> = {};
    let allNewReplies: Record<string, ExtendedEvent[]> = {};
    let allNewReposts: Record<string, ExtendedEvent[]> = {};

    [...new Set([...postsToFetch, ...repostsToFetch, ...replyIdsToFetch])].forEach(id => {
        if (!(id in allNewReactions)) allNewReactions[id] = [];
        if (!(id in allNewReplies)) allNewReplies[id] = [];
        if (!(id in allNewReposts)) allNewReposts[id] = [];
    });

    const fetchData = async (ids: string[], pubkeys: string[]) => {
        return new Promise<void>((resolve) => {
            const sub = pool?.subscribeManyEose(
                RELAYS,
                [
                    { kinds: [0], authors: pubkeys },
                    { kinds: [7], '#e': ids },
                    { kinds: [1], '#e': ids },
                    { kinds: [6], '#e': ids }
                ],
                {
                    onevent(event: Event) {
                        if (event.kind === 0) {
                            const metadata = JSON.parse(event.content) as Metadata;
                            allNewMetadata[event.pubkey] = metadata;
                            setMetadataToCache(event.pubkey, metadata);
                        } else if (event.kind === 7) {
                            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                            if (postId) {
                                console.log("got a reaction for post id", postId);
                                const newReaction: Reaction = {
                                    id: event.id,
                                    liker_pubkey: event.pubkey,
                                    type: event.content,
                                    sig: event.sig
                                };
                                if (!allNewReactions[postId]) {
                                    allNewReactions[postId] = [];
                                }
                                if (!allNewReactions[postId].some(r => r.sig === newReaction.sig)) {
                                    allNewReactions[postId].push(newReaction);
                                }
                            }
                        } else if (event.kind === 1) {
                            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                            if (postId) {
                                if (!allNewReplies[postId]) {
                                    allNewReplies[postId] = [];
                                }
                                if (!allNewReplies[postId].some(r => r.id === event.id)) {
                                    allNewReplies[postId].push(event as unknown as ExtendedEvent);
                                }
                            }
                        } else if (event.kind === 6) {
                            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                            if (postId) {
                                if (!allNewReposts[postId]) {
                                    allNewReposts[postId] = [];
                                }
                                if (!allNewReposts[postId].some(r => r.id === event.id)) {
                                    allNewReposts[postId].push(event as unknown as ExtendedEvent);
                                }
                            }
                        }
                    },
                    onclose() {
                        sub?.close();
                        resolve();
                    }
                }
            );
        });
    };

    // Fetch data for original posts
    await fetchData(postsToFetch, Array.from(pubkeysToFetchFromNetwork));

    // Fetch data for reposts
    if (repostsToFetch.length > 0) {
        await fetchData(repostsToFetch, repostPubkeysToFetch);
    }  

    // Fetch data for replies
    if (replyIdsToFetch.length > 0) {
        await fetchData(replyIdsToFetch, replyPubkeysToFetch);
    }

    // Update all states at once
    setMetadata(prevMetadata => ({...prevMetadata, ...allNewMetadata}));
    setReactions(prevReactions => {
        const updatedReactions = {...prevReactions};
        for (const [eventId, reactions] of Object.entries(allNewReactions)) {
            if (!updatedReactions[eventId]) {
                updatedReactions[eventId] = reactions;
            }
        }
        return updatedReactions;
    });
    setReplies(prevReplies => {
        const updatedReplies = {...prevReplies};
        for (const [eventId, replies] of Object.entries(allNewReplies)) {
            if (!updatedReplies[eventId]) {
                updatedReplies[eventId] = replies;
            }
        }
        return updatedReplies;
    });
    setReposts(prevReposts => {
        const updatedReposts = {...prevReposts};
        for (const [eventId, reposts] of Object.entries(allNewReposts)) {
            if (!updatedReposts[eventId]) {
                updatedReposts[eventId] = reposts;
            }
        }
        return updatedReposts;
    });
    return () => {
        cleanup();
    };
}

export const fetchData = async (pool: SimplePool | null, _since: number, append: boolean = false, _until: number = 0,
    _isLoggedIn: boolean, _nostrExists: boolean | null, _keyValue: string | null,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    setLoadingMore: React.Dispatch<React.SetStateAction<boolean>>,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    _setEvents: React.Dispatch<React.SetStateAction<ExtendedEvent[]>>,
    events: ExtendedEvent[],
    repostEvents: ExtendedEvent[],
    replyEvents: ExtendedEvent[],
    setLastFetchedTimestamp: React.Dispatch<React.SetStateAction<number>>,
    setDeletedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>,
    _setUserPublicKey: React.Dispatch<React.SetStateAction<string | null>>,
    setInitialLoadComplete: React.Dispatch<React.SetStateAction<boolean>>,
    filter: any,
    onEventReceived: (event: ExtendedEvent) => void,
    selectedAlgorithm: any
) => {
    try {
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      let subRepostedMeta: any;
      let subReactionsReplies: any;
      let fetchedEvents: ExtendedEvent[] = [];

          const sub = pool?.subscribeMany(
            RELAYS,
            [filter], 
            {
                onevent(event: Event) {
                    let extendedEventToAdd: ExtendedEvent = {
                        ...event,
                        deleted: false,
                        repostedEvent: null,
                        repliedEvent: null
                    };
                    setLastFetchedTimestamp(prevTimestamp => 
                        Math.min(prevTimestamp, event.created_at)
                    );

                    if (event.kind === 1) {
                        if (!event.tags.some((tag: string[]) => tag[0] === 'e')) {
                            const extendedEvent: ExtendedEvent = {
                                ...event,
                                id: event.id,
                                pubkey: event.pubkey,
                                created_at: event.created_at,
                                content: event.content,
                                tags: event.tags,
                                deleted: false,
                                repostedEvent: null,
                                repliedEvent: null
                            };
                            extendedEventToAdd = extendedEvent;
                            if (selectedAlgorithm.byoPosts) onEventReceived(extendedEventToAdd);
                        }
                        else {
                            // Get the original note referenced in the first 'e' tag
                            const replyToId = event.tags.find(tag => tag[0] === 'e')?.[1];
                            if (replyToId && selectedAlgorithm.byoReplies) {
                                // Fetch the original note
                                pool?.get(RELAYS, {
                                    ids: [replyToId]
                                }).then(originalEvent => {
                                    if (originalEvent) {
                                        const repliedEvent: ExtendedEvent = {
                                            ...originalEvent,
                                            id: originalEvent.id,
                                            pubkey: originalEvent.pubkey,
                                            created_at: originalEvent.created_at,
                                            content: originalEvent.content,
                                            tags: originalEvent.tags,
                                            deleted: false,
                                            repostedEvent: null,
                                            repliedEvent: null
                                        };
                                        const extendedEvent: ExtendedEvent = {
                                            ...event,
                                            id: event.id,
                                            pubkey: event.pubkey,
                                            created_at: event.created_at,
                                            content: event.content,
                                            tags: event.tags,
                                            deleted: false,
                                            repostedEvent: null,
                                            repliedEvent: repliedEvent
                                        };
                                        extendedEventToAdd = extendedEvent;
                                        replyEvents.push(extendedEvent);
                                        onEventReceived(extendedEvent);
                                    }
                                });
                            }
                        }
                    } else if (event.kind === 5) {
                        const deletedIds = event.tags
                            .filter(tag => tag[0] === 'e')
                            .map(tag => tag[1]);
                        setDeletedNoteIds(prev => new Set([...prev, ...deletedIds]));
                    }
                    else if (event.kind === 6) {
                        if (!events.some(e => e.id === event.id)) {
                        const repostedId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        //if (!events.some(e => e.id === event.id)) {
                        if (repostedId) {
                            try {
                                const repostedContent = JSON.parse(event.content);
                                const repostedEvent: ExtendedEvent = {
                                    ...event,
                                    id: repostedContent.id,
                                    pubkey: repostedContent.pubkey,
                                    created_at: repostedContent.created_at,
                                    content: repostedContent.content,
                                    tags: repostedContent.tags,
                                    deleted: false,
                                    repostedEvent: null,
                                    repliedEvent: null
                                };
                            const extendedEvent: ExtendedEvent = {
                                id: event.id,
                                pubkey: event.pubkey,
                                created_at: event.created_at,
                                content: "",
                                tags: event.tags,
                                deleted: false,
                                repostedEvent: repostedEvent,
                                repliedEvent: null
                            };
                            extendedEventToAdd = extendedEvent;
                            repostEvents.push(extendedEvent);
                            if (selectedAlgorithm.byoReposts) onEventReceived(extendedEvent);
                            } catch (error) {
                            console.error("Error parsing reposted content:", error);
                            }
                        }
                    }
                }
                fetchedEvents.push(extendedEventToAdd);
                },
                oneose() {
                    setLoading(false);
                    setLoadingMore(false);
                    setInitialLoadComplete(true);
                }
            }
        );
        return () => {
            if (sub) sub.close();
            if (subRepostedMeta) subRepostedMeta.close();
            if (subReactionsReplies) subReactionsReplies.close();
        };
    } catch (error) {
      console.error("Error fetching data: ", error);
      setError("An error occurred while fetching posts. Please try again later.");
      setLoading(false);
      setLoadingMore(false);
    }
  };
