import '../App.css';
import { SimplePool } from "nostr-tools";
import { useState, useEffect } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { insertEventIntoDescendingList, bech32Decoder, ExtendedEvent } from "../utils/helperFunctions";
import { Event } from "nostr-tools";
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getFollowers } from "../utils/profileUtils";
import { fetchMetadataReactionsAndReplies } from '../utils/noteUtils';

interface HomeProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

export interface Metadata {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

export interface Reaction {
  liker_pubkey: string;
  type: string;
  sig: string;
}

const Home : React.FC<HomeProps> = (props: HomeProps) => {
    const [eventsImmediate, setEvents] = useState<ExtendedEvent[]>([]);
    const [events] = useDebounce(eventsImmediate, 1500);
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
    const [replies, setReplies] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const [message, setMessage] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(props.nostrExists || !!props.keyValue);
    const [lastFetchedTimestamp, setLastFetchedTimestamp] = useState<number>(Math.floor(Date.now() / 1000));
    const [initialLoadComplete, setInitialLoadComplete] = useState(false);
    const [showOstrich, setShowOstrich] = useState(false);
    const [deletedNoteIds, setDeletedNoteIds] = useState<Set<string>>(new Set());

    useEffect(() => {
      setIsLoggedIn(props.nostrExists || !!props.keyValue);
    }, [props.nostrExists, props.keyValue]);

    const fetchData = async (pool: SimplePool, since: number, append: boolean = false, until: number = 0) => {
      try {
        if (!append) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);
        let filter;

        // Always get the followers if logged in
        const followers = isLoggedIn ? await getFollowers(pool, isLoggedIn, props.nostrExists, props.keyValue) : [];
        filter = isLoggedIn
        ? { kinds: [1, 5, 6], since: since, authors: followers, limit: 10, ...(until !== 0 && { until }) }
        : { kinds: [1, 5, 6], since: since, limit: 10, ...(until !== 0 && { until }) };
        console.log(filter);
  
            const sub = pool.subscribeMany(
              RELAYS,
              [filter],
              {
                  onevent(event: Event) {
                      if (event.kind === 1 && !event.tags.some((tag: string[]) => tag[0] === 'e')) {
                          const extendedEvent: ExtendedEvent = {
                            ...event,
                            id: event.id,
                            pubkey: event.pubkey,
                            created_at: event.created_at,
                            content: event.content,
                            tags: event.tags,
                            deleted: false,
                            repostedEvent: null
                          };
                          setEvents((events) => {
                              // Check if the event already exists
                              if (!events.some(e => e.id === extendedEvent.id)) {
                                  return insertEventIntoDescendingList(events, extendedEvent);
                              }
                              return events;
                          });
                          // Update lastFetchedTimestamp if this is the oldest event
                          setLastFetchedTimestamp(prevTimestamp => 
                              Math.min(prevTimestamp, extendedEvent.created_at)
                          );
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
                              repostedEvent: null
                            };
                            const extendedEvent: ExtendedEvent = {
                              id: event.id,
                              pubkey: event.pubkey,
                              created_at: event.created_at,
                              content: "",
                              tags: event.tags,
                              deleted: false,
                              repostedEvent: repostedEvent
                            };
                            // Fetch metadata for the reposted event's author
                            props.pool?.subscribeManyEose(
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
                            props.pool?.subscribeManyEose(
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
                          // Update lastFetchedTimestamp if this is the oldest event
                          setLastFetchedTimestamp(prevTimestamp => 
                              Math.min(prevTimestamp, extendedEvent.created_at)
                          );
                          } catch (error) {
                            console.error("Error parsing reposted content:", error);
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
              sub.close();
          };
      } catch (error) {
        console.error("Error fetching data: ", error);
        setError("An error occurred while fetching posts. Please try again later.");
        setLoading(false);
        setLoadingMore(false);
      }
    };

    useEffect(() => {
      if (!props.pool) return;
      const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      fetchData(props.pool, oneDayAgo);
    }, [props.pool, props.keyValue, props.nostrExists, isLoggedIn]);

    useEffect(() => {
      if (!props.pool) return;
      fetchMetadataReactionsAndReplies(props.pool, events, setMetadata, setReactions, setReplies);
  }, [events, props.pool]);

    async function sendMessage() {
      if (!props.pool) return;
      setPosting(true);
      try {
        if (props.nostrExists) {
          let event = {
            kind: 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: message,
          }
          await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
            await props.pool?.publish(RELAYS, eventToSend);
          });
        }
        else {
          let sk = props.keyValue;
          let skDecoded = bech32Decoder('nsec', sk);
          let pk = getPublicKey(skDecoded);
          let event = {
            kind: 1,
            pubkey: pk,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: message,
          }
          let eventFinal = finalizeEvent(event, skDecoded);
          await props.pool?.publish(RELAYS, eventFinal);
        }
        setMessage('');
        toast.success("Post sent successfully!");
        // Refresh the list of posts
        if (props.pool) {
          const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
          await fetchData(props.pool, oneDayAgo);
        }
      } catch (error) {
        console.error("Error sending message: ", error);
        toast.error("Failed to send post. Please try again.");
      } finally {
        setPosting(false);
      }
    }

    const loadMore = async () => {
      if (!props.pool) return;
      setLoadingMore(true);
      const oneDayBeforeLastFetched = lastFetchedTimestamp - 24 * 60 * 60;
      await fetchData(props.pool, oneDayBeforeLastFetched, true, lastFetchedTimestamp);
    };

    return (
      <div className="py-16 pt-150">
        {isLoggedIn && (
          <div>
            <div className="pb-2">
              <input type="text" id="message" 
                className="w-full text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                placeholder="What is happening?!" required
                value={message}
                onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="h-64">
              <div className="float-right">
                <button 
                  className={posting ? "bg-blue-500 hover:bg-blue-700 text-white font-bold p-16 rounded opacity-50 cursor-not-allowed" : "bg-blue-500 hover:bg-blue-700 text-white font-bold p-16 rounded"}
                  onClick={sendMessage}
                  disabled={posting}
                >
                  {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>
          </div>
        )}
        {loading ? (
          <Loading vCentered={false} />
        ) : error ? (
          <div className="text-red-500 text-center mt-4">{error}</div>
        ) 
         : (
          <div className={`pt-32 relative ${!isLoggedIn ? 'pointer-events-none opacity-50' : ''}`}>
            <NotesList metadata={metadata} reactions={reactions} notes={events.filter(e => !deletedNoteIds.has(e.id))} pool={props.pool} 
              nostrExists={props.nostrExists} keyValue={props.keyValue}
              replies={replies} />
            {initialLoadComplete && events.length > 0 && isLoggedIn && (
              <div className="mt-8 mb-8 text-center">
                {loadingMore ? (
                  <Loading vCentered={false} />
                ) : (
                  <button 
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded"
                    onClick={loadMore}
                  >
                    Load More
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <AnimatePresence>
          {showOstrich && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
              onClick={() => setShowOstrich(false)}
            >
              <div className="relative">
                <img src="/ostrich.png" alt="Ostrich" className="ostrich max-w-full max-h-full" />
                <div className="absolute top-0 left-full ml-4 p-32 bg-white rounded-lg shadow-lg speech-bubble" style={{ width: '400px' }}>
                  <p className="text-black">
                    Hey! Please{' '}
                    <Link to="/edit-profile" className="text-blue-500 hover:underline">
                      set up your profile
                    </Link>
                    {' '}so that users on the network can know who you are
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <style>{`
                .speech-bubble::before {
                    content: '';
                    position: absolute;
                    left: -20px;
                    top: 50%;
                    transform: translateY(-50%);
                    border-width: 10px;
                    border-style: solid;
                    border-color: transparent white transparent transparent;
                }
                .ostrich {
                    max-width: 100%;
                    max-height: 100%;
                }
                @media (max-width: 768px) {
                    .ostrich {
                        display: none;
                    }
                    .speech-bubble {
                        position: static;
                        width: 90% !important;
                        margin: 0 auto;
                    }
                    .speech-bubble::before {
                        display: none;
                    }
                }
            `}</style>
      </div>
    )
  }
  export default Home;