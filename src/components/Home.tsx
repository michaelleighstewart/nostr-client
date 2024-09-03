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
    const metadataFetched = useRef<Record<string, boolean>>({});
    const reactionsFetched = useRef<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const [message, setMessage] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(props.nostrExists || !!props.keyValue);

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

    const fetchData = async (pool: SimplePool) => {
      try {
        setLoading(true);
        setError(null);
        setEvents([]);
        const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
        let filter;

        // Always get the followers if logged in
        if (isLoggedIn) {
          const followers = await getFollowers(pool);
          filter = { kinds: [1], since: oneDayAgo, authors: followers };
        } else {
          filter = { kinds: [1], since: oneDayAgo, limit: 100 }; // Limit to 100 posts for non-logged in users
        }
  
        const subPosts = pool.subscribeMany(
          RELAYS, 
          [filter],
          {
            onevent(event: Event) {
              if (!event.tags.some((tag: string[]) => tag[0] === 'e')) {
                const extendedEvent: ExtendedEvent = {
                  ...event,
                  id: event.id,
                  pubkey: event.pubkey,
                  created_at: event.created_at,
                  content: event.content,
                  tags: event.tags,
                  deleted: false
                };
    
                // Subscribe to delete events
                props?.pool?.subscribeMany(
                  RELAYS,
                  [{ kinds: [5], '#e': [extendedEvent.id ?? ""] }],
                  {
                    onevent(deleteEvent) {
                      if (deleteEvent.pubkey === extendedEvent.pubkey) {
                        extendedEvent.deleted = true;
                        setEvents((prevEvents) => {
                          const updatedEvents = prevEvents.map(event => 
                            event.id === extendedEvent.id ? {...event, deleted: true} : event
                          );
                          return updatedEvents;
                        });
                      }
                    },
                    oneose() {
                      if (!extendedEvent.deleted) {
                        setEvents((events) => insertEventIntoDescendingList(events, extendedEvent));
                      }
                    }
                  }
                );
              }
            },
            oneose() {
              setLoading(false);
            }
          }
        );
  
        // Return a cleanup function
        return () => {
          subPosts.close();
        };
      } catch (error) {
        console.error("Error fetching data: ", error);
        setError("An error occurred while fetching posts. Please try again later.");
        setLoading(false);
        //setDataFetched(true);
      }
    };

    useEffect(() => {
      if (!props.pool) return;
      fetchData(props.pool);
    }, [props.pool, props.keyValue, props.nostrExists, isLoggedIn]);
 
    useEffect(() => {
      if (!props.pool) return;
  
      //get authors
      const pubkeysToFetch = events
        .filter((event) => metadataFetched.current[event.pubkey] !== true)
        .map((event) => event.pubkey);

      let noAuthors = pubkeysToFetch.length === 0;
  
      pubkeysToFetch.forEach(
        (pubkey) => (metadataFetched.current[pubkey] = true)
      );
  
      const subMeta = props.pool.subscribeMany(RELAYS, [
        {
          kinds: [0],
          authors: pubkeysToFetch,
        },
      ],
      {
        onevent(event) {
          const metadata = JSON.parse(event.content) as Metadata;
  
          setMetadata((cur) => ({
            ...cur,
            [event.pubkey]: metadata,
          }));
        },
        oneose() {
          subMeta.close();
        }
      });

      //get likes
      const postsToFetch = events
        .filter((event) => reactionsFetched.current[event.id] !== true)
        .map((event) => event.id);
      if (noAuthors && postsToFetch.length === 0) {
        return;
      }
      postsToFetch.forEach(
        (id) => (reactionsFetched.current[id] = true)
      );
      
      const subReactions = props.pool.subscribeMany(
        RELAYS,
        postsToFetch.map((postId) => ({
          kinds: [7],
          '#e': [postId],
        })),
        {
          onevent(event) {
            setReactions((cur) => {
              const newReaction: Reaction = {
                liker_pubkey: event.pubkey,
                type: event.content,
                sig: event.sig
              };
              const updatedReactions = { ...cur };
              const postId = event.tags[0][1];

              if (updatedReactions[postId]) {
                const postReactions = updatedReactions[postId];
                const isDuplicate = postReactions.some(
                  (reaction) => reaction.sig === newReaction.sig
                );
        
                if (!isDuplicate) {
                  updatedReactions[postId] = [...postReactions, newReaction];
                }
              } else {
                updatedReactions[postId] = [newReaction];
              }
      
              return updatedReactions;
            });
          },
          oneose() {
            subReactions.close();
          }
        }
      );
      return () => {};
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
          await fetchData(props.pool);
        }
      } catch (error) {
        console.error("Error sending message: ", error);
        toast.error("Failed to send post. Please try again.");
      } finally {
        setPosting(false);
      }
    }

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
            <NotesList metadata={metadata} reactions={reactions} notes={events} pool={props.pool} nostrExists={props.nostrExists} keyValue={props.keyValue} />
          </div>
        )}
      </div>
    )
  }
  export default Home;