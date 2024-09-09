import '../App.css';
import { SimplePool } from "nostr-tools";
import { useState, useEffect, useRef } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { getBase64, sendMessage } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, Reaction, User } from "../utils/interfaces";
import { RELAYS } from "../utils/constants";
import Loading from "./Loading";
import { fetchUserMetadata } from "../utils/profileUtils";
import { fetchMetadataReactionsAndReplies, fetchData } from '../utils/noteUtils';
import Ostrich from "./Ostrich";
import { showCustomToast } from "./CustomToast";
import { PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import NoteCard from "./NoteCard";

interface HomeProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

const Home : React.FC<HomeProps> = (props: HomeProps) => {
    const [eventsImmediate, setEvents] = useState<ExtendedEvent[]>([]);
    const [events] = useDebounce(eventsImmediate, 1500);
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
    const metadataFetched = useRef<Record<string, boolean>>({});
    const [uploadingImage, setUploadingImage] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        setLoading, setLoadingMore, setError, setEvents, events, repostEvents, replyEvents, setLastFetchedTimestamp, 

        setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete);
      return () => {
        fetchDataCleanup.then(cleanup => cleanup && cleanup());
      };
    }, [props.pool, props.keyValue, props.nostrExists, isLoggedIn]);

    useEffect(() => {
      if (!props.pool) return;
      fetchMetadataReactionsAndReplies(props.pool, events, repostEvents, replyEvents, setMetadata, setReactions, setReplies, setReposts);
    }, [events, props.pool]);

    const loadMore = async () => {
      if (!props.pool) return;
      setLoadingMore(true);
      const oneDayBeforeLastFetched = lastFetchedTimestamp - 24 * 60 * 60;
      await fetchData(props.pool, oneDayBeforeLastFetched, true, lastFetchedTimestamp, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
        setLoading, setLoadingMore, setError, setEvents, events, repostEvents, replyEvents, setLastFetchedTimestamp, 
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
          setLoading, setLoadingMore, setError, setEvents, events, repostEvents, replyEvents, setLastFetchedTimestamp, 
          setDeletedNoteIds, setUserPublicKey, setInitialLoadComplete);
      }
      else {
        showCustomToast("Failed to send post. Please try again.");
      }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setUploadingImage(true);
      try {
        const base64File = await getBase64(file); // Convert file to base64
        const contentType = file.type; // Get the MIME type of the file

        const response = await fetch('https://z2wavnt1bj.execute-api.us-west-2.amazonaws.com/prod/upload', {
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
        const base64File = await getBase64(file); // Convert file to base64
        const contentType = file.type; // Get the MIME type of the file

        const response = await fetch('https://z2wavnt1bj.execute-api.us-west-2.amazonaws.com/prod/upload', {
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
                    className={`text-white font-bold p-16 rounded ${posting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={(_e) => handleSendMessage()}
                    disabled={posting || uploadingImage || uploadingVideo}
                  >
                    {posting ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
            <div className="border-t border-gray-300 pt-4">
              <h3 className="text-lg font-semibold mb-2">Preview</h3>
              <NoteCard 
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
              />
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