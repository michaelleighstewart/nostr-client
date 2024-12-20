import { SimplePool, Event } from "nostr-tools";
import { RELAYS } from "./constants";
import { ExtendedEvent, Metadata, Reaction } from "./interfaces";
import { getMetadataFromCache, setCachedCounts, setMetadataToCache } from "./cachingUtils";
import { throttleRequest } from './throttle';

export const fetchMetadataAlt = async (pool: SimplePool, events: ExtendedEvent[], 
    repostEvents: ExtendedEvent[],
    replyEvents: ExtendedEvent[]) => {
    const eventsToProcess = events;
    const pubkeysToFetch = new Set(eventsToProcess.map(event => event.pubkey));
    
    // Add repost and reply pubkeys to the set
    repostEvents.forEach(event => pubkeysToFetch.add(event.pubkey));
    replyEvents.forEach(event => pubkeysToFetch.add(event.pubkey));

    // Check cache first
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

    let allNewMetadata: Record<string, Metadata> = {...cachedMetadata};

    // Fetch all metadata in one connection if there are keys to fetch
    if (pubkeysToFetchFromNetwork.length > 0) {
        return new Promise<Record<string, Metadata>>((resolve) => {
            const sub = pool?.subscribeManyEose(
                RELAYS,
                [{
                    kinds: [0],
                    authors: pubkeysToFetchFromNetwork
                }],
                {
                    onevent(event) {
                        if (event.kind === 0) {
                            try {
                                const metadata = JSON.parse(event.content) as Metadata;
                                allNewMetadata[event.pubkey] = metadata;
                                setMetadataToCache(event.pubkey, metadata);
                            } catch (error) {
                                console.error("Error parsing metadata:", error);
                            }
                        }
                    },
                    onclose() {
                        sub?.close();
                        resolve(allNewMetadata);
                    }
                }
            );
        });
    }

    return allNewMetadata;
}

export const fetchReactionsAndRepliesAlt = async (pool: SimplePool, events: ExtendedEvent[], 
    repostEvents: ExtendedEvent[],
    replyEvents: ExtendedEvent[]) => {
    const eventsToProcess = events;
    //const pubkeysToFetch = new Set(eventsToProcess.map(event => event.pubkey));
    const postsToFetch = eventsToProcess.map(event => event.id);
    const repostsToFetch = repostEvents.map(event => event.id).filter(Boolean);
    const replyIdsToFetch = replyEvents.map(event => event.id).filter(Boolean);

    // Initialize collections
    let allNewMetadata: Record<string, Metadata> = {};
    let allNewReactions: Record<string, Reaction[]> = {};
    let allNewReplies: Record<string, ExtendedEvent[]> = {};
    let allNewReposts: Record<string, ExtendedEvent[]> = {};

    // Initialize empty arrays for all IDs
    [...new Set([...postsToFetch, ...repostsToFetch, ...replyIdsToFetch])].forEach(id => {
        allNewReactions[id] = [];
        allNewReplies[id] = [];
        allNewReposts[id] = [];
    });

    // Combine all IDs to fetch in a single request
    const allIds = [...new Set([...postsToFetch, ...repostsToFetch, ...replyIdsToFetch])];
    
    if (allIds.length === 0) {
        return {
            metadata: allNewMetadata,
            reactions: allNewReactions,
            replies: allNewReplies,
            reposts: allNewReposts
        };
    }

    // Fetch all data in one connection
    return new Promise((resolve) => {
        const sub = pool?.subscribeManyEose(
            RELAYS,
            [{
                kinds: [7, 1, 6],
                '#e': allIds
            }],
            {
                onevent(event) {
                    const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                    if (!postId) return;

                    switch (event.kind) {
                        case 7: // Reaction
                            const newReaction: Reaction = {
                                id: event.id,
                                liker_pubkey: event.pubkey,
                                type: event.content,
                                sig: event.sig
                            };
                            if (!allNewReactions[postId].some(r => r.sig === newReaction.sig)) {
                                allNewReactions[postId].push(newReaction);
                            }
                            break;

                        case 1: // Reply
                            if (!allNewReplies[postId].some(r => r.id === event.id)) {
                                allNewReplies[postId].push(event as unknown as ExtendedEvent);
                            }
                            break;

                        case 6: // Repost
                            if (!allNewReposts[postId].some(r => r.id === event.id)) {
                                allNewReposts[postId].push(event as unknown as ExtendedEvent);
                            }
                            break;
                    }

                    // Update cached counts
                    setCachedCounts(postId, {
                        reactions: allNewReactions[postId]?.filter(r => r.type !== "-").length || 0,
                        dislikes: allNewReactions[postId]?.filter(r => r.type === "-").length || 0,
                        reposts: allNewReposts[postId]?.length || 0,
                        replies: allNewReplies[postId]?.length || 0,
                        timestamp: Date.now()
                    });
                },
                onclose() {
                    sub?.close();
                    resolve({
                        metadata: allNewMetadata,
                        reactions: allNewReactions,
                        replies: allNewReplies,
                        reposts: allNewReposts
                    });
                }
            }
        );
    });
};

//deprecated
export const fetchMetadataReactionsAndReplies = async (pool: SimplePool, events: ExtendedEvent[], 
    repostEvents: ExtendedEvent[],
    replyEvents: ExtendedEvent[],
    setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>, 
    setReactions: React.Dispatch<React.SetStateAction<Record<string, Reaction[]>>>, 
    setReplies: React.Dispatch<React.SetStateAction<Record<string, ExtendedEvent[]>>>,
    setReposts: React.Dispatch<React.SetStateAction<Record<string, ExtendedEvent[]>>>) => {

    const eventsToProcess = events;
    
    const pubkeysToFetch = new Set(eventsToProcess.map(event => event.pubkey));
    const postsToFetch = eventsToProcess.map(event => event.id);
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

    //this function needs to be fixed - michael
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
                        if (event.kind === 7 || event.kind === 6 || event.kind === 1) {
                            const postId = event.tags.find(tag => tag[0] === 'e')?.[1];
                            if (postId) {
                                // Update cached counts
                                const currentReactions = allNewReactions[postId]?.filter(r => r.type !== "-").length || 0;
                                const currentDislikes = allNewReactions[postId]?.filter(r => r.type === "-").length || 0;
                                const currentReposts = allNewReposts[postId]?.length || 0;
                                const currentReplies = allNewReplies[postId]?.length || 0;
                                
                                setCachedCounts(postId, {
                                    reactions: currentReactions,
                                    dislikes: currentDislikes,
                                    reposts: currentReposts,
                                    replies: currentReplies,
                                    timestamp: Date.now()
                                });
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
    await throttleRequest(() => fetchData(postsToFetch, Array.from(pubkeysToFetchFromNetwork)));
    
    if (repostsToFetch.length > 0) {
        await throttleRequest(() => fetchData(repostsToFetch, repostPubkeysToFetch));
    }  

    if (replyIdsToFetch.length > 0) {
        await throttleRequest(() => fetchData(replyIdsToFetch, replyPubkeysToFetch));
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
    isLoggedIn: boolean, _nostrExists: boolean | null, _keyValue: string | null,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    setLoadingMore: React.Dispatch<React.SetStateAction<boolean>>,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    _setEvents: React.Dispatch<React.SetStateAction<ExtendedEvent[]>>,
    events: ExtendedEvent[],
    repostEvents: ExtendedEvent[],
    _replyEvents: ExtendedEvent[],
    setLastFetchedTimestamp: React.Dispatch<React.SetStateAction<number>>,
    setDeletedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>,
    _setUserPublicKey: React.Dispatch<React.SetStateAction<string | null>>,
    setInitialLoadComplete: React.Dispatch<React.SetStateAction<boolean>>,
    filter: any,
    onEventReceived: (event: ExtendedEvent) => void,
    selectedAlgorithm: any,
    isRecentSubscription: boolean = false
) => {
    try {
        if (!append) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        setError(null);
        let fetchedEvents: ExtendedEvent[] = [];
        let initialEventsReceived = false;

        const chunkArray = (array: string[], chunkSize: number) => {
            const chunks = [];
            for (let i = 0; i < array.length; i += chunkSize) {
                chunks.push(array.slice(i, i + chunkSize));
            }
            return chunks;
        };

        const authorChunks = filter.authors && filter.authors.length > 50
            ? chunkArray(filter.authors, 50)
            : [filter.authors];

            const handleKind1Event = async (event: Event, extendedEventToAdd: ExtendedEvent, callEventReceived: boolean) => {
                const rootTag = event.tags.find(tag => tag[0] === 'e' && tag[3] === 'root');
                const replyTag = event.tags.find(tag => tag[0] === 'e' && tag[3] === 'reply');
              
                const fetchAndCreateExtendedEvent = async (id: string | null, _type: 'root' | 'reply') => {
                  if (!id || !pool) return null;
                    let eventToResolve: ExtendedEvent | null = null;
                    const resolvedEvent = await pool.querySync(
                        RELAYS,
                        {
                            kinds: [1],
                            ids: [id]
                        }
                    );
                    const originalEvent = resolvedEvent[0];
                    const extendedOriginalEvent: ExtendedEvent = {
                        ...originalEvent,
                        id: originalEvent.id,
                        pubkey: originalEvent.pubkey,
                        created_at: originalEvent.created_at,
                        content: originalEvent.content,
                        tags: originalEvent.tags,
                        deleted: false,
                        repostedEvent: null,
                        repliedEvent: null,
                        rootEvent: null
                      };
                      eventToResolve = extendedOriginalEvent;
                      return eventToResolve;
                };
            
                const rootEvent = await fetchAndCreateExtendedEvent(rootTag ? rootTag[1] : null, 'root');
                const replyEvent = await fetchAndCreateExtendedEvent(replyTag ? replyTag[1] : null, 'reply');
            
                const extendedEvent: ExtendedEvent = {
                  ...event,
                  id: event.id,
                  pubkey: event.pubkey,
                  created_at: event.created_at,
                  content: event.content,
                  tags: event.tags,
                  deleted: false,
                  repostedEvent: null,
                  repliedEvent: replyEvent,
                  rootEvent: rootEvent
                };
                extendedEventToAdd = extendedEvent;
                if (selectedAlgorithm) {
                  if (rootEvent || replyEvent) {
                    if (selectedAlgorithm.byoReplies) {
                        if (!fetchedEvents.some(event => event.id === extendedEventToAdd.id)) {
                            fetchedEvents.push(extendedEventToAdd);
                            if (callEventReceived) onEventReceived(extendedEventToAdd);
                        }
                    }
                  }
                  else {
                    if (selectedAlgorithm.byoPosts) {
                        if (!fetchedEvents.some(event => event.id === extendedEventToAdd.id)) {
                            fetchedEvents.push(extendedEventToAdd);
                            if (callEventReceived) onEventReceived(extendedEventToAdd);
                        }
                    }
                  }
                }
                else {
                  if (!fetchedEvents.some(event => event.id === extendedEventToAdd.id)) {
                    repostEvents.push(extendedEventToAdd);
                    fetchedEvents.push(extendedEventToAdd);
                    if (callEventReceived) onEventReceived(extendedEventToAdd);
                  }
                }
            };
            
            const handleKind6Event = (event: Event, extendedEventToAdd: ExtendedEvent, callEventReceived: boolean) => {
                if (!events.some(e => e.id === event.id)) {
                    const repostedId = event.tags.find(tag => tag[0] === 'e')?.[1];
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
                                repliedEvent: null,
                                rootEvent: null
                            };
                            const extendedEvent: ExtendedEvent = {
                                id: event.id,
                                pubkey: event.pubkey,
                                created_at: event.created_at,
                                content: "",
                                tags: event.tags,
                                deleted: false,
                                repostedEvent: repostedEvent,
                                repliedEvent: null,
                                rootEvent: null
                            };
                            extendedEventToAdd = extendedEvent;
                            
                            if (!isLoggedIn) {
                                repostEvents.push(extendedEventToAdd);
                                fetchedEvents.push(extendedEventToAdd);
                                if (callEventReceived) onEventReceived(extendedEventToAdd);
                            }
                            else {
                                if (selectedAlgorithm) {
                                    if (selectedAlgorithm.byoReposts) {
                                        if (!fetchedEvents.some(event => event.id === extendedEventToAdd.id)) {
                                            repostEvents.push(extendedEventToAdd);
                                            fetchedEvents.push(extendedEventToAdd);
                                            if (callEventReceived) onEventReceived(extendedEvent);
                                        }
                                    }
                                }
                                else {
                                    if (!fetchedEvents.some(event => event.id === extendedEventToAdd.id)) {
                                        repostEvents.push(extendedEventToAdd);
                                        fetchedEvents.push(extendedEventToAdd);
                                        if (callEventReceived) onEventReceived(extendedEvent);
                                    }
                                }
                            }
                        } catch (error) {
                            console.error("Error parsing reposted content:", error);
                        }
                    }
                }
            };

            let newLastFetchedTimestamp = Infinity;
            let newDeletedNoteIds = new Set<string>();

            const handleEvent = (event: Event, callEventReceieved: boolean) => {
                if (fetchedEvents.some(e => e.id === event.id)) {
                    return;
                }
                if (fetchedEvents.length >= 10 && !callEventReceieved) {
                    return;
                }
                let extendedEventToAdd: ExtendedEvent = {
                    ...event,
                    deleted: false,
                    repostedEvent: null,
                    repliedEvent: null,
                    rootEvent: null
                };
    
                newLastFetchedTimestamp = Math.min(newLastFetchedTimestamp, event.created_at);
                if (callEventReceieved) {
                    setInitialLoadComplete(true);
                }
                if (event.kind === 1) {
                    handleKind1Event(event, extendedEventToAdd, callEventReceieved);
                } else if (event.kind === 5) {
                    const deletedIds = event.tags
                        .filter(tag => tag[0] === 'e')
                        .map(tag => tag[1]);
                    deletedIds.forEach(id => newDeletedNoteIds.add(id));
                } else if (event.kind === 6) {
                    handleKind6Event(event, extendedEventToAdd, callEventReceieved);
                }
    
                if (!initialEventsReceived && fetchedEvents.length >= 10 && !callEventReceieved) {
                    initialEventsReceived = true;
                    setInitialLoadComplete(true);
                }
            };


        const createSubscription = (authorChunk: string[]) => {
            return new Promise<void>((resolve) => {
                const chunkFilter = { ...filter, authors: authorChunk };
                const sub = isRecentSubscription 
                    ? pool?.subscribeMany(RELAYS, [chunkFilter], { onevent: (event) => {
                        handleEvent(event, true)
                    }, oneose: resolve })
                    : pool?.subscribeManyEose(RELAYS, [chunkFilter], { onevent: (event) => { 
                        handleEvent(event, false)
                    }, onclose: () => {
                        sub?.close();
                        resolve()} });
            });
        };

        // Process each chunk of authors
        for (const chunk of authorChunks) {
            await createSubscription(chunk);
        }

        // Batch update states
        setLastFetchedTimestamp(newLastFetchedTimestamp);
        setDeletedNoteIds(prev => new Set([...prev, ...newDeletedNoteIds]));
        setLoading(false);
        setLoadingMore(false);
        setInitialLoadComplete(true);

        return fetchedEvents;
    } catch (error) {
        console.error("Error fetching data: ", error);
        setError("An error occurred while fetching posts. Please try again later.");
        setLoading(false);
        setLoadingMore(false);
    }
};
