import '../App.css';
import { SimplePool } from "nostr-tools";
import { useState, useEffect, useRef } from "react";
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
    const repliesFetched = useRef<Record<string, boolean>>({});
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

    async function getFollowers(pool: SimplePool): Promise<string[]> {
      if (!isLoggedIn) return [];
      
      let pk: string = "";
      let followers: string[] = [];
      if (props.nostrExists) { 
        try {
          pk = await (window as any).nostr.getPublicKey();
        }
        catch (error) {
          console.log("Error getting public key: ", error);
        }
      }
      else {
        const sk = props.keyValue;
        if (!sk) {
          return [];
        }
        let skDecoded = bech32Decoder('nsec', sk);
        pk = getPublicKey(skDecoded);
      }
      if (pk && !followers.includes(pk)) followers.push(pk);
      return new Promise((resolve) => {
        
        pool.subscribeMany(
          RELAYS,
          [{ authors: [pk], kinds: [3] }],
          {
            onevent(event: Event) {
              followers.push(...event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]));
              resolve(followers);
            },
            oneose() {
              resolve(followers);
            }
          }
        );
      });
    }

    const fetchData = async (pool: SimplePool, since: number, append: boolean = false) => {
      try {
        if (!append) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }
        setError(null);
        let filter;

        // Always get the followers if logged in
        const followers = isLoggedIn ? await getFollowers(pool) : [];
        filter = isLoggedIn
            ? { kinds: [1, 5], since: since, until: lastFetchedTimestamp, authors: followers, limit: 20 }
            : { kinds: [1, 5], since: since, until: lastFetchedTimestamp, limit: 20 };
  
            const sub = pool.subscribeMany(
              RELAYS,
              [filter],
              {
                  onevent(event: Event) {
                      //console.log("event with id: ", event.id, " and kind: ", event.kind);
                      if (event.kind === 1 && !event.tags.some((tag: string[]) => tag[0] === 'e')) {
                          const extendedEvent: ExtendedEvent = {
                              ...event,
                              id: event.id,
                              pubkey: event.pubkey,
                              created_at: event.created_at,
                              content: event.content,
                              tags: event.tags,
                              deleted: false
                          };
                          setEvents((events) => insertEventIntoDescendingList(events, extendedEvent));
                      } else if (event.kind === 5) {
                          const deletedIds = event.tags
                              .filter(tag => tag[0] === 'e')
                              .map(tag => tag[1]);
                          setDeletedNoteIds(prev => new Set([...prev, ...deletedIds]));
                          setEvents(prevEvents => prevEvents.map(e => 
                              deletedIds.includes(e.id) ? {...e, deleted: true} : e
                          ));
                      }
                  },
                  oneose() {
                      setLoading(false);
                      setLoadingMore(false);
                      setLastFetchedTimestamp(since);
                      setInitialLoadComplete(true);
                      sub.close();
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

      const fetchMetadataAndReactions = () => {
          const pubkeysToFetch = new Set(events.map(event => event.pubkey));
          const postsToFetch = events.map(event => event.id);

          const sub = props.pool?.subscribeMany(
              RELAYS,
              [
                  { kinds: [0], authors: Array.from(pubkeysToFetch) },
                  { kinds: [7], '#e': postsToFetch },
                  { kinds: [1], '#e': postsToFetch }  // For replies
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
                  oneose() {
                      sub?.close();
                  }
              }
          );

          return () => {
              sub?.close();
          };
      };

      fetchMetadataAndReactions();
  }, [events, props.pool]);

    // New useEffect for fetching replies
    useEffect(() => {
      if (!props.pool) return;
      const postsToFetch = events
        .filter((event) => !repliesFetched.current[event.id])
        .map((event) => event.id);

      if (postsToFetch.length === 0) {
        return;
      }
      const subReplies = props.pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [1],
            '#e': postsToFetch,
          },
        ],
        {
          onevent(event) {
            setReplies((cur) => {
              const updatedReplies = { ...cur };
              const postId = event.tags.find(tag => tag[0] === 'e')?.[1];

              if (postId) {
                if (updatedReplies[postId]) {
                  updatedReplies[postId] += 1;
                } else {
                  updatedReplies[postId] = 1;
                }
              }
        
              return updatedReplies;
            });
          },
          oneose() {
            postsToFetch.forEach(postId => {
              repliesFetched.current[postId] = true;
            });
          }
        }
      );

      return () => {
        subReplies.close();
      };
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
      const oneDayBefore = lastFetchedTimestamp - 24 * 60 * 60;
      await fetchData(props.pool, oneDayBefore, true);
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