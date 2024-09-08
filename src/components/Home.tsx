import '../App.css';
import { SimplePool } from "nostr-tools";
import { useState, useEffect, useRef } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { sendMessage } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, Reaction } from "../utils/interfaces";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { fetchUserMetadata } from "../utils/profileUtils";
import { fetchMetadataReactionsAndReplies, fetchData } from '../utils/noteUtils';
import Ostrich from "./Ostrich";
import { showCustomToast } from "./CustomToast";
import { Event } from "nostr-tools";

interface HomeProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

const Home : React.FC<HomeProps> = (props: HomeProps) => {
    const [eventsImmediate, setEvents] = useState<ExtendedEvent[]>([]);
    const [events] = useDebounce(eventsImmediate, 1500);
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
    const [replies, setReplies] = useState<Record<string, Event[]>>({});
    const [reposts, setReposts] = useState<Record<string, Event[]>>({});
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
    const [userPublicKey, setUserPublicKey] = useState<string | null>(null);
    const metadataFetched = useRef<Record<string, boolean>>({});

    useEffect(() => {
      if (!props.pool || !userPublicKey) return;
  
      // Fetch current user's metadata
      let subUserMeta: any;

      fetchUserMetadata(props.pool, userPublicKey, setShowOstrich, setMetadata);


      //get authors
      const pubkeysToFetch = events
        .filter((event) => metadataFetched.current[event.pubkey] !== true && event.pubkey !== userPublicKey)
        .map((event) => event.pubkey);

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

      return () => {
        subUserMeta?.close();
        subMeta.close();
      };
    }, [events, props.pool, userPublicKey]);

    useEffect(() => {
      setIsLoggedIn(props.nostrExists || !!props.keyValue);
    }, [props.nostrExists, props.keyValue]);

    useEffect(() => {
      if (!props.pool) return;
      const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
      const fetchDataCleanup = fetchData(props.pool, oneDayAgo, false, 0, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
        setLoading, setLoadingMore, setError, setEvents, events, setMetadata, setReactions, setReplies, setLastFetchedTimestamp, 

        setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete);
      return () => {
        fetchDataCleanup.then(cleanup => cleanup && cleanup());
      };
    }, [props.pool, props.keyValue, props.nostrExists, isLoggedIn]);

    useEffect(() => {
      if (!props.pool) return;
      fetchMetadataReactionsAndReplies(props.pool, events, setMetadata, setReactions, setReplies, setReposts);
    }, [events, props.pool]);

    const loadMore = async () => {
      if (!props.pool) return;
      setLoadingMore(true);
      const oneDayBeforeLastFetched = lastFetchedTimestamp - 24 * 60 * 60;
      await fetchData(props.pool, oneDayBeforeLastFetched, true, lastFetchedTimestamp, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
        setLoading, setLoadingMore, setError, setEvents, events, setMetadata, setReactions, setReplies, setLastFetchedTimestamp, 
        setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete);
    };

    const handleSendMessage = async () => {
      if (!props.pool) return;
      const success = await sendMessage(props.pool, props.nostrExists, props.keyValue, message, setPosting, setMessage);
      if (success) {
        showCustomToast("Posted note successfully!");
        // Refresh the list of posts
        const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

        await fetchData(props.pool, oneDayAgo, false, 0, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
          setLoading, setLoadingMore, setError, setEvents, events, setMetadata, setReactions, setReplies, setLastFetchedTimestamp, 
          setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete);
      }
      else {
        showCustomToast("Failed to send post. Please try again.");
      }
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
                  onClick={(_e) => handleSendMessage()}
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
              replies={replies} reposts={reposts} />
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
        <Ostrich show={showOstrich} onClose={() => setShowOstrich(false)} 
            text="Hey! Please " linkText="set up your profile to let users know who you are" 
            linkUrl="/edit-profile" />
      </div>
    )
  }
  export default Home;