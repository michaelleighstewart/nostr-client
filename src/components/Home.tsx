import '../App.css';
import { SimplePool } from "nostr-tools";
import { useState, useEffect, useRef } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { insertEventIntoDescendingList, bech32Decoder } from "../utils/helperFunctions";
import { Event } from "nostr-tools";
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";

interface HomeProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean;
}

export interface Metadata {
  name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

declare global {
  interface Window { nostr: any; }
}

const Home : React.FC<HomeProps> = (props: HomeProps) => {
    const [eventsImmediate, setEvents] = useState<Event[]>([]);
    const [events] = useDebounce(eventsImmediate, 1500);
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const metadataFetched = useRef<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [message, setMessage] = useState('');
  
    useEffect(() => {
      if (!props.pool) return;
      setLoading(true);
      setEvents([]);
      const subPosts = props.pool.subscribeMany(RELAYS, [{
        kinds: [1],
        limit: 5,
        //"#t": ["bitcoin"]
      }],
      {onevent(event) {
        setEvents((events) => insertEventIntoDescendingList(events, event));
      }});
  
      return () => {
        subPosts.close();
      }
    }, [props.pool]);
  
    useEffect(() => {
      if (!props.pool) return;
  
      const pubkeysToFetch = events
        .filter((event) => metadataFetched.current[event.pubkey] !== true)
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
          setLoading(false);
        },
        oneose() {
          subMeta.close();
        }
      });
  
      return () => {};
    }, [events, props.pool]);
    
    async function sendMessage() {
      if (!props.pool) return;
      setPosting(true);
      if (props.nostrExists) {
        let event = {
          kind: 1,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: message,
        }
        await window.nostr.signEvent(event).then(async (eventToSend: any) => {
          await props.pool?.publish(RELAYS, eventToSend);
          setPosting(false);
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
        setPosting(false);
      }
    }

    return (
      <div className="py-64">
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
              >Post</button>
            </div>
          </div>
        </div>
        {loading ? <Loading></Loading> :
          <div className="pt-32">
            <NotesList metadata={metadata} notes={events} />
          </div>
        }
      </div>
    )
  }
  export default Home;