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
            
                  return new Promise<ExtendedEvent | null>((resolve) => {
                    let eventToResolve: ExtendedEvent | null = null;
                    const sub = pool.subscribeManyEose(
                      RELAYS,
                      [{ kinds: [1], ids: [id] }],
                      {
                        onevent(originalEvent) {
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
                        },
                        onclose() {
                          resolve(eventToResolve);
                          sub.close();
                        }
                      }
                    );
                  });
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
                if (fetchedEvents.length >= 10) {
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
    
                if (!initialEventsReceived && fetchedEvents.length >= 10) {
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

        // Process any remaining events that weren't part of the initial 10
        //if (fetchedEvents.length > 10) {
        //    fetchedEvents.slice(10).forEach(e => onEventReceived(e));
        //}

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
