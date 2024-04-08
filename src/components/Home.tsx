import '../App.css';
import { SimplePool } from "nostr-tools";
import { useState, useEffect, useRef } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { insertEventIntoDescendingList } from "../utils/helperFunctions";
import { Event } from "nostr-tools";
import { getPublicKey, finalizeEvent } from 'nostr-tools';
import { bech32 } from 'bech32';
import { Buffer } from 'buffer';

interface HomeProps {
  keyValue: string;
}

export const RELAYS = [
  //"wss://relay.damus.io"
  "ws://localhost:8008"
]

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
    const [pool, setPool] = useState<SimplePool | null>(null);
    const [eventsImmediate, setEvents] = useState<Event[]>([]);
    const [events] = useDebounce(eventsImmediate, 1500);
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const metadataFetched = useRef<Record<string, boolean>>({});
  
    //const [key, setKey] = useState('');
    const [message, setMessage] = useState('');
  
    const [nostrExists, setNostrExists] = useState(false);
  
    useEffect(() => {
      const _pool = new SimplePool();
      setPool(_pool);
  
      return () => {
        _pool.close(RELAYS);
      }
    }, [])
  
    useEffect(() => {
      if (!pool) return;
      setNostrExists(window.nostr ? true : false);
      setEvents([]);
      const subPosts = pool.subscribeMany(RELAYS, [{
        kinds: [1],
        limit: 5,
        //"#t": ["bitcoin"]
      }],
      {onevent(event) {
        console.log(event);
        setEvents((events) => insertEventIntoDescendingList(events, event));
      }});
  
      return () => {
        subPosts.close();
      }
    }, [pool])
  
    useEffect(() => {
      if (!pool) return;
  
      const pubkeysToFetch = events
        .filter((event) => metadataFetched.current[event.pubkey] !== true)
        .map((event) => event.pubkey);
  
      pubkeysToFetch.forEach(
        (pubkey) => (metadataFetched.current[pubkey] = true)
      );
  
      const subMeta = pool.subscribeMany(RELAYS, [
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
  
      return () => {};
    }, [events, pool]);

    function bech32Decoder(currPrefix: string, data: string) {
        const { prefix, words } = bech32.decode(data);
        if (prefix !== currPrefix) {
            throw Error('Invalid address format');
        }
        return Buffer.from(bech32.fromWords(words));
      }
    
      async function sendMessage() {
        if (nostrExists) {
          let event = {
            kind: 1,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: message,
          }
          await window.nostr.signEvent(event).then(async (eventToSend: any) => {
            await pool?.publish(RELAYS, eventToSend);
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
          await pool?.publish(RELAYS, eventFinal);
        }
      }

    return (
      <div className="flex flex-col gap-16">
        <div>
          <div className="flex flex-row px-32 py-32 w-full">
            <input type="text" id="message" 
              className="w-full text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500" 
              placeholder="What is happening?!" required
              value={message}
              onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="flow-root px-32 w-full">
            <div className="float-right">
              <button 
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold p-16 rounded"
                onClick={sendMessage}
              >Post</button>
            </div>
          </div>
        </div>
        <div className="py-32">
          <NotesList metadata={metadata} notes={events} />
        </div>
      </div>
    )
  }
  export default Home;