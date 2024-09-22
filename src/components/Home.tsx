import '../App.css';
import { getPublicKey, SimplePool } from "nostr-tools";
import { useState, useEffect, useRef, useCallback } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { bech32Decoder, getBase64, sendMessage } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, Reaction, User } from "../utils/interfaces";
import Loading from "./Loading";
import { fetchUserMetadata, getFollowers } from "../utils/profileUtils";
import { fetchMetadataReactionsAndReplies, fetchData } from '../utils/noteUtils';
import Ostrich from "./Ostrich";
import { showCustomToast } from "./CustomToast";
import { PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import NoteCard from "./NoteCard";
import { Helmet } from 'react-helmet';
import { getMetadataFromCache, setMetadataToCache } from '../utils/cachingUtils';
import { RELAYS } from '../utils/constants';
import { debounce } from 'lodash';
import { API_URLS } from '../utils/apiConstants';
import { constructFilterFromBYOAlgo } from '../utils/algoUtils';

interface HomeProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

const Home : React.FC<HomeProps> = (props: HomeProps) => {
    const [streamedEvents, setStreamedEvents] = useState<ExtendedEvent[]>([]);
    const [eventsImmediate, _setEvents] = useState<ExtendedEvent[]>([]);
    const [events] = useDebounce(eventsImmediate, 15);
    const [repostEvents, _setRepostEvents] = useState<ExtendedEvent[]>([]);
    const [replyEvents, _setReplyEvents] = useState<ExtendedEvent[]>([]);
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
    const [replies, setReplies] = useState<Record<string, ExtendedEvent[]>>({});
    const [reposts, setReposts] = useState<Record<string, ExtendedEvent[]>>({});
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
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [followers, setFollowers] = useState<string[]>([]);
    const [_hasNotes, setHasNotes] = useState(false);
    const [byoAlgo, setByoAlgo] = useState<any>(null);

    //const lastProcessedEventIndex = useRef(-1);

    const handleEventReceived = useCallback((event: ExtendedEvent) => {
      setStreamedEvents(prev => {
        if (prev.some(e => e.id === event.id)) {
          return prev;
        }
        return [event, ...prev].sort((a, b) => b.created_at - a.created_at);
      });
      
      setHasNotes(true);

      const pubkeysToFetch = [event.pubkey];

      if (props.pool) {
        //fetchMetadataReactionsAndReplies(props.pool, [event], repostEvents, replyEvents, setMetadata, setReactions, setReplies, setReposts);
        fetchMetadataReactionsAndReplies(props.pool, [event], event.repostedEvent ? [event.repostedEvent] : [], 
          event.repliedEvent ? [event.repliedEvent] : [], setMetadata, setReactions, setReplies, setReposts);
      }
      
      if (event.repostedEvent) {
        pubkeysToFetch.push(event.repostedEvent.pubkey);
      } else if (event.repliedEvent) {
        pubkeysToFetch.push(event.repliedEvent.pubkey);
      }
      
      pubkeysToFetch.forEach(pubkey => {
        const cachedMetadata = getMetadataFromCache(pubkey);
        if (cachedMetadata) {
          setMetadata(prev => ({...prev, [pubkey]: cachedMetadata}));
        } else if (props.pool && !metadata[pubkey]) {
          props.pool.subscribeManyEose(
            RELAYS,
            [{ kinds: [0], authors: [pubkey] }],
            {
              onevent(metadataEvent) {
                try {
                  const metadata = JSON.parse(metadataEvent.content) as Metadata;
                  setMetadata(prev => ({...prev, [pubkey]: metadata}));
                  if (isLoggedIn) {
                    setMetadataToCache(pubkey, metadata);
                  }
                } catch (error) {
                  console.error("Error parsing metadata:", error);
                }
              }
            }
          );
        }
      });
    }, [props.pool, metadata, isLoggedIn]);

    useEffect(() => {
      const timer = setInterval(() => {
        setStreamedEvents(prev => [...prev].sort((a, b) => b.created_at - a.created_at));
      }, 1000); // Sort every second
    
      return () => clearInterval(timer);
    }, []);

    useEffect(() => {
      setIsLoggedIn(props.nostrExists || !!props.keyValue);
    }, [props.nostrExists, props.keyValue, loadingMore]);

    const fetchFollowersAndData = useCallback(async () => {
      if (!props.pool) return;
      setLoading(true);
      
      try {
        const newFollowers = await getFollowers(props.pool, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "", setUserPublicKey, null);
        try {
          if (props.keyValue) {
            let skDecoded = bech32Decoder('nsec', props.keyValue);
            let pk = getPublicKey(skDecoded);
            if (!newFollowers.includes(pk)) newFollowers.push(pk);
          }
        } catch (error) {}
        setFollowers(newFollowers);

        // Fetch BYO algorithm
        if (userPublicKey) {
          try {
            const response = await fetch(`${API_URLS.BYO_ALGORITHM}?userId=${userPublicKey}`);
            if (response.ok) {
              const data = await response.json();
              setByoAlgo(data);
            }
          } catch (error) {
            console.error("Error fetching BYO algorithm:", error);
          }
        }
    
        const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
        //let filter = isLoggedIn
        //  ? { kinds: [1, 5, 6], authors: newFollowers, limit: 10, since: oneWeekAgo }
        //  : { kinds: [1, 5, 6], limit: 10, since: oneWeekAgo };
        //let filter = { id: '9e2b9f66a4af0035b0a447e33a348790ec2d95defb3f385fea67037fff73b24a'};
        let filter = isLoggedIn
        ? constructFilterFromBYOAlgo(byoAlgo, newFollowers, oneWeekAgo)
        : { kinds: [1, 5, 6], limit: 10, since: oneWeekAgo };
        
        const fetchedEvents = await fetchData(props.pool, 0, false, 0, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
          setLoading, setLoadingMore, setError, () => {}, streamedEvents, repostEvents, replyEvents, setLastFetchedTimestamp, setDeletedNoteIds, 
          setUserPublicKey, setInitialLoadComplete, filter, handleEventReceived);
        
        if (fetchedEvents && Array.isArray(fetchedEvents) && fetchedEvents.length > 0) {
          const newLastFetchedTimestamp = Math.min(...fetchedEvents.map(event => event.created_at));
          setLastFetchedTimestamp(newLastFetchedTimestamp);
        }
        setInitialLoadComplete(true);
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to load data. Please try again.");
      } finally {
        setLoading(false);
      }
    }, [props.pool, props.keyValue, props.nostrExists, isLoggedIn, userPublicKey, handleEventReceived, streamedEvents]);

    useEffect(() => {
      fetchFollowersAndData();
    }, []);

    useEffect(() => {
      fetchUserMetadata(props.pool, userPublicKey ?? "", setShowOstrich, setMetadata);
    }, [userPublicKey]);

    const debouncedLoadMore = debounce(async () => {
      if (!props.pool) return;
      setLoadingMore(true);
      const oneDayBeforeLastFetched = lastFetchedTimestamp - 24 * 60 * 60;
      let filter = isLoggedIn
        ? { kinds: [1, 5, 6], since: oneDayBeforeLastFetched, authors: followers, limit: 10, until: lastFetchedTimestamp }
        : { kinds: [1, 5, 6], since: oneDayBeforeLastFetched, limit: 10, until: lastFetchedTimestamp };
    
      const fetchedEvents = await fetchData(props.pool, oneDayBeforeLastFetched, true, lastFetchedTimestamp, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
        setLoading, setLoadingMore, setError, setStreamedEvents, events, repostEvents, replyEvents, setLastFetchedTimestamp, setDeletedNoteIds, setUserPublicKey, 
        setInitialLoadComplete, filter, handleEventReceived);
      
      if (fetchedEvents && Array.isArray(fetchedEvents) && fetchedEvents.length > 0) {
        const newLastFetchedTimestamp = Math.min(...fetchedEvents.map(event => event.created_at));
        setLastFetchedTimestamp(newLastFetchedTimestamp);
        
        setStreamedEvents(prev => {
          const newEvents = [...prev, ...fetchedEvents];
          return newEvents.sort((a, b) => b.created_at - a.created_at);
        });
        await fetchMetadataReactionsAndReplies(props.pool, fetchedEvents, repostEvents, replyEvents, setMetadata, setReactions, setReplies, setReposts);
      }
      setLoadingMore(false);
    }, 300);
    
    const loadMore = () => {
      if (!loadingMore) {
        debouncedLoadMore();
      }
    };

    const handleSendMessage = async () => {
      if (!props.pool) return;
      setPosting(true);
      try {
        const success = await sendMessage(props.pool, props.nostrExists, props.keyValue, message, setPosting, setMessage);
        if (success) {
          showCustomToast("Posted note successfully!");
          await fetchFollowersAndData();
        } else {
          showCustomToast("Failed to send post. Please try again.");
        }
      } catch (error) {
        console.error("Error sending message:", error);
        showCustomToast("An error occurred. Please try again.");
      } finally {
        setPosting(false);
      }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadingImage(true);
      try {
        const base64File = await getBase64(file);
        const contentType = file.type;

        const response = await fetch(API_URLS.FILE_UPLOAD, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file: base64File, contentType })
        });

        const data = await response.json();
        const imageUrl = JSON.parse(data.body).url;

        setMessage(prevMessage => prevMessage + ' ' + imageUrl);
      } catch (error) {
        console.error('Error uploading image:', error);
        showCustomToast("Failed to upload image. Please try again.");
      } finally {
        setUploadingImage(false);
      }
    };

    const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadingVideo(true);
      try {
        const base64File = await getBase64(file);
        const contentType = file.type;

        const response = await fetch(API_URLS.FILE_UPLOAD, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file: base64File, contentType })
        });

        const data = await response.json();
        const videoUrl = JSON.parse(data.body).url;

        setMessage(prevMessage => prevMessage + ' ' + videoUrl);
      } catch (error) {
        console.error('Error uploading video:', error);
        showCustomToast("Failed to upload video. Please try again.");
      } finally {
        setUploadingVideo(false);
      }
    };

    const triggerImageInput = () => {
      imageInputRef.current?.click();
    };

    const triggerVideoInput = () => {
      videoInputRef.current?.click();
    };

    const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setMessage(e.target.value);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };

    const previewUser: User = {
      name: metadata[userPublicKey || '']?.name || '',
      image: metadata[userPublicKey || '']?.picture || '',
      pubkey: userPublicKey || '',
      nip05: metadata[userPublicKey || '']?.nip05 || '',
    };

    const previewNote: ExtendedEvent = {
      id: 'preview',
      pubkey: userPublicKey || '',
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: message,
      deleted: false,
      repostedEvent: null,
      repliedEvent: null,
    };

    return (
      <div className="py-16 pt-150">
        <Helmet>
          <title>Ghostcopywrite | Nostr Client</title>
          <meta property="og:title" content="Ghostcopywrite | Nostr Client" />
          <meta property="og:description" content="Let Freedom Ring" />
          <meta property="og:image" content="https://ghostcopywrite.com/ostrich.png" />
          <meta property="og:url" content="https://ghostcopywrite.com" />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
        </Helmet>
        {isLoggedIn && (
          <div className="flex flex-col space-y-4 border border-gray-300 rounded-lg p-24 mb-8">
            <div>
              <div className="pb-2">
                <textarea
                  ref={textareaRef}
                  id="message" 
                  className="w-full text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 resize-none overflow-hidden"
                  placeholder="What is happening?!" 
                  required
                  value={message}
                  onChange={handleTextareaChange}
                  rows={1}
                />
              </div>
              <div className="h-64 flex justify-between items-center">
                <div className="flex">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                    className="hidden"
                    id="image-upload"
                    ref={imageInputRef}
                  />
                  <button 
                    className={`flex items-center justify-center font-bold p-16 rounded bg-transparent ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={triggerImageInput}
                    disabled={uploadingImage}
                  >
                    {uploadingImage ? <Loading vCentered={false} /> : <PhotoIcon className="h-5 w-5" />}
                  </button>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    disabled={uploadingVideo}
                    className="hidden"
                    id="video-upload"
                    ref={videoInputRef}
                  />
                  <button 
                    className={`flex items-center justify-center font-bold p-16 rounded bg-transparent ${uploadingVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={triggerVideoInput}
                    disabled={uploadingVideo}
                  >
                    {uploadingVideo ? <Loading vCentered={false} /> : <VideoCameraIcon className="h-5 w-5" />}
                  </button>
                </div>
                <div>
                  <button 
                    className={`text-white font-bold p-16 rounded ${(posting || uploadingImage || uploadingVideo || !message.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={(_e) => handleSendMessage()}
                    disabled={posting || uploadingImage || uploadingVideo || !message.trim()}
                  >
                    {posting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-300 pt-4">
              <h3 className="text-lg font-semibold mb-2">Preview</h3>
              <NoteCard 
                isPreview={true}
                id={previewNote.id}
                content={previewNote.content}
                user={previewUser}
                created_at={previewNote.created_at}
                hashtags={[]}
                metadata={metadata}
                reactions={[]}
                replies={0}
                reposts={0}
                pool={props.pool}
                nostrExists={props.nostrExists}
                keyValue={props.keyValue} 
                deleted={undefined} 
                repostedEvent={null} 
                repliedEvent={null} 
                allReactions={null} 
                allReplies={null} 
                allReposts={null}
                setMetadata={setMetadata}              
              />
            </div>
          </div>
        )}
        {loading ? (
          <Loading vCentered={false} />
        ) : error ? (
          <div className="text-red-500 text-center mt-4">{error}</div>
        ) : (
            <div className={`w-full ${!isLoggedIn ? 'pointer-events-none opacity-50' : ''}`}>
              <NotesList 
                metadata={metadata} 
                reactions={reactions} 
                notes={streamedEvents.filter(e => !deletedNoteIds.has(e.id))}
                pool={props.pool} 
                nostrExists={props.nostrExists} 
                keyValue={props.keyValue}
                replies={replies} 
                reposts={reposts} 
                setMetadata={setMetadata}
                initialLoadComplete={initialLoadComplete} 
              />
              {streamedEvents.length > 0 && initialLoadComplete && isLoggedIn && (
                <div className="mt-8 mb-8 text-center">
                  {loadingMore ? (
                    <Loading vCentered={false} />
                  ) : (
                    <button 
                      className="text-white font-bold py-3 px-6 rounded"
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