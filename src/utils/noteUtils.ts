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

    let newMetadataForPosts: Record<string, Metadata> = {...cachedMetadata};
    let newReactionsForPosts: Record<string, Reaction[]> = {};
    let newRepliesForPosts: Record<string, ExtendedEvent[]> = {};
    let newRepostsForPosts: Record<string, ExtendedEvent[]> = {};

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
                    newMetadataForPosts[event.pubkey] = metadata;
                    setMetadataToCache(event.pubkey, metadata);
                } else if (event.kind === 7) {
                        const newReaction: Reaction = {
                            id: event.id,
                            liker_pubkey: event.pubkey,
                            type: event.content,
                            sig: event.sig
                        };
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            if (!newReactionsForPosts[postId]) {
                                newReactionsForPosts[postId] = [];
                            }
                            if (!newReactionsForPosts[postId].some(r => r.sig === newReaction.sig)) {
                                newReactionsForPosts[postId].push(newReaction);
                            }
                        }
                } else if (event.kind === 1) {
                    const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                    if (postId) {
                        if (!newRepliesForPosts[postId]) {
                            newRepliesForPosts[postId] = [];
                        }
                        if (!newRepliesForPosts[postId].some(r => r.id === event.id)) {
                            newRepliesForPosts[postId].push(event as unknown as ExtendedEvent);
                        }
                    }
                } else if (event.kind === 6) {
                    const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                    if (postId) {
                        if (!newRepostsForPosts[postId]) {
                            newRepostsForPosts[postId] = [];
                        }
                        if (!newRepostsForPosts[postId].some(r => r.id === event.id)) {
                            newRepostsForPosts[postId].push(event as unknown as ExtendedEvent);
                        }
                    }
                }
            },
            onclose() {
                setMetadata(prevMetadata => ({...prevMetadata, ...newMetadataForPosts}));
                setReactions(prevReactions => ({...prevReactions, ...newReactionsForPosts}));
                setReplies(prevReplies => ({...prevReplies, ...newRepliesForPosts}));
                setReposts(prevReposts => ({...prevReposts, ...newRepostsForPosts}));
                sub?.close();
            }
        }
    );

    let newMetadataForRepostedPosts: Record<string, Metadata> = {...cachedMetadata};
    let newReactionsForRepostedPosts: Record<string, Reaction[]> = {};
    let newRepliesForRepostedPosts: Record<string, ExtendedEvent[]> = {};
    let newRepostsForRepostedPosts: Record<string, ExtendedEvent[]> = {};
    
    if (repostsToFetch.length > 0) {
        const subRepostedMeta = pool?.subscribeManyEose(
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
                        newMetadataForRepostedPosts[event.pubkey] = metadata;
                        setMetadataToCache(event.pubkey, metadata);
                    } else if (event.kind === 7) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            const newReaction: Reaction = {
                                id: event.id,
                                liker_pubkey: event.pubkey,
                                type: event.content,
                                sig: event.sig
                            };
                            if (!newReactionsForRepostedPosts[postId]) {
                                newReactionsForRepostedPosts[postId] = [];
                            }
                            if (!newReactionsForRepostedPosts[postId].some(r => r.sig === newReaction.sig)) {
                                newReactionsForRepostedPosts[postId].push(newReaction);
                            }
                        }
                    } else if (event.kind === 1) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            if (!newRepliesForRepostedPosts[postId]) {
                                newRepliesForRepostedPosts[postId] = [];
                            }
                            if (!newRepliesForRepostedPosts[postId].some(r => r.id === event.id)) {
                                newRepliesForRepostedPosts[postId].push(event as unknown as ExtendedEvent);
                            }
                        }
                    } else if (event.kind === 6) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            if (!newRepostsForRepostedPosts[postId]) {
                                newRepostsForRepostedPosts[postId] = [];
                            }
                            if (!newRepostsForRepostedPosts[postId].some(r => r.id === event.id)) {
                                newRepostsForRepostedPosts[postId].push(event as unknown as ExtendedEvent);
                            }
                        }
                    }
                },
                onclose() {
                    setMetadata(prevMetadata => ({...prevMetadata, ...newMetadataForRepostedPosts}));
                    setReactions(prevReactions => ({...prevReactions, ...newReactionsForRepostedPosts}));
                    setReplies(prevReplies => ({...prevReplies, ...newRepliesForRepostedPosts}));
                    setReposts(prevReposts => ({...prevReposts, ...newRepostsForRepostedPosts}));
                    subRepostedMeta?.close();
                }
            }
        );
    }

    let newMetadataForReplies: Record<string, Metadata> = {...cachedMetadata};
    let newReactionsForReplies: Record<string, Reaction[]> = {};
    let newRepliesForReplies: Record<string, ExtendedEvent[]> = {};
    let newRepostsForReplies: Record<string, ExtendedEvent[]> = {};

    if (replyIdsToFetch.length > 0) {
        const subRepostedMeta = pool?.subscribeManyEose(
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
                        newMetadataForReplies[event.pubkey] = metadata;
                        setMetadataToCache(event.pubkey, metadata);
                    } else if (event.kind === 7) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            const newReaction: Reaction = {
                                id: event.id,
                                liker_pubkey: event.pubkey,
                                type: event.content,
                                sig: event.sig
                            };
                            if (!newReactionsForReplies[postId]) {
                                newReactionsForReplies[postId] = [];
                            }
                            if (!newReactionsForReplies[postId].some(r => r.sig === newReaction.sig)) {
                                newReactionsForReplies[postId].push(newReaction);
                            }
                        }
                    } else if (event.kind === 1) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            if (!newRepliesForReplies[postId]) {
                                newRepliesForReplies[postId] = [];
                            }
                            if (!newRepliesForReplies[postId].some(r => r.id === event.id)) {
                                newRepliesForReplies[postId].push(event as unknown as ExtendedEvent);
                            }
                        }
                    } else if (event.kind === 6) {
                        const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        if (postId) {
                            if (!newRepostsForReplies[postId]) {
                                newRepostsForReplies[postId] = [];
                            }
                            if (!newRepostsForReplies[postId].some(r => r.id === event.id)) {
                                newRepostsForReplies[postId].push(event as unknown as ExtendedEvent);
                            }
                        }
                    }
                },
                onclose() {
                    setMetadata(prevMetadata => ({...prevMetadata, ...newMetadataForReplies}));
                    setReactions(prevReactions => ({...prevReactions, ...newReactionsForReplies}));
                    setReplies(prevReplies => ({...prevReplies, ...newRepliesForReplies}));
                    setReposts(prevReposts => ({...prevReposts, ...newRepostsForReplies}));
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
