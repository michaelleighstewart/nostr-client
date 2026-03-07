import '../App.css';
import { nip19, SimplePool } from "nostr-tools";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { getBase64, sendMessage } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, User } from "../utils/interfaces";
import Loading from "./Loading";
import { fetchUserMetadata, getFollowing, getUserPublicKey } from "../utils/profileUtils";
import { fetchData } from '../utils/noteUtils';
import Ostrich from "./Ostrich";
import { showCustomToast } from "./CustomToast";
import { PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import NoteCard from "./NoteCard";
import { Helmet } from 'react-helmet-async';
import { cacheNotes, clearCachedNotesOlderThanOneDay, getMetadataFromCache, setMetadataToCache } from '../utils/cachingUtils';
import { RELAYS } from '../utils/constants';
import { debounce } from 'lodash';
import { API_URLS } from '../utils/apiConstants';
import { constructFilterFromBYOAlgo } from '../utils/algoUtils';
import { createAuthHeader } from '../utils/authUtils';
import { bech32 } from 'bech32';

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
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [posting, setPosting] = useState(false);
    const [message, setMessage] = useState('');
    const [_lastFetchedTimestamp, setLastFetchedTimestamp] = useState<number>(Math.floor(Date.now() / 1000));
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
    const [byoAlgo, setByoAlgo] = useState<any[]>([]);
    const [selectedAlgorithm, setSelectedAlgorithm] = useState<any | null>(null);
    const isLoggedIn = useMemo(() => props.nostrExists || !!props.keyValue, [props.nostrExists, props.keyValue]);
    const keyValueRef = useRef<string | null>(null);
    const [followingStructure, setFollowingStructure] = useState<any>(null);
    const initialLoadRef = useRef(false);
    const [isPoolReady, setIsPoolReady] = useState(false);

    const hasFetchedRef = useRef(false);

    const batchFetchMetadata = useCallback((pubkeys: string[]) => {
      if (!props.pool) return;
      const cachedKeys: Record<string, Metadata> = {};
      const uncached: string[] = [];
      pubkeys.forEach(pk => {
        const cached = getMetadataFromCache(pk);
        if (cached) { cachedKeys[pk] = cached; }
        else { uncached.push(pk); }
      });
      if (Object.keys(cachedKeys).length > 0) {
        setMetadata(prev => ({...prev, ...cachedKeys}));
      }
      if (uncached.length > 0) {
        const sub = props.pool.subscribeManyEose(RELAYS, [{kinds: [0], authors: [...new Set(uncached)]}], {
          onevent(event) {
            try {
              const parsed = JSON.parse(event.content);
              const m: Metadata = {
                name: parsed.name || parsed.display_name || parsed.username,
                about: parsed.about,
                picture: parsed.picture,
                nip05: parsed.nip05,
              };
              setMetadata(prev => ({...prev, [event.pubkey]: m}));
              if (isLoggedIn) setMetadataToCache(event.pubkey, m);
            } catch {}
          },
          onclose() { sub?.close(); }
        });
      }
    }, [props.pool, isLoggedIn]);

    const calculateConnectionInfo = useCallback((notePubkey: string) => {
      if (followers.includes(notePubkey)) {
        return { degree: 1 };
      } else if (followingStructure) {
        const secondDegreeConnection = followingStructure.find((fs: { following: string | string[]; }) => fs.following.includes(notePubkey));
        if (secondDegreeConnection) {
          const connectedThroughPubkey = secondDegreeConnection.id;
          return {
            degree: 2,
            connectedThrough: {
              name: metadata[connectedThroughPubkey]?.name || nip19.npubEncode(connectedThroughPubkey),
              picture: metadata[connectedThroughPubkey]?.picture || ''
            }
          };
        }
      }
      return null;
    }, [followers, followingStructure, metadata]);

    useEffect(() => {
      if (!followingStructure || !props.pool) return;
      const connectorPubkeys = followingStructure
        .map((fs: { id: string }) => fs.id)
        .filter((pk: string) => !metadata[pk]);
      if (connectorPubkeys.length > 0) {
        batchFetchMetadata(connectorPubkeys);
      }
    }, [followingStructure, props.pool, batchFetchMetadata]);

    const handleEventReceived = useCallback(async (event: ExtendedEvent) => {
      setStreamedEvents(prev => {
        if (prev.some(e => e.id === event.id)) {
          return prev;
        }
        setLoading(false);
        const newEvents = [event, ...prev].sort((a, b) => b.created_at - a.created_at);
        const algoId = selectedAlgorithm?.algoId || null;
        cacheNotes(newEvents, algoId);
        return newEvents;
      });
      
      setHasNotes(true);
      const pubkeysToFetch = [event.pubkey];
      if (event.repostedEvent) {
        pubkeysToFetch.push(event.repostedEvent.pubkey);
      } else if (event.repliedEvent) {
        pubkeysToFetch.push(event.repliedEvent.pubkey);
      }
      
      batchFetchMetadata(pubkeysToFetch);
  }, [props.pool, isLoggedIn, batchFetchMetadata]);


    const fetchFollowingAndData = useCallback(async () => {
      if (!props.pool || initialLoadComplete || !isPoolReady) return;
      setLoading(true);
      let algoSelected = null;
      if (keyValueRef.current) {
        const pk = await getUserPublicKey(props.nostrExists ?? false, keyValueRef.current);
        setUserPublicKey(pk);
        try {
          const authHeader = await createAuthHeader('GET', '/byo-algo', props.nostrExists ?? false, keyValueRef.current);
          const response = await fetch(`${API_URLS.API_URL}byo-algo?userId=${pk}`,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authHeader,
              },
            }
          );
          if (response.ok) {
            const data = await response.json();
            setByoAlgo(data.algos);
            if (selectedAlgorithm === null) {
              setSelectedAlgorithm(data.algos[0]);
              algoSelected = data.algos[0];
            }
          }
        } catch (error) {
          console.error("Error fetching BYO algorithms:", error);
        }
      }

        try {
          let newFollowing: string[] = [];
          if (isLoggedIn) {
          const pk = await getUserPublicKey(props.nostrExists ?? false, keyValueRef.current);
          try {
            const npubWords = bech32.toWords(new Uint8Array(pk.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))));
            const npubEncoded = bech32.encode('npub', npubWords);
            let degrees = 1;
            if (selectedAlgorithm) {
              degrees = selectedAlgorithm.byoDegrees;
            }
            else {
              if (algoSelected) {
                degrees = algoSelected.byoDegrees;
              }
            }
            const followingAPI = await fetch(`${API_URLS.API_URL}social-graph?npub=${npubEncoded}&degrees=${degrees}`);
            if (followingAPI.ok) {
              const apiData = await followingAPI.json();
              if (apiData && apiData.follows && apiData.follows.length > 0) {
                const metadataToCache: Record<string, Metadata> = {};
                apiData.follows.forEach((follow: any) => {
                  metadataToCache[follow.pubkey] = {
                    name: follow.name,
                    picture: follow.picture,
                    about: follow.about
                  };
                });
                metadataToCache[pk] = {
                  name: apiData.user.name,
                  picture: apiData.user.picture,
                  about: apiData.user.about
                };
                Object.entries(metadataToCache).forEach(([pubkey, metadata]) => {
                  setMetadataToCache(pubkey, metadata);
                });
                newFollowing = apiData.follows.map((follow: any) => follow.pubkey);
              }
              else {
                newFollowing = await getFollowing(props.pool, isLoggedIn, props.nostrExists ?? false, keyValueRef.current, setUserPublicKey, null);
              }
            }
            else {
              newFollowing = await getFollowing(props.pool, isLoggedIn, props.nostrExists ?? false, keyValueRef.current, setUserPublicKey, null);
            }
          }
          catch (error) {
            console.warn("Social graph API unavailable, falling back to relay data:", error);
            newFollowing = await getFollowing(props.pool, isLoggedIn, props.nostrExists ?? false, keyValueRef.current, setUserPublicKey, null);
          }
          try {
            if (keyValueRef.current) {
              if (!newFollowing.includes(pk)) newFollowing.push(pk);
            }
          } catch (error) {
            console.warn("Error adding own pubkey to following list:", error);
          }
          setFollowers(newFollowing);
        }
          
    
          const timeRanges = [
            { name: '1 hour', start: 0, end: 3600 },
            { name: '6 hours', start: 3600, end: 21600 },
            { name: '24 hours', start: 21600, end: 86400 },
            //{ name: '1 week', start: 86400, end: 604800 }
          ];
          
          let allFetchedEvents: ExtendedEvent[] = [];
          const now = Math.floor(Date.now() / 1000);
          
          for (const range of timeRanges) {
            if (allFetchedEvents.length >= 5) break;
            const since = now - range.end;
            const until = now - range.start;
            let filterObj = isLoggedIn
              ? await constructFilterFromBYOAlgo(selectedAlgorithm ?? algoSelected, newFollowing, since, until, props.pool)
              : { filter: {kinds: [1], limit: 5, since: since, until: until}, followingStructure: [] };
            setFollowingStructure(filterObj.followingStructure);
            const newEvents = await fetchData(props.pool, since, false, until, isLoggedIn, props.nostrExists ?? false, keyValueRef.current,
              setLoading, setLoadingMore, setError, () => {}, streamedEvents, repostEvents, replyEvents, setLastFetchedTimestamp, setDeletedNoteIds, 
              setUserPublicKey, setInitialLoadComplete, filterObj.filter, handleEventReceived, selectedAlgorithm ?? algoSelected, range.name === '1 hour');
            allFetchedEvents.push(...(newEvents ?? []));
            //if (allFetchedEvents.length >= 5) break;
              setStreamedEvents(prevEvents => {
                if (!newEvents) return prevEvents;
                const uniqueEvents = Array.from(new Set([...prevEvents, ...newEvents].map(event => event.id)))
                    .map(id => [...prevEvents, ...newEvents].find(event => event.id === id))
                    .filter((event): event is ExtendedEvent => event !== undefined);
                return uniqueEvents.sort((a, b) => b.created_at - a.created_at);
            });

            if (range.name !== "1 hour") {
              allFetchedEvents.push(...(newEvents ?? []));
              const pubkeysToFetch = (newEvents ?? []).flatMap(event => {
                const pubkeys = [event.pubkey];
                if (event.repostedEvent) pubkeys.push(event.repostedEvent.pubkey);
                if (event.repliedEvent) pubkeys.push(event.repliedEvent.pubkey);
                if (event.rootEvent) pubkeys.push(event.rootEvent.pubkey);
                return pubkeys;
              });
              for (const event of newEvents ?? []) {
                if (props.pool) {
                  const repliesToFetch = [];
                  if (event.repliedEvent) repliesToFetch.push(event.repliedEvent);
                  if (event.rootEvent) repliesToFetch.push(event.rootEvent);
                }
                
                if (event.repostedEvent) {
                  pubkeysToFetch.push(event.repostedEvent.pubkey);
                } else if (event.repliedEvent) {
                  pubkeysToFetch.push(event.repliedEvent.pubkey);
                }
              }
              
              batchFetchMetadata(pubkeysToFetch);
            }
            
            if (allFetchedEvents.length >= 5) break;
          }

          allFetchedEvents = allFetchedEvents.slice(0, 5);
    
          if (allFetchedEvents.length > 0) {
            const newLastFetchedTimestamp = Math.min(...allFetchedEvents.map(event => event.created_at));
            setLastFetchedTimestamp(newLastFetchedTimestamp);
            setStreamedEvents(prevEvents => {
              const newEvents = [...prevEvents, ...allFetchedEvents];
              return newEvents
                .filter((event, index, self) => 
                  index === self.findIndex((e) => e.id === event.id)
                )
                .sort((a, b) => b.created_at - a.created_at);
            });
          }
          setInitialLoadComplete(true);
        } catch (error) {
          console.error("Error fetching data:", error);
        } finally {
          setLoading(false);
        }
    }, [props.pool,
      isPoolReady,
      initialLoadComplete,
      props.nostrExists,
      selectedAlgorithm]);

    useEffect(() => {
      fetchUserMetadata(props.pool, userPublicKey ?? "", setShowOstrich, setMetadata);
    }, [userPublicKey]);

    useEffect(() => {
      if (props.keyValue) {
        keyValueRef.current = props.keyValue;
      }
    }, [props.keyValue]);

    useEffect(() => {
      if (props.pool) {
        Promise.all(RELAYS.map(relay => props.pool!.ensureRelay(relay)))
          .then(() => setIsPoolReady(true))
          .catch((err) => console.error("Error connecting to relays:", err));
      }
    }, [props.pool]);

    useEffect(() => {
      if (
        props.pool && 
        isPoolReady && 
        isLoggedIn !== null && 
        !initialLoadComplete && 
        !hasFetchedRef.current
      ) {
        hasFetchedRef.current = true;
        initialLoadRef.current = true;
        const algoId = selectedAlgorithm?.algoId || null;
        clearCachedNotesOlderThanOneDay(algoId);
        fetchFollowingAndData();
      }
    }, [ props.pool,
      isPoolReady,
      isLoggedIn,
      initialLoadComplete,
      fetchFollowingAndData]);


    const debouncedLoadMore = debounce(async () => {
      if (!props.pool) return;
      setLoadingMore(true);
    
      const timeRanges = [
        { name: '1 hour', start: 0, end: 3600 },
        { name: '6 hours', start: 3600, end: 21600 },
        { name: '24 hours', start: 21600, end: 86400 },
        //{ name: '1 week', start: 86400, end: 604800 }
      ];
      
      let allFetchedEvents: ExtendedEvent[] = [];
      const oldestTimestamp = Math.min(...streamedEvents.map(e => e.created_at));
      const seenEventIds = new Set(streamedEvents.map(e => e.id));
      let allInFirstHour = false;
      for (const range of timeRanges) {
        if (allFetchedEvents.length >= 5) break;
        const since = oldestTimestamp - range.end;
        const until = oldestTimestamp - range.start;
        let filter = isLoggedIn
          ? { kinds: [1, 5, 6], since: since, until: until, authors: followers, limit: (range.name === '1 hour' ? 10 : 5) }
          : { kinds: [1, 5, 6], since: since, until: until, limit: 5 };
      
        const newEvents: ExtendedEvent[] = [];
        const handleNewEvent = (event: ExtendedEvent) => {
          if (!seenEventIds.has(event.id)) {
            newEvents.push(event);
            seenEventIds.add(event.id);
          }
        };
        await fetchData(props.pool, since, true, until, isLoggedIn ?? false, props.nostrExists ?? false, props.keyValue ?? "",
          setLoading, setLoadingMore, setError, setStreamedEvents, events, repostEvents, replyEvents, setLastFetchedTimestamp, setDeletedNoteIds, setUserPublicKey, 
          setInitialLoadComplete, filter, handleNewEvent, selectedAlgorithm, true);
        
        allFetchedEvents.push(...newEvents);
        if (allFetchedEvents.length >= 5 && range.name === '1 hour') allInFirstHour = true;
        if (allFetchedEvents.length >= 5) break;
      }
    
      if (allFetchedEvents.length > 0 && !allInFirstHour) {
        const newLastFetchedTimestamp = Math.min(...allFetchedEvents.map(event => event.created_at));
        setLastFetchedTimestamp(newLastFetchedTimestamp);
        
        setStreamedEvents(prev => {
          const newEvents = [...prev, ...allFetchedEvents];
          return newEvents.sort((a, b) => b.created_at - a.created_at);
        });
        const pubkeysToFetch = allFetchedEvents.flatMap(event => {
          const pubkeys = [event.pubkey];
          if (event.repostedEvent) pubkeys.push(event.repostedEvent.pubkey);
          if (event.repliedEvent) pubkeys.push(event.repliedEvent.pubkey);
          if (event.rootEvent) pubkeys.push(event.rootEvent.pubkey);
          return pubkeys;
        });
    
        batchFetchMetadata(pubkeysToFetch);
        const newRepostEvents = allFetchedEvents.filter(event => event.repostedEvent).map(event => event.repostedEvent!);
        const newReplyEvents = [
          ...allFetchedEvents.filter(event => event.repliedEvent).map(event => event.repliedEvent!),
          ...allFetchedEvents.filter(event => event.rootEvent).map(event => event.rootEvent!)
        ];
        _setRepostEvents(prev => [...prev, ...newRepostEvents]);
        _setReplyEvents(prev => [...prev, ...newReplyEvents]);
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
          await fetchFollowingAndData();
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
      adjustTextareaHeight();
    };

    const adjustTextareaHeight = () => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    };


    if (props.nostrExists === null) return null;

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
      rootEvent: null
    };

    return (
      <div className="pt-4 pb-20 md:pb-8">
        <Helmet>
          <title>Ghostcopywrite | Nostr Client</title>
          <meta property="og:title" content="Ghostcopywrite | Nostr Client" />
          <meta property="og:description" content="Let Freedom Ring" />
          <meta property="og:image" content="https://ghostcopywrite.com/ostrich.png" />
          <meta property="og:url" content="https://ghostcopywrite.com" />
          <meta property="og:type" content="website" />
          <meta name="twitter:card" content="summary_large_image" />
        </Helmet>

        {/* Composer */}
        {isLoggedIn && (
          <div className="card p-4 mb-6">
            <textarea
              ref={textareaRef}
              id="message" 
              className="input-field resize-none overflow-hidden mb-3"
              placeholder="What's on your mind?" 
              required
              value={message}
              onChange={handleTextareaChange}
              rows={2}
            />
            <div className="flex justify-between items-center">
              <div className="flex gap-1">
                <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="hidden" id="image-upload" ref={imageInputRef} />
                <button 
                  className={`btn-ghost p-2 text-gray-400 hover:text-violet-400 ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={triggerImageInput}
                  disabled={uploadingImage}
                  title="Upload image"
                >
                  {uploadingImage ? <Loading vCentered={false} tiny={true} /> : <PhotoIcon className="h-5 w-5" />}
                </button>
                <input type="file" accept="video/*" onChange={handleVideoUpload} disabled={uploadingVideo} className="hidden" id="video-upload" ref={videoInputRef} />
                <button 
                  className={`btn-ghost p-2 text-gray-400 hover:text-violet-400 ${uploadingVideo ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={triggerVideoInput}
                  disabled={uploadingVideo}
                  title="Upload video"
                >
                  {uploadingVideo ? <Loading vCentered={false} tiny={true} /> : <VideoCameraIcon className="h-5 w-5" />}
                </button>
              </div>
              <button 
                className={`btn-primary text-sm px-5 py-1.5 ${(posting || uploadingImage || uploadingVideo || !message.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={(_e) => handleSendMessage()}
                disabled={posting || uploadingImage || uploadingVideo || !message.trim()}
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>

            {/* Preview (only when typing) */}
            {message.trim() && (
              <div className="border-t border-[var(--color-border)] mt-3 pt-3">
                <span className="text-xs text-gray-500 mb-2 block">Preview</span>
                <NoteCard 
                  referencedNoteInput={null}
                  isPreview={true}
                  event={previewNote}
                  id={previewNote.id}
                  content={previewNote.content}
                  user={previewUser}
                  created_at={previewNote.created_at}
                  hashtags={[]}
                  pool={props.pool}
                  nostrExists={props.nostrExists}
                  keyValue={props.keyValue} 
                  deleted={undefined} 
                  repostedEvent={null} 
                  repliedEvent={null} 
                  connectionInfo={null}
                  rootEvent={null}
                  onUserClick={() => {}}         
                />
              </div>
            )}
          </div>
        )}

        {/* Feed */}
        {loading && !initialLoadComplete ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-700" />
                  <div className="space-y-2 flex-1">
                    <div className="h-3 bg-gray-700 rounded w-24" />
                    <div className="h-2 bg-gray-700 rounded w-16" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-700 rounded w-full" />
                  <div className="h-3 bg-gray-700 rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="card p-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {/* Algorithm Tabs */}
            {byoAlgo.length > 0 && (
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {byoAlgo.map(algo => (
                  <button
                    key={algo.algoId}
                    onClick={() => {
                      setSelectedAlgorithm(algo);
                      setStreamedEvents([]);
                      setLastFetchedTimestamp(Math.floor(Date.now() / 1000));
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                      selectedAlgorithm?.algoId === algo.algoId
                        ? 'bg-violet-600 text-white'
                        : 'bg-[var(--color-bg-card)] text-gray-400 hover:text-white border border-[var(--color-border)]'
                    }`}
                  >
                    {algo.name || 'Algorithm'}
                  </button>
                ))}
              </div>
            )}

            <div className={`w-full ${!isLoggedIn ? 'pointer-events-none opacity-50' : ''}`}>
              <NotesList 
                metadata={metadata} 
                notes={streamedEvents.filter(e => !deletedNoteIds.has(e.id)).filter((e, index, self) =>
                  index === self.findIndex((t) => t.id === e.id)
                )}
                pool={props.pool} 
                nostrExists={props.nostrExists} 
                keyValue={props.keyValue}
                setMetadata={setMetadata}
                initialLoadComplete={initialLoadComplete}
                calculateConnectionInfo={calculateConnectionInfo}
              />
              {streamedEvents.length > 0 && initialLoadComplete && isLoggedIn && (
                <div className="mt-6 mb-6 text-center">
                  {loadingMore ? (
                    <Loading vCentered={false} />
                  ) : (
                    <button className="btn-secondary" onClick={loadMore}>
                      Load More
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        <Ostrich show={showOstrich} onClose={() => setShowOstrich(false)} 
            text="Hey! Please " linkText="set up your profile to let users know who you are" 
            linkUrl="/edit-profile" />
      </div>
    )
  }
  export default Home;