import '../App.css';
import { nip19, SimplePool } from "nostr-tools";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import NotesList from "./NotesList";
import { useDebounce } from "use-debounce";
import { getBase64, sendMessage } from "../utils/helperFunctions";
import { ExtendedEvent, Metadata, Reaction, User } from "../utils/interfaces";
import Loading from "./Loading";
import { fetchUserMetadata, getFollowing, getUserPublicKey } from "../utils/profileUtils";
import { fetchMetadataReactionsAndReplies, fetchData } from '../utils/noteUtils';
import Ostrich from "./Ostrich";
import { showCustomToast } from "./CustomToast";
import { PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import NoteCard from "./NoteCard";
import { Helmet } from 'react-helmet';
import { cacheNotes, clearCachedNotesOlderThanOneDay, getCachedNotes, getMetadataFromCache, setMetadataToCache } from '../utils/cachingUtils';
import { RELAYS } from '../utils/constants';
import { debounce } from 'lodash';
import { API_URLS } from '../utils/apiConstants';
import { constructFilterFromBYOAlgo } from '../utils/algoUtils';
import { createAuthHeader } from '../utils/authUtils';
import { bech32 } from 'bech32';
import FaviconIcon from './FaviconIcon';
import TopicSelectionDialog from './TopicSelectionDialog';

interface HomeProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

const Home : React.FC<HomeProps> = (props: HomeProps) => {
    if (props.nostrExists === null) return;
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
    const [generatingPost, setGeneratingPost] = useState(false);
    const [isTopicDialogOpen, setIsTopicDialogOpen] = useState(false);
    const [_selectedTopic, setSelectedTopic] = useState<string | null>(null);

    const calculateConnectionInfo = (notePubkey: string) => {
      if (followers.includes(notePubkey)) {
        return { degree: 1 };
      } else if (followingStructure) {
        const secondDegreeConnection = followingStructure.find((fs: { following: string | string[]; }) => fs.following.includes(notePubkey));
        if (secondDegreeConnection) {
          const connectedThroughPubkey = secondDegreeConnection.id;
          if (!metadata[connectedThroughPubkey] && props.pool) {
            props.pool.subscribeManyEose(
              RELAYS,
              [{ kinds: [0], authors: [connectedThroughPubkey] }],
              {
                onevent(metadataEvent) {
                  try {
                    const newMetadata = JSON.parse(metadataEvent.content) as Metadata;
                    setMetadata(prev => ({...prev, [connectedThroughPubkey]: newMetadata}));
                    if (isLoggedIn) {
                      setMetadataToCache(connectedThroughPubkey, newMetadata);
                    }
                  } catch (error) {
                    console.error("Error parsing metadata:", error);
                  }
                }
              }
            );
          }
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
    };

    const handleEventReceived = useCallback((event: ExtendedEvent) => {
      setStreamedEvents(prev => {
        if (prev.some(e => e.id === event.id)) {
          return prev;
        }
        setLoading(false);
        const newEvents = [event, ...prev].sort((a, b) => b.created_at - a.created_at);
        cacheNotes(newEvents);
        return newEvents;
      });
      
      setHasNotes(true);
    
      const pubkeysToFetch = [event.pubkey];
    
      if (props.pool) {
        const repliesToFetch = [];
        if (event.repliedEvent) repliesToFetch.push(event.repliedEvent);
        if (event.rootEvent) repliesToFetch.push(event.rootEvent);
        fetchMetadataReactionsAndReplies(props.pool, [event], event.repostedEvent ? [event.repostedEvent] : [], 
          repliesToFetch, setMetadata, setReactions, setReplies, setReposts);
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
    }, [props.pool, metadata, isLoggedIn, setMetadata, setReactions, setReplies, setReposts]);


    const fetchFollowingAndData = useCallback(async () => {
      if (!props.pool || initialLoadComplete) return;
      //let setAlgo = false;
      // Fetch BYO algorithms
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
              //setAlgo = true;
            }
          }
        } catch (error) {
          console.error("Error fetching BYO algorithms:", error);
        }
      }
      //if (!setAlgo) {
        //setLoading(true);


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
          catch {}
          try {
            if (keyValueRef.current) {
              if (!newFollowing.includes(pk)) newFollowing.push(pk);
            }
          } catch (error) {}
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
            const since = now - range.end;
            const until = now - range.start;
            let filterObj = isLoggedIn
              ? await constructFilterFromBYOAlgo(selectedAlgorithm ?? algoSelected, newFollowing, since, props.pool)
              : { filter: {kinds: [1], limit: 10, since: since, until: until}, followingStructure: [] };
            setFollowingStructure(filterObj.followingStructure);
            const newEvents = await fetchData(props.pool, since, false, until, isLoggedIn, props.nostrExists ?? false, keyValueRef.current,
              setLoading, setLoadingMore, setError, () => {}, streamedEvents, repostEvents, replyEvents, setLastFetchedTimestamp, setDeletedNoteIds, 
              setUserPublicKey, setInitialLoadComplete, filterObj.filter, handleEventReceived, selectedAlgorithm ?? algoSelected, range.name === '1 hour');
            
            if (range.name !== "1 hour") {
              allFetchedEvents.push(...(newEvents ?? []));
              const pubkeysToFetch = (newEvents ?? []).flatMap(event => {
                const pubkeys = [event.pubkey];
                if (event.repostedEvent) pubkeys.push(event.repostedEvent.pubkey);
                if (event.repliedEvent) pubkeys.push(event.repliedEvent.pubkey);
                if (event.rootEvent) pubkeys.push(event.rootEvent.pubkey);
                return pubkeys;
              });
    
              newEvents?.forEach(event => {
                if (props.pool) {
                  const repliesToFetch = [];
                  if (event.repliedEvent) repliesToFetch.push(event.repliedEvent);
                  if (event.rootEvent) repliesToFetch.push(event.rootEvent);
                  fetchMetadataReactionsAndReplies(props.pool, [event], event.repostedEvent ? [event.repostedEvent] : [], 
                    repliesToFetch, setMetadata, setReactions, setReplies, setReposts);
                }
                
                if (event.repostedEvent) {
                  pubkeysToFetch.push(event.repostedEvent.pubkey);
                } else if (event.repliedEvent) {
                  pubkeysToFetch.push(event.repliedEvent.pubkey);
                }
              });
              
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
            }
            
            
            if (allFetchedEvents.length >= 10) break;
          }
    
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
    }, [selectedAlgorithm]);

    useEffect(() => {
      fetchUserMetadata(props.pool, userPublicKey ?? "", setShowOstrich, setMetadata);
    }, [userPublicKey]);

    useEffect(() => {
      if (props.keyValue) {
        keyValueRef.current = props.keyValue;
      }
    }, [props.keyValue]);

    useEffect(() => {
      if (props.pool && isLoggedIn !== null && !initialLoadComplete) {
        initialLoadRef.current = true;
        setLoading(true);
        clearCachedNotesOlderThanOneDay();
        const cachedNotes = getCachedNotes();
        if (cachedNotes.length > 0) {
            setStreamedEvents(cachedNotes);
            setHasNotes(true);
            setLoading(false);
            setInitialLoadComplete(true);
        }
        fetchFollowingAndData();
      }
    }, [initialLoadComplete]);


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
      
      for (const range of timeRanges) {
        const since = oldestTimestamp - range.end;
        const until = oldestTimestamp - range.start;
        let filter = isLoggedIn
          ? { kinds: [1, 5, 6], since: since, until: until, authors: followers, limit: 50 }
          : { kinds: [1, 5, 6], since: since, until: until, limit: 50 };
      
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
        if (allFetchedEvents.length >= 10) break;
      }
    
      if (allFetchedEvents.length > 0) {
        const newLastFetchedTimestamp = Math.min(...allFetchedEvents.map(event => event.created_at));
        setLastFetchedTimestamp(newLastFetchedTimestamp);
        
        setStreamedEvents(prev => {
          const newEvents = [...prev, ...allFetchedEvents];
          return newEvents.sort((a, b) => b.created_at - a.created_at);
        });
        const newRepostEvents = allFetchedEvents.filter(event => event.repostedEvent).map(event => event.repostedEvent!);
        const newReplyEvents = [
          ...allFetchedEvents.filter(event => event.repliedEvent).map(event => event.repliedEvent!),
          ...allFetchedEvents.filter(event => event.rootEvent).map(event => event.rootEvent!)
        ];
        _setRepostEvents(prev => [...prev, ...newRepostEvents]);
        _setReplyEvents(prev => [...prev, ...newReplyEvents]);
        await fetchMetadataReactionsAndReplies(props.pool, allFetchedEvents, newRepostEvents, newReplyEvents, setMetadata, setReactions, setReplies, setReposts);
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
    
    const handleTopicSelection = async (topic: string) => {
      setSelectedTopic(topic);
      setGeneratingPost(true);
      try {
        const response = await fetch(`${API_URLS.API_URL}llama`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: `Please write a sample social media post about ${topic}. 
            Please make it concise and exactly how it would appear on the platform. 
            Please also leave out any reference to it being a sample, I want the text only.`
          }),
        });
    
        if (!response.ok) {
          throw new Error('Failed to generate post');
        }
    
        const data = await response.json();
        setMessage(data.response);
        setTimeout(adjustTextareaHeight, 0);
      } catch (error) {
        console.error('Error generating post:', error);
        showCustomToast('Failed to generate post. Please try again.', 'error');
      } finally {
        setGeneratingPost(false);
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
      rootEvent: null
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
                  <button 
                    className={`flex items-center justify-center font-bold p-16 rounded bg-transparent cursor-pointer ${generatingPost ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => setIsTopicDialogOpen(true)}
                    disabled={generatingPost}
                  >
                    {generatingPost ? <Loading vCentered={false} tiny={true} /> : <FaviconIcon className="h-5 w-5 cursor-pointer" />}
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
                connectionInfo={null}
                rootEvent={null}
                onUserClick={() => {}}         
              />
            </div>
          </div>
        )}
        {loading && !initialLoadComplete ? (
          <Loading vCentered={false} />
        ) : error ? (
          <div className="text-red-500 text-center mt-4">{error}</div>
        ) : (
          <>
          <div className="flex space-x-4">
            <div className="flex border-b border-gray-600">
            {byoAlgo.map(algo => (
              <button
                key={algo.algoId}
                onClick={() => {
                  setSelectedAlgorithm(algo);
                  setStreamedEvents([]);
                  setLastFetchedTimestamp(Math.floor(Date.now() / 1000));
                }}
                className={`px-32 py-2 mx-8 -mb-px ${
                  selectedAlgorithm?.algoId === algo.algoId
                    ? 'bg-[#242424] border-t border-l border-r border-blue-500 text-white rounded-t-md'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white rounded-t-md border-transparent'
                }`}
              >
                {algo.name || 'Algorithm'}
              </button>
            ))}
          </div>
        </div>
            <div className={`w-full ${!isLoggedIn ? 'pointer-events-none opacity-50' : ''}`}>
              <NotesList 
                metadata={metadata} 
                reactions={reactions} 
                notes={streamedEvents.filter(e => !deletedNoteIds.has(e.id)).filter((e, index, self) =>
                  index === self.findIndex((t) => t.id === e.id)
                )}
                pool={props.pool} 
                nostrExists={props.nostrExists} 
                keyValue={props.keyValue}
                replies={replies} 
                reposts={reposts} 
                setMetadata={setMetadata}
                initialLoadComplete={initialLoadComplete}
                calculateConnectionInfo={calculateConnectionInfo}
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
        </>)}
        <Ostrich show={showOstrich} onClose={() => setShowOstrich(false)} 
            text="Hey! Please " linkText="set up your profile to let users know who you are" 
            linkUrl="/edit-profile" />
        <TopicSelectionDialog
          isOpen={isTopicDialogOpen}
          onClose={() => setIsTopicDialogOpen(false)}
          onSelectTopic={handleTopicSelection}
        />
      </div>
    )
  }
  export default Home;