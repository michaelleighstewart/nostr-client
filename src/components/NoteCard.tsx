import { BoltIcon, HandThumbUpIcon, HandThumbDownIcon, TrashIcon, ChatBubbleLeftIcon, ArrowPathRoundedSquareIcon } from "@heroicons/react/16/solid";
import { sendZap, reactToPost, deletePost, bech32Decoder, repostMessage } from "../utils/helperFunctions";
import { SimplePool, getPublicKey } from "nostr-tools";
import { useState, useEffect, useRef } from "react";
import { showCustomToast } from './CustomToast';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import React from "react";
import { RELAYS } from "../utils/constants";
import { Metadata, Reaction, User, ExtendedEvent, Reply } from "../utils/interfaces";
import VideoEmbed from "./VideoEmbed";
import ProfilesModal from "./ProfilesModal";
import Loading from "./Loading";
import ConnectionInfoDialog from './ConnectionInfoDialog';
import { QuestionMarkCircleIcon } from '@heroicons/react/24/solid';
import { getCachedCounts, updateCachedCounts } from "../utils/cachingUtils";
import { fetchReactionsAndRepliesAlt, fetchMetadataAlt } from '../utils/noteUtils';
import AudioEmbed from "./AudioEmbed";

interface Props {
    id: string;
    event?: ExtendedEvent | null;
    content: string;
    user: User;
    created_at: number;
    hashtags: string[];
    pool: SimplePool | null;
    nostrExists: boolean | null;
    keyValue: string;
    deleted: boolean | undefined;
    repostedEvent: ExtendedEvent | null;
    repliedEvent: ExtendedEvent | null;
    isPreview: boolean;
    connectionInfo: {
      degree: number;
      connectedThrough?: {
        name: string;
        picture: string;
      };
    } | null;
    replyDepth?: number;
    rootEvent: ExtendedEvent | null;
    onUserClick: (pubkey: string) => void;
    referencedNoteInput: ExtendedEvent | null;
    reply?: Reply | null;
  }

  interface CachedCounts {
    reactions: number;
    dislikes: number;
    reposts: number;
    replies: number;
  }
  
  const NoteCard = React.memo(function NoteCard({
    id,
    event,
    content,
    user,
    created_at,
    hashtags,
    pool,
    nostrExists,
    keyValue,
    deleted,
    repostedEvent,
    repliedEvent,
    isPreview, 
    connectionInfo,
    replyDepth,
    rootEvent,
    onUserClick,
    referencedNoteInput
  }: Props) {
    const [alreadyLiked, setAlreadyLiked] = useState(false);
    const [alreadyDisliked, setAlreadyDisliked] = useState(false);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [localReactions, setLocalReactions] = useState<Reaction[]>([]);
    const [localReplies, setLocalReplies] = useState<ExtendedEvent[]>([]);
    const [localReposts, setLocalReposts] = useState<ExtendedEvent[]>([]);
    const [canDelete, setCanDelete] = useState(false);
    const [localDeleted, setLocalDeleted] = useState(deleted);
    const [userNpub, setUserNpub] = useState<string>('');
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [_videoUrls, setVideoUrls] = useState<string[]>([]);
    const [processedContent, setProcessedContent] = useState<React.ReactNode[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
    const [showLikesModal, setShowLikesModal] = useState(false);
    const [showDislikesModal, setShowDislikesModal] = useState(false);
    const [showRepostsModal, setShowRepostsModal] = useState(false);
    const [isConnectionInfoOpen, setIsConnectionInfoOpen] = useState(false);
    const navigate = useNavigate();
    const [cachedReactions, setCachedReactions] = useState<number | null>(null);
    const [cachedReposts, setCachedReposts] = useState<number | null>(null);
    const [cachedReplies, setCachedReplies] = useState<number | null>(null);
    const [cachedCounts, setCachedCounts] = useState<CachedCounts | null>(null);
    const [referencedNote, setReferencedNote] = useState<ExtendedEvent | null>(referencedNoteInput);
    const [currentIndex, setCurrentIndex] = useState(0);
    const carouselRef = useRef<HTMLDivElement>(null);
    const [isAccordionOpen, setIsAccordionOpen] = useState(false);
    const [loadingCounts, setLoadingCounts] = useState(true);
    const [metadata, setMetadata] = useState<Record<string, Metadata>>({});
    const [_audioUrls, setAudioUrls] = useState<string[]>([]);
    const contentSubsRef = useRef<any[]>([]);
    const fetchedEntityIdsRef = useRef<Set<string>>(new Set());

    const toggleAccordion = async () => {
      setIsAccordionOpen(prev => !prev);
      if (!isAccordionOpen) {
        if (pool && event) {
          setLoadingCounts(true);
          const result = await fetchReactionsAndRepliesAlt(pool, [event], repostedEvent ? [repostedEvent] : [], localReplies) as {
            reactions: Record<string, Reaction[]>;
            replies: Record<string, ExtendedEvent[]>;
            reposts: Record<string, ExtendedEvent[]>;
          };
          setLocalReactions(result.reactions[id]);
          setLocalReposts(result.reposts[id]);
          setLocalReplies(result.replies[id]);
          setLoadingCounts(false);
        }
      }
    };

    useEffect(() => {
      const fetchUserMetadata = async () => {
        if (!pool || !user.pubkey) return;
        if (event) {
          const repliesToFetch = [];
          if (event.repliedEvent) repliesToFetch.push(event.repliedEvent);
          if (event.rootEvent) repliesToFetch.push(event.rootEvent);
          const metaData = await fetchMetadataAlt(pool, [event], event.repostedEvent ? [event.repostedEvent] : [], repliesToFetch);
          setMetadata(prev => ({...prev, ...metaData}));
        }
      };
    
      fetchUserMetadata();
    }, [pool, user.pubkey, event, repostedEvent, repliedEvent]);


    useEffect(() => {
      const imageRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/gi;
      const imageMatches: string[] = content.match(imageRegex) || [];
      setImageUrls(imageMatches);
    }, [content]);
  
    const handleNext = () => {
      if (currentIndex < imageUrls.length - 1) {
          setCurrentIndex((prevIndex) => prevIndex + 1);
      }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex((prevIndex) => prevIndex - 1);
        }
    };

    useEffect(() => {
      const fetchedCachedCounts = getCachedCounts(id);
      if (fetchedCachedCounts) {
        setCachedCounts(fetchedCachedCounts);
      }
    }, [id]);

    useEffect(() => {
      if (!cachedCounts) return;
      const newReactions = localReactions?.filter(r => r.type === "+").length || 0;
      const newDislikes = localReactions?.filter(r => r.type === "-").length || 0;
      const newReposts = localReposts.length || 0;
      const newReplies = localReplies.length || 0;

      if (newReactions > cachedCounts.reactions || newDislikes > cachedCounts.dislikes || newReposts > cachedCounts.reposts || newReplies > cachedCounts.replies) {
        const updatedCounts = {
          reactions: Math.max(newReactions, cachedCounts.reactions),
          dislikes: Math.max(newDislikes, cachedCounts.dislikes),
          reposts: Math.max(newReposts, cachedCounts.reposts),
          replies: Math.max(newReplies, cachedCounts.replies),
          timestamp: Date.now()
        };
        updateCachedCounts(id, updatedCounts);
        setCachedCounts(updatedCounts);
      }
  }, [id, localReactions, localReposts, localReplies, cachedCounts]);

    const openConnectionInfo = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsConnectionInfoOpen(true);
    };

    function checkReactions() {
      if (publicKey && localReactions) {
        setAlreadyLiked(localReactions.some((r) => r.liker_pubkey === publicKey && r.type === "+"));
        setAlreadyDisliked(localReactions.some((r) => r.liker_pubkey === publicKey && r.type === "-"));
      } else if (!user.pubkey) {
        setAlreadyLiked(true);
        setAlreadyDisliked(true);
      }
    }

    useEffect(() => {
      const cachedCounts = getCachedCounts(id);
      if (cachedCounts) {
        setCachedReactions(cachedCounts.reactions);
        setCachedReposts(cachedCounts.reposts);
        setCachedReplies(cachedCounts.replies);
      }
    
      const updateCache = () => {
        const newReactions = localReactions?.length || 0;
        const newReposts = localReposts?.length || 0;
        const newReplies = localReplies?.length || 0;

        if (newReactions > (cachedReactions || 0) || newReposts > (cachedReposts || 0) || newReplies > (cachedReplies || 0)) {
          updateCachedCounts(id, {
            reactions: Math.max(newReactions, cachedReactions || 0),
            reposts: Math.max(newReposts, cachedReposts || 0),
            replies: Math.max(newReplies, cachedReplies || 0)
          });
          setCachedReactions(Math.max(newReactions, cachedReactions || 0));
          setCachedReposts(Math.max(newReposts, cachedReposts || 0));
          setCachedReplies(Math.max(newReplies, cachedReplies || 0));
        }
      };
    
      updateCache();
  }, [id, localReactions, localReposts, localReplies]);

    useEffect(() => {
      contentSubsRef.current.forEach(s => s?.close());
      contentSubsRef.current = [];

      const imageRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/gi;
      const imageMatches: string[] = content.match(imageRegex) || [];
      setImageUrls(imageMatches);

      const videoRegex = /(https?:\/\/.*\.(?:mp4|avi|mov))/gi;
      const videoMatches: string[] = content.match(videoRegex) || [];
      setVideoUrls(videoMatches);

      const audioRegex = /(https?:\/\/.*?\.(?:mp3|wav|ogg|m4a)(?:[^"\s]*)?(?:\?[^"\s]*)?)/gi;
      const audioMatches: string[] = content.match(audioRegex) || [];
      setAudioUrls(audioMatches);

      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/g;
      const youtubeMatch = youtubeRegex.exec(content);
      if (youtubeMatch && youtubeMatch[1]) {
        setYoutubeVideoId(youtubeMatch[1]);
      }

      const linkRegex = /(https?:\/\/[^\s]+)/g;
      const nostrBech32Regex = /(nostr:(naddr|npub|note|nsec|nprofile|nevent)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+)\b/g;
      const hashtagRegex = /#(\w+)/g;

      const eventIdsToFetch: string[] = [];
      const pubkeysToFetch: string[] = [];
      const naddrToFetch: {pubkey: string, identifier: string}[] = [];

      const parts: string[] = content.split(linkRegex);
      
      const processed = parts.map((part, index) => {
        if (part.match(linkRegex)) {
          if (audioMatches.includes(part)) return <AudioEmbed url={part} />;
          if (videoMatches.includes(part)) return <VideoEmbed key={index} url={part} />;
          if (!imageMatches.includes(part) && !youtubeMatch) {
            return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 hover:underline break-all">{part}</a>;
          }
          return null;
        }
        let result: (string | JSX.Element)[] = [];
        let lastIndex = 0;
        let match;

        while ((match = nostrBech32Regex.exec(part)) !== null) {
          const [fullMatch, nostrEntity] = match;
          const beforeText = part.slice(lastIndex, match.index);
          if (beforeText) result.push(beforeText);

          try {
            const decoded = nip19.decode(nostrEntity.slice(6));
            if (decoded.type === 'nevent') {
              if (!fetchedEntityIdsRef.current.has(decoded.data.id)) {
                eventIdsToFetch.push(decoded.data.id);
              }
            } else if (decoded.type === 'naddr' && decoded.data.kind === 30023) {
              naddrToFetch.push({pubkey: decoded.data.pubkey, identifier: decoded.data.identifier});
            }
            if (decoded.type === 'npub') {
              if (!metadata?.[decoded.data]) pubkeysToFetch.push(decoded.data);
              const npub = nostrEntity.slice(6);
              const name = metadata?.[decoded.data]?.name || npub;
              result.push(
                <Link key={`npub-${index}-${match.index}`} to={`/profile/${npub}`}
                  className="text-violet-400 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                  @{name}
                </Link>
              );
            } else if (decoded.type === 'note') {
              if (!fetchedEntityIdsRef.current.has(decoded.data)) {
                eventIdsToFetch.push(decoded.data);
              }
            } else if (decoded.type !== 'nevent' && decoded.type !== 'naddr') {
              result.push(
                <Link key={`nostr-${index}-${match.index}`} to={`/profile/${nostrEntity.slice(6)}`}
                  className="text-violet-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {nostrEntity}
                </Link>
              );
            }
          } catch (error) {
            console.error("Error decoding Nostr entity:", error);
            result.push(fullMatch);
          }
          lastIndex = match.index + fullMatch.length;
        }
        if (lastIndex < part.length) result.push(part.slice(lastIndex));

        return result.map((item: string | JSX.Element, i) => {
          if (typeof item === 'string') {
            const lines = item.split('\n');
            return (
              <span key={`${index}-${i}`}>
                {lines.map((line, lineIndex) => (
                  <React.Fragment key={lineIndex}>
                    {lineIndex > 0 && <br />}
                    {line.split(hashtagRegex).map((segment, segmentIndex) => {
                      if (segmentIndex % 2 === 1) {
                        return (
                          <Link key={segmentIndex} to={`/people-to-follow?hashtag=${segment}`}
                            className="text-violet-400 hover:underline" onClick={(e) => e.stopPropagation()}>
                            #{segment}
                          </Link>
                        );
                      }
                      return segment;
                    })}
                  </React.Fragment>
                ))}
              </span>
            );
          }
          return item;
        });
      });

      setProcessedContent(processed.flat().filter(Boolean));

      if (!pool) return;

      const newEventIds = [...new Set(eventIdsToFetch)].filter(id => !fetchedEntityIdsRef.current.has(id));
      if (newEventIds.length > 0) {
        newEventIds.forEach(id => fetchedEntityIdsRef.current.add(id));
        const sub = pool.subscribeManyEose(RELAYS, [{ids: newEventIds}], {
          onevent(event) {
            setReferencedNote({
              id: event.id, content: event.content, created_at: event.created_at,
              pubkey: event.pubkey, tags: event.tags, deleted: false,
              repostedEvent: null, repliedEvent: null, rootEvent: null
            });
            if (!metadata?.[event.pubkey]) pubkeysToFetch.push(event.pubkey);
          },
          onclose() {
            sub?.close();
            const uncached = [...new Set(pubkeysToFetch)].filter(pk => !metadata?.[pk]);
            if (uncached.length > 0 && pool) {
              const metaSub = pool.subscribeManyEose(RELAYS, [{kinds: [0], authors: uncached}], {
                onevent(e) {
                  try {
                    const m = JSON.parse(e.content);
                    setMetadata(prev => ({...prev, [e.pubkey]: {name: m.name || m.display_name || m.username || 'Unknown', picture: m.picture}}));
                  } catch {}
                },
                onclose() { metaSub?.close(); }
              });
              contentSubsRef.current.push(metaSub);
            }
          }
        });
        contentSubsRef.current.push(sub);
      } else {
        const uncached = [...new Set(pubkeysToFetch)].filter(pk => !metadata?.[pk]);
        if (uncached.length > 0) {
          const sub = pool.subscribeManyEose(RELAYS, [{kinds: [0], authors: uncached}], {
            onevent(event) {
              try {
                const m = JSON.parse(event.content);
                setMetadata(prev => ({...prev, [event.pubkey]: {name: m.name || m.display_name || m.username || 'Unknown', picture: m.picture}}));
              } catch {}
            },
            onclose() { sub?.close(); }
          });
          contentSubsRef.current.push(sub);
        }
      }

      if (naddrToFetch.length > 0) {
        const sub = pool.subscribeManyEose(RELAYS,
          naddrToFetch.map(ref => ({kinds: [30023], authors: [ref.pubkey], '#d': [ref.identifier]})),
          {
            onevent(event) {
              const npub = nip19.npubEncode(event.pubkey);
              setProcessedContent(prevContent => {
                if (prevContent.some(item => item !== null && typeof item === 'object' && 'key' in item && item.key === `preview-${event.id}`)) return prevContent;
                return [...prevContent,
                  <div key={`preview-${event.id}`} className="card p-4 my-3">
                    <h3 className="text-base font-semibold text-white">{event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'}</h3>
                    <p className="text-sm text-gray-400 my-2">{event.tags.find(tag => tag[0] === 'summary')?.[1] || 'No summary available'}</p>
                    {event.tags.find(tag => tag[0] === 'image')?.[1] && (
                      <img src={event.tags.find(tag => tag[0] === 'image')?.[1]} alt={event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'} className="w-full h-auto max-h-96 object-contain rounded-lg my-2" />
                    )}
                    <a href={`https://highlighter.com/${npub}`} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline text-sm">View on Highlighter</a>
                  </div>
                ];
              });
            },
            onclose() { sub?.close(); }
          }
        );
        contentSubsRef.current.push(sub);
      }

      return () => {
        contentSubsRef.current.forEach(s => s?.close());
        contentSubsRef.current = [];
      };
    }, [content, metadata]);
  
    useEffect(() => {
      async function fetchPublicKey() {
        try {
          if ((window as any).nostr && (window as any).nostr.getPublicKey) {
            const pk = await (window as any).nostr.getPublicKey();
            if (pk === user.pubkey) {
              setCanDelete(true);
            }
            setPublicKey(pk);
            return;
          }
        } catch {
          // Extension error (e.g. nos2x key not found) - fall through to keyValue
        }
        if (keyValue) {
          try {
            let skDecoded = bech32Decoder('nsec', keyValue);
            let pk = getPublicKey(skDecoded);
            setPublicKey(pk);
            if (pk === user.pubkey) {
              setCanDelete(true);
            }
          } catch (error) {
            console.error("Error decoding key or getting public key:", error);
            setPublicKey(null);
            setCanDelete(false);
          }
        } else {
          setPublicKey(null);
          setCanDelete(false);
        }
      }
      fetchPublicKey();
      checkReactions();
    }, []);

    useEffect(() => {
      if (keyValue) {
        try {
          let skDecoded = bech32Decoder('nsec', keyValue);
          let pk = getPublicKey(skDecoded);
          if (pk === user.pubkey) {
            setCanDelete(true);
          }
        }
        catch {
          setCanDelete(false)
        }
      }
      else {
        setCanDelete(false);
      }
    }, [keyValue]);
  
    useEffect(() => {
      checkReactions();
    }, [publicKey, localReactions, user.pubkey]);

    useEffect(() => {
      if (user.pubkey) {
        const npub = nip19.npubEncode(user.pubkey);
        setUserNpub(npub);
      }
    }, [user.pubkey]);
  
    const handleReaction = (type: string) => {
      reactToPost(user, id, pool, nostrExists, type, publicKey, keyValue).then((newReaction) => {
        if (newReaction) {
          setLocalReactions((prevReactions) => [...prevReactions, newReaction]);
        }
      });
    };

    const handleDelete = (id: string) => {
      deletePost(id, pool, nostrExists, keyValue).then((result) => {
        if (result.success) {
          showCustomToast("Post deleted", "success");
          setLocalDeleted(true);
        }
        else {
          showCustomToast("Failed to delete post", "error");
        }
      });
    }

    const handleImageClick = (url: string) => {
      setSelectedImage(url);
    };

    const handleRepost = () => {
      repostMessage(pool, nostrExists, keyValue, id, user.pubkey, content).then((result) => {
        if (result) {
          showCustomToast("Post reposted", "success");
        }
        else {
          showCustomToast("Failed to repost post", "error");
        }
      });
    };

    const handleShowLikes = () => setShowLikesModal(true);
    const handleShowDislikes = () => setShowDislikesModal(true);
    const handleShowReposts = () => setShowRepostsModal(true);

    const formatTime = (timestamp: number) => {
      const now = Date.now() / 1000;
      const diff = now - timestamp;
      if (diff < 60) return 'just now';
      if (diff < 3600) return `${Math.floor(diff / 60)}m`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
      if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
      return new Date(timestamp * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    if (localDeleted) {
      return (
        <div className="card p-4 opacity-60">
          <p className="text-sm text-gray-500 italic">This post has been deleted</p>
        </div>
      );
    }

    return (
      <div className="card p-4 hover:border-[var(--color-border-light)] transition-colors duration-150">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            {user.image ? (
              <Link to={`/profile/${userNpub}`} className="flex-shrink-0">
                <img
                  src={user.image}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
                />
              </Link>
            ) : (
              <Link to={`/profile/${userNpub}`} className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600/20 flex items-center justify-center">
                <span className="text-violet-400 text-sm font-bold">
                  {(user.name || '?')[0]?.toUpperCase()}
                </span>
              </Link>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link to={`/profile/${userNpub}`} className="text-sm font-semibold text-white hover:text-violet-400 truncate transition-colors">
                  {user.name}
                </Link>
                {connectionInfo && (
                  <button
                    onClick={openConnectionInfo}
                    className="flex-shrink-0 text-violet-400/60 hover:text-violet-400 transition-colors"
                    title="Connection info"
                  >
                    <QuestionMarkCircleIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Link to={`/note/${id}`} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
                {formatTime(created_at)}
              </Link>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="text-sm text-gray-200 leading-relaxed mb-3 break-words">
          <div>{processedContent}</div>
        </div>

        {/* Images */}
        {imageUrls.length > 0 && (
          <div className="mb-3 -mx-1">
            {imageUrls.length > 1 && (
              <div className="flex items-center justify-center gap-2 mb-2">
                <button
                  onClick={handlePrev}
                  disabled={currentIndex === 0}
                  className={`btn-ghost px-3 py-1 text-xs ${currentIndex === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  Prev
                </button>
                <span className="text-xs text-gray-500">{currentIndex + 1} / {imageUrls.length}</span>
                <button
                  onClick={handleNext}
                  disabled={currentIndex === imageUrls.length - 1}
                  className={`btn-ghost px-3 py-1 text-xs ${currentIndex === imageUrls.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                >
                  Next
                </button>
              </div>
            )}
            <div ref={carouselRef} className="overflow-hidden rounded-lg">
              <div
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
              >
                {imageUrls.map((url, index) => (
                  <div key={index} className="w-full flex-shrink-0">
                    <img
                      src={url}
                      alt={`Post content ${index + 1}`}
                      className="w-full h-auto rounded-lg cursor-pointer object-cover"
                      style={{ maxHeight: '500px' }}
                      onClick={(e) => { e.stopPropagation(); handleImageClick(url); }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* YouTube */}
        {youtubeVideoId && (
          <div className="mb-3 rounded-lg overflow-hidden">
            <iframe
              width="100%"
              height="315"
              src={`https://www.youtube.com/embed/${youtubeVideoId}`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="rounded-lg"
            />
          </div>
        )}

        {/* Referenced Note */}
        {referencedNote && (
          <div className="mb-3 border-l-2 border-violet-500/30 pl-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-gray-500">Referenced Note</span>
              <Link to={`/note/${referencedNote.id}`} className="text-xs text-violet-400 hover:underline">
                View
              </Link>
            </div>
            <NoteCard
              id={referencedNote.id}
              event={referencedNote}
              content={referencedNote.content}
              user={{
                name: metadata?.[referencedNote.pubkey]?.name ?? `${nip19.npubEncode(referencedNote.pubkey).slice(0, 12)}...`,
                image: metadata?.[referencedNote.pubkey]?.picture,
                pubkey: referencedNote.pubkey,
                nip05: metadata?.[referencedNote.pubkey]?.nip05
              }}
              created_at={referencedNote.created_at}
              hashtags={[]}
              isPreview={true}
              pool={pool}
              nostrExists={nostrExists}
              keyValue={keyValue}
              connectionInfo={null}
              onUserClick={onUserClick}
              deleted={false}
              repostedEvent={null}
              repliedEvent={null}
              rootEvent={null}
              referencedNoteInput={null}
            />
          </div>
        )}

        {/* Replied Event Label */}
        {repliedEvent && (
          <div className="mb-2 border-l-2 border-violet-500/30 pl-3">
            <span className="text-xs text-gray-500">Replied</span>
          </div>
        )}

        {/* Reposted Event */}
        {repostedEvent && (
          <div className="mb-3 border-l-2 border-violet-500/30 pl-3">
            <span className="text-xs text-gray-500 mb-1.5 block">Reposted</span>
            <NoteCard
              referencedNoteInput={referencedNote}
              event={repostedEvent}
              isPreview={false}
              id={repostedEvent.id}
              content={repostedEvent.content}
              user={{
                name: metadata?.[repostedEvent.pubkey]?.name ?? `${nip19.npubEncode(repostedEvent.pubkey).slice(0, 12)}...`,
                image: metadata?.[repostedEvent.pubkey]?.picture,
                pubkey: repostedEvent.pubkey,
                nip05: metadata?.[repostedEvent.pubkey]?.nip05
              }}
              created_at={repostedEvent.created_at}
              hashtags={[]}
              pool={pool}
              nostrExists={nostrExists}
              keyValue={keyValue}
              deleted={repostedEvent.deleted}
              repostedEvent={null}
              repliedEvent={repliedEvent}
              connectionInfo={null}
              rootEvent={null}
              onUserClick={onUserClick}
            />
          </div>
        )}

        {/* Reply depth indicator */}
        {replyDepth && replyDepth > 0 && (
          <div 
            className="absolute left-0 top-0 bottom-0 border-l-2 border-violet-500/20"
            style={{ left: `${(replyDepth - 1) * 20}px` }}
          />
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {hashtags
              .filter((t) => hashtags.indexOf(t) === hashtags.lastIndexOf(t))
              .map((hashtag) => (
                <Link
                  key={hashtag}
                  to={`/people-to-follow?hashtag=${hashtag}`}
                  className="text-xs text-violet-400 bg-violet-500/10 rounded-full px-2.5 py-0.5 hover:bg-violet-500/20 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{hashtag}
                </Link>
              ))}
          </div>
        )}

        {/* Action Bar */}
        {!isPreview && (
          <div className="flex items-center pt-2 border-t border-[var(--color-border)]/50">
            <button
              onClick={toggleAccordion}
              className="btn-ghost p-1.5 mr-1"
              title={isAccordionOpen ? 'Hide interactions' : 'Show interactions'}
            >
              <svg
                className={`w-4 h-4 text-gray-500 transform transition-transform duration-200 ${isAccordionOpen ? 'rotate-180' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!repostedEvent && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => navigate(`/note/${id}`)}
                  className="btn-ghost p-1.5 text-gray-500 hover:text-violet-400"
                  title="View thread"
                >
                  <ChatBubbleLeftIcon className="h-4 w-4" />
                </button>
                {cachedCounts && (
                  <span className="text-xs text-gray-600 mr-2">
                    {cachedCounts.replies || ''}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Expanded Actions */}
        {isAccordionOpen && (
          <div className="flex flex-wrap items-center gap-1 pt-2 mt-1">
            {!repostedEvent && !isPreview && (
              <>
                <ActionButton
                  icon={<BoltIcon className="h-4 w-4" />}
                  onClick={() => sendZap(user, id)}
                  disabled={!user.nip05}
                  title={user.nip05 ? `Zap ${user.name}` : `${user.name} has no zaps`}
                  color="yellow"
                />
                <ActionButton
                  icon={<HandThumbUpIcon className="h-4 w-4" />}
                  onClick={() => handleReaction("+")}
                  disabled={alreadyLiked}
                  title={!alreadyLiked ? "Like" : "Already liked"}
                />
                {loadingCounts ? (
                  <Loading vCentered={false} tiny={true} />
                ) : (
                  <button className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors" onClick={handleShowLikes}>
                    {localReactions.filter((r) => r.type !== "-").length || ''}
                  </button>
                )}
                <ProfilesModal
                  npubs={localReactions.length ? localReactions.filter(r => r.type !== "-").map(r => nip19.npubEncode(r.liker_pubkey)) : []}
                  pool={pool}
                  isOpen={showLikesModal}
                  onClose={() => setShowLikesModal(false)}
                  title="Users Who Liked This Note"
                />

                <ActionButton
                  icon={<HandThumbDownIcon className="h-4 w-4" />}
                  onClick={() => handleReaction("-")}
                  disabled={alreadyDisliked}
                  title={!alreadyDisliked ? "Dislike" : "Already disliked"}
                />
                {loadingCounts ? (
                  <Loading vCentered={false} tiny={true} />
                ) : (
                  <button className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors" onClick={handleShowDislikes}>
                    {cachedCounts ? cachedCounts.dislikes || '' : (localReactions ? localReactions.filter((r) => r.type === "-").length || '' : '')}
                  </button>
                )}
                <ProfilesModal
                  npubs={localReactions.length ? localReactions.filter(r => r.type === '-').map(r => nip19.npubEncode(r.liker_pubkey)) : []}
                  pool={pool}
                  isOpen={showDislikesModal}
                  onClose={() => setShowDislikesModal(false)}
                  title="Users Who Disliked This Note"
                />

                <ActionButton
                  icon={<ArrowPathRoundedSquareIcon className="h-4 w-4" />}
                  onClick={handleRepost}
                  title="Repost"
                />
                {loadingCounts ? (
                  <Loading vCentered={false} tiny={true} />
                ) : (
                  <button className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors" onClick={handleShowReposts}>
                    {cachedCounts ? cachedCounts.reposts || '' : (localReposts ? localReposts.length || '' : '')}
                  </button>
                )}
                <ProfilesModal
                  npubs={(localReposts) ? localReposts.map(r => nip19.npubEncode(r.pubkey)) : []}
                  pool={pool}
                  isOpen={showRepostsModal}
                  onClose={() => setShowRepostsModal(false)}
                  title="Users Who Reposted This Note"
                />

                <button
                  onClick={() => navigate(`/note/${id}`)}
                  className="btn-ghost p-1.5 text-gray-500 hover:text-violet-400 transition-colors"
                  title="View replies"
                >
                  <ChatBubbleLeftIcon className="h-4 w-4" />
                </button>
                {loadingCounts ? (
                  <Loading vCentered={false} tiny={true} />
                ) : (
                  <Link to={`/note/${id}`} className="text-xs text-gray-500 hover:text-gray-300 px-1 transition-colors">
                    {cachedCounts ? cachedCounts.replies || '' : (localReplies ? localReplies.length || '' : '')}
                  </Link>
                )}
              </>
            )}
            {canDelete && !isPreview && (
              <ActionButton
                icon={<TrashIcon className="h-4 w-4" />}
                onClick={() => handleDelete(id)}
                disabled={!canDelete}
                title="Delete"
                color="red"
              />
            )}
          </div>
        )}

        {/* Full-size image overlay */}
        {selectedImage && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setSelectedImage(null)}
          >
            <img 
              src={selectedImage} 
              alt="Full size" 
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
              onClick={() => setSelectedImage(null)}
            />
          </div>
        )}

        {/* Replied To */}
        {repliedEvent && (
          <div className="mt-3 border-l-2 border-violet-500/30 pl-3">
            <span className="text-xs text-gray-500 mb-1.5 block">Replied to</span>
            <NoteCard
              event={repliedEvent}
              referencedNoteInput={null}
              isPreview={false}
              id={repliedEvent.id}
              content={repliedEvent.content}
              user={{
                name: metadata?.[repliedEvent.pubkey]?.name ?? `${nip19.npubEncode(repliedEvent.pubkey).slice(0, 12)}...`,
                image: metadata?.[repliedEvent.pubkey]?.picture,
                pubkey: repliedEvent.pubkey,
                nip05: metadata?.[repliedEvent.pubkey]?.nip05
              }}
              created_at={repliedEvent.created_at}
              hashtags={[]}
              pool={pool}
              nostrExists={nostrExists}
              keyValue={keyValue}
              deleted={repliedEvent.deleted}
              repostedEvent={null}
              repliedEvent={null}
              rootEvent={null}
              connectionInfo={null}
              onUserClick={onUserClick}
            />
          </div>
        )}

        {/* Root Event */}
        {rootEvent && (
          <div className="mt-3 border-l-2 border-violet-500/30 pl-3">
            <span className="text-xs text-gray-500 mb-1.5 block">Original note</span>
            <NoteCard
              event={rootEvent}
              referencedNoteInput={null}
              isPreview={false}
              id={rootEvent.id}
              content={rootEvent.content}
              user={{
                name: metadata?.[rootEvent.pubkey]?.name ?? `${nip19.npubEncode(rootEvent.pubkey).slice(0, 12)}...`,
                image: metadata?.[rootEvent.pubkey]?.picture,
                pubkey: rootEvent.pubkey,
                nip05: metadata?.[rootEvent.pubkey]?.nip05
              }}
              created_at={rootEvent.created_at}
              hashtags={[]}
              pool={pool}
              nostrExists={nostrExists}
              keyValue={keyValue}
              deleted={rootEvent.deleted}
              repostedEvent={null}
              repliedEvent={null}
              rootEvent={null}
              connectionInfo={null}
              onUserClick={onUserClick}
            />
          </div>
        )}

        <ConnectionInfoDialog
          isOpen={isConnectionInfoOpen}
          onClose={() => setIsConnectionInfoOpen(false)}
          user={{
            name: user.name || 'Unknown',
            picture: user.image || '',
            about: metadata?.[user.pubkey]?.about || '',
          }}
          connectionInfo={connectionInfo}
        />
      </div>
    );
  })

function ActionButton({ icon, onClick, disabled, title, color }: {
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title: string;
  color?: 'yellow' | 'red';
}) {
  const colorClasses = color === 'yellow' 
    ? 'hover:text-yellow-400' 
    : color === 'red' 
    ? 'hover:text-red-400'
    : 'hover:text-violet-400';
  
  return (
    <button
      className={`btn-ghost p-1.5 transition-colors ${disabled ? 'text-gray-700 cursor-not-allowed' : `text-gray-500 ${colorClasses}`}`}
      onClick={!disabled ? onClick : undefined}
      title={title}
    >
      {icon}
    </button>
  );
}

  export default NoteCard;
