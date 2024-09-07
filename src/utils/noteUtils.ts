import { SimplePool, Event } from "nostr-tools";
import { RELAYS } from "./constants";
import { getFollowers } from "./profileUtils";
import { insertEventIntoDescendingList } from "./helperFunctions";
import { ExtendedEvent, Metadata, Reaction } from "./interfaces";

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

export const fetchData = async (pool: SimplePool | null, since: number, append: boolean = false, until: number = 0,
    isLoggedIn: boolean, nostrExists: boolean | null, keyValue: string | null,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    setLoadingMore: React.Dispatch<React.SetStateAction<boolean>>,
    setError: React.Dispatch<React.SetStateAction<string | null>>,
    setEvents: React.Dispatch<React.SetStateAction<ExtendedEvent[]>>,
    events: ExtendedEvent[],
    setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>,
    setReactions: React.Dispatch<React.SetStateAction<Record<string, Reaction[]>>>,
    setReplies: React.Dispatch<React.SetStateAction<Record<string, number>>>,
    setLastFetchedTimestamp: React.Dispatch<React.SetStateAction<number>>,
    setDeletedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>,
    setUserPublicKey: React.Dispatch<React.SetStateAction<string | null>>,
    setInitialLoadComplete: React.Dispatch<React.SetStateAction<boolean>>,
) => {
    try {
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      let filter;
      // Always get the followers if logged in
      const followers = isLoggedIn ? await getFollowers(pool as SimplePool, isLoggedIn, nostrExists, keyValue, setUserPublicKey) : [];
      filter = isLoggedIn
      ? { kinds: [1, 5, 6], since: since, authors: followers, limit: 10, ...(until !== 0 && { until }) }
      : { kinds: [1, 5, 6], since: since, limit: 10, ...(until !== 0 && { until }) };
      let subRepostedMeta: any;
      let subReactionsReplies: any;

          const sub = pool?.subscribeMany(
            RELAYS,
            [filter],
            {
                onevent(event: Event) {
                    // Update lastFetchedTimestamp for every event, regardless of its kind
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
                            setEvents((events) => {
                                // Check if the event already exists
                                if (!events.some(e => e.id === extendedEvent.id)) {
                                    return insertEventIntoDescendingList(events, extendedEvent);
                                }
                                return events;
                            });
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
                                        setEvents(prevEvents => {
                                            if (!prevEvents.some(e => e.id === extendedEvent.id)) {
                                                return insertEventIntoDescendingList(prevEvents, extendedEvent);
                                            }
                                            return prevEvents;
                                        });
                                    }
                                });
                            }
                        }
                    } else if (event.kind === 5) {
                        const deletedIds = event.tags
                            .filter(tag => tag[0] === 'e')
                            .map(tag => tag[1]);
                        setDeletedNoteIds(prev => new Set([...prev, ...deletedIds]));
                        setEvents(prevEvents => prevEvents.map(e => 
                            deletedIds.includes(e.id) ? {...e, deleted: true} : e
                        ));
                    }
                    else if (event.kind === 6) {
                        if (!events.some(e => e.id === event.id)) {
                        const repostedId = event.tags.find(tag => tag[0] === 'e')?.[1];
                        //if (!events.some(e => e.id === event.id)) {
                        if (repostedId && event.content.length > 0) {
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
                            // Fetch metadata for the reposted event's author
                            subRepostedMeta = pool?.subscribeManyEose(
                                RELAYS,
                                [
                                {
                                    kinds: [0],
                                    authors: [repostedEvent.pubkey],
                                },
                                ],
                                {
                                onevent: (event) => {
                                    if (event.kind === 0) {
                                    try {
                                        const profileContent = JSON.parse(event.content);
                                        setMetadata((prevMetadata) => ({
                                        ...prevMetadata,
                                        [event.pubkey]: {
                                            name: profileContent.name,
                                            about: profileContent.about,
                                            picture: profileContent.picture,
                                            nip05: profileContent.nip05,
                                        },
                                        }));
                                    } catch (error) {
                                        console.error("Error parsing profile metadata:", error);
                                    }
                                    }
                                },
                                }
                            );
                            // Fetch reactions and replies for the reposted event
                            subReactionsReplies = pool?.subscribeManyEose(
                                RELAYS,
                                [
                                {
                                    kinds: [1, 7],
                                    "#e": [repostedEvent.id],
                                },
                                ],
                                {
                                onevent: (event) => {
                                    if (event.kind === 7) {
                                    // This is a reaction
                                    setReactions((prevReactions) => ({
                                        ...prevReactions,
                                        [repostedEvent.id]: [
                                        ...(prevReactions[repostedEvent.id] || []),
                                        {
                                            id: event.id,
                                            liker_pubkey: event.pubkey,
                                            type: event.tags.find((t) => t[0] === "p")?.[1] || "+",
                                            sig: event.sig, // Add the 'sig' property
                                        },
                                        ],
                                    }));
                                    } else if (event.kind === 1) {
                                    // This is a reply
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
                                }
                            );
                            setEvents((events) => {
                                // Check if the event already exists
                                if (!events.some(e => e.id === extendedEvent.id)) {
                                    return insertEventIntoDescendingList(events, extendedEvent);
                                }
                                return events;
                            });
                            } catch (error) {
                            console.error("Error parsing reposted content:", error);
                            }
                        }
                    }
                }
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

