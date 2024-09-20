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
        repostsToFetch.push(event.repostedEvent?.id || "");
        repostPubkeysToFetch.push(event.repostedEvent?.pubkey || "");
    }
    const replyIdsToFetch: string[] = [];
    const replyPubkeysToFetch: string[] = [];
    for (const event of replyEvents) {
        replyIdsToFetch.push(event.repliedEvent?.id || "");
        replyPubkeysToFetch.push(event.repliedEvent?.pubkey || "");
    }
    repostPubkeysToFetch.forEach(pubkey => pubkeysToFetch.add(pubkey));

    // Check cache for metadata
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

    // Update metadata state with cached data
    setMetadata(prevMetadata => ({...prevMetadata, ...cachedMetadata}));

    let sub: any;

    const cleanup = () => {
        if (sub) {
            sub.close();
        }
    };

    sub = pool?.subscribeManyEose(
        RELAYS,
        [
            { kinds: [0], authors: pubkeysToFetchFromNetwork },
            { kinds: [7], '#e': postsToFetch },
            { kinds: [1], '#e': postsToFetch },
            { kinds: [6], '#e': postsToFetch }
        ],
        {
            onevent(event: Event) {
                if (event.kind === 0) {
                    console
                    const metadata = JSON.parse(event.content) as Metadata;
                    setMetadata(cur => ({
                        ...cur,
                        [event.pubkey]: metadata
                    }));
                    setMetadataToCache(event.pubkey, metadata);
                } else if (event.kind === 7) {
                    setReactions(cur => {
                        const newReaction: Reaction = {
                            id: event.id,
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
                            if (updatedReplies[postId]) {
                                if (!updatedReplies[postId].some(r => r.id === event.id)) {
                                    updatedReplies[postId] = [...updatedReplies[postId], event as unknown as ExtendedEvent];
                                }
                            } else {
                                updatedReplies[postId] = [event as unknown as ExtendedEvent];
                            }
                        }
                        return updatedReplies;
                    });
                } else if (event.kind === 6) {
                    setReposts(cur => {
                        const updatedReposts = { ...cur };
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            if (updatedReposts[postId]) {
                                if (!updatedReposts[postId].some(r => r.id === event.id)) {
                                    updatedReposts[postId] = [...updatedReposts[postId], event as unknown as ExtendedEvent  ];
                                }
                            } else {
                                updatedReposts[postId] = [event as unknown as ExtendedEvent];
                            }
                        }
                        return updatedReposts;
                    });
                }
            },
            onclose() {
            }
        }
    );

    // Fetch metadata, reactions, replies, and reposts for reposted events
    //const repostsToFetch = repostEvents.map(event => event.repostedEvent?.id).filter(Boolean) as string[];
    
    if (repostsToFetch.length > 0) {
        const subRepostedMeta = pool?.subscribeMany(
            RELAYS,
            [
                { kinds: [0], authors: Array.from(repostPubkeysToFetch) },
                { kinds: [7], '#e': repostsToFetch },
                { kinds: [1], '#e': repostsToFetch },
                { kinds: [6], '#e': repostsToFetch }
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
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            const newReaction: Reaction = {
                                id: event.id,
                                liker_pubkey: event.pubkey,
                                type: event.content,
                                sig: event.sig
                            };
                            setReactions(cur => {
                                const updatedReactions = { ...cur };
                                if (updatedReactions[postId]) {
                                    if (!updatedReactions[postId].some(r => r.id === newReaction.id)) {
                                        updatedReactions[postId] = [...updatedReactions[postId], newReaction];
                                    }
                                } else {
                                    updatedReactions[postId] = [newReaction];
                                }
                                return updatedReactions;
                            });
                        }
                    } else if (event.kind === 1) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            setReplies(cur => {
                                const updatedReplies = { ...cur };
                                if (updatedReplies[postId]) {
                                    if (!updatedReplies[postId].some(r => r.id === event.id)) {
                                        updatedReplies[postId] = [...updatedReplies[postId], event as unknown as ExtendedEvent];
                                    }
                                } else {
                                    updatedReplies[postId] = [event as unknown as ExtendedEvent];
                                }
                                return updatedReplies;
                            });
                        }
                    } else if (event.kind === 6) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            setReposts(cur => {
                                const updatedReposts = { ...cur };
                                if (updatedReposts[postId]) {
                                    if (!updatedReposts[postId].some(r => r.id === event.id)) {
                                        updatedReposts[postId] = [...updatedReposts[postId], event as unknown as ExtendedEvent];
                                    }
                                } else {
                                    updatedReposts[postId] = [event as unknown as ExtendedEvent];
                                }
                                return updatedReposts;
                            });
                        }
                    }
                },
                oneose() {
                    subRepostedMeta?.close();
                }
            }
        );
    }

    if (replyIdsToFetch.length > 0) {
        const subRepostedMeta = pool?.subscribeMany(
            RELAYS,
            [
                { kinds: [0], authors: Array.from(replyPubkeysToFetch) },
                { kinds: [7], '#e': replyIdsToFetch },
                { kinds: [1], '#e': replyIdsToFetch },
                { kinds: [6], '#e': replyIdsToFetch }
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
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            const newReaction: Reaction = {
                                id: event.id,
                                liker_pubkey: event.pubkey,
                                type: event.content,
                                sig: event.sig
                            };
                            setReactions(cur => {
                                const updatedReactions = { ...cur };
                                if (updatedReactions[postId]) {
                                    if (!updatedReactions[postId].some(r => r.id === newReaction.id)) {
                                        updatedReactions[postId] = [...updatedReactions[postId], newReaction];
                                    }
                                } else {
                                    updatedReactions[postId] = [newReaction];
                                }
                                return updatedReactions;
                            });
                        }
                    } else if (event.kind === 1) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            setReplies(cur => {
                                const updatedReplies = { ...cur };
                                if (updatedReplies[postId]) {
                                    if (!updatedReplies[postId].some(r => r.id === event.id)) {
                                        updatedReplies[postId] = [...updatedReplies[postId], event as unknown as ExtendedEvent  ];
                                    }
                                } else {
                                    updatedReplies[postId] = [event as unknown as ExtendedEvent];
                                }
                                return updatedReplies;
                            });
                        }
                    } else if (event.kind === 6) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            setReposts(cur => {
                                const updatedReposts = { ...cur };
                                if (updatedReposts[postId]) {
                                    if (!updatedReposts[postId].some(r => r.id === event.id)) {
                                        updatedReposts[postId] = [...updatedReposts[postId], event as unknown as ExtendedEvent];
                                    }
                                } else {
                                    updatedReposts[postId] = [event as unknown as ExtendedEvent ];
                                }
                                return updatedReposts;
                            });
                        }
                    }
                },
                oneose() {
                    subRepostedMeta?.close();
                }
            }
        );
    }

    return cleanup;
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
    onEventReceived: (event: ExtendedEvent) => void
) => {
    try {
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      //let filter;
      // Always get the followers if logged in
      //const followers = isLoggedIn ? await getFollowers(pool as SimplePool, isLoggedIn, nostrExists, keyValue, setUserPublicKey) : [];
      //filter = isLoggedIn
      //? { kinds: [1, 5, 6], since: since, authors: followers, limit: 10, ...(until !== 0 && { until }) }
      //: { kinds: [1, 5, 6], since: since, limit: 10, ...(until !== 0 && { until }) };
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
                            onEventReceived(extendedEventToAdd);
                        }
                        else {
                            // Get the original note referenced in the first 'e' tag
                            //console.log("event for reply", event);
                            const replyToId = event.tags.find(tag => tag[0] === 'e')?.[1];
                            if (replyToId) {
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
                        onEventReceived(extendedEventToAdd);
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
                            onEventReceived(extendedEvent);
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
