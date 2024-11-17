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

    const toggleAccordion = async () => {
      setIsAccordionOpen(prev => !prev);
      if (!isAccordionOpen) {
        // Fetch counts only when opening the accordion
        if (pool && event) {
          setLoadingCounts(true);
          const { reactions: newReactions, replies: newReplies, reposts: newReposts } = 
            await fetchReactionsAndRepliesAlt(pool, [event], repostedEvent ? [repostedEvent] : [], localReplies);
          setLocalReactions(newReactions[id]);
          setLocalReposts(newReposts[id]);
          setLocalReplies(newReplies[id]);
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
    
      // Update cache if new counts are higher
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
    //}, [id, reactions, reposts, replies]);
  }, [id, localReactions, localReposts, localReplies]);

    useEffect(() => {
      // Check if content contains image URLs
      const imageRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/gi;
      const imageMatches: string[] = content.match(imageRegex) || [];
      setImageUrls(imageMatches);

      // Check if content contains video URLs
      const videoRegex = /(https?:\/\/.*\.(?:mp4|avi|mov))/gi;
      const videoMatches: string[] = content.match(videoRegex) || [];
      setVideoUrls(videoMatches);

      // Check for YouTube video
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/g;
      const youtubeMatch = youtubeRegex.exec(content);
      if (youtubeMatch && youtubeMatch[1]) {
        setYoutubeVideoId(youtubeMatch[1]);
      }

      const linkRegex = /(https?:\/\/[^\s]+)/g;
      const nostrBech32Regex = /(nostr:(naddr|npub|note|nsec|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+)\b/g;
      const hashtagRegex = /#(\w+)/g;
      const parts: string[] = content.split(linkRegex);
      const processed = parts.map((part, index) => {
        if (part.match(linkRegex)) {
          if (videoMatches.includes(part as string)) {
            return <VideoEmbed key={index} url={part} />;
          } else if (!imageMatches.includes(part as string) && !youtubeMatch) {
            return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
          }
          return null;
        }
        let result = [];
        let lastIndex = 0;
        let match;
        while ((match = nostrBech32Regex.exec(part)) !== null) {
          const [fullMatch, nostrEntity] = match;
          const beforeText = part.slice(lastIndex, match.index);
          if (beforeText) {
            result.push(beforeText);
          }
          try {
            const decoded = nip19.decode(nostrEntity.slice(6));
            if (decoded.type === 'naddr' && decoded.data.kind === 30023) {
              pool?.subscribeManyEose(RELAYS, [{
                kinds: [30023],
                authors: [decoded.data.pubkey],
                '#d': [decoded.data.identifier]
              }], 
              {
                onevent(event) {
                  const npub = nip19.npubEncode(event.pubkey);
                  setProcessedContent(prevContent => {
                    // Check if this event has already been processed
                    if (prevContent.some(item => 
                      item !== null && typeof item === 'object' && 'key' in item && item.key === `preview-${event.id}`
                    )) {
                      return prevContent;
                    }
                    // If it hasn't been processed, add it to the content
                    return [
                      ...prevContent,
                      <div key={`preview-${event.id}`} className="border rounded-lg p-4 my-2">
                        <h3 className="text-lg font-semibold">{event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'}</h3>
                        <p className="text-sm text-gray-400 my-2">{event.tags.find(tag => tag[0] === 'summary')?.[1] || 'No summary available'}</p>
                        {event.tags.find(tag => tag[0] === 'image')?.[1] && (
                          <img src={event.tags.find(tag => tag[0] === 'image')?.[1]} alt={event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'} className="w-full h-auto max-h-96 object-contain rounded my-2" />
                        )}
                        <a href={`https://highlighter.com/${npub}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                          View on Highlighter
                        </a>
                      </div>
                    ];
                  });
                }
              });
            }
            if (decoded.type === 'npub') {
              if (!metadata?.[decoded.data]) {
                pool?.subscribeManyEose(RELAYS, [{
                  kinds: [0],
                  authors: [decoded.data]
                }], 
                {
                  onevent(event) {
                    const eventMetadata = JSON.parse(event.content);
                    setMetadata((prev: any) => ({
                      ...prev,
                      [decoded.data]: {
                          name: eventMetadata.name || 'Unknown',
                          picture: eventMetadata.picture
                      }
                    }));
                  }
                });
              }
              const npub = nostrEntity.slice(6);
              const name = metadata?.[decoded.data]?.name || npub;
              result.push(
                <Link 
                  key={`npub-${index}-${match.index}`}
                  to={`/profile/${npub}`}
                  className="text-blue-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {name}
                </Link>
              );
            } else if (decoded.type === 'note') {
              pool?.subscribeManyEose(RELAYS, [{
                ids: [decoded.data]
              }], 
              {
                onevent(event) {
                  setReferencedNote({
                    id: event.id,
                    content: event.content,
                    created_at: event.created_at,
                    pubkey: event.pubkey,
                    tags: event.tags,
                    deleted: false,
                    repostedEvent: null,
                    repliedEvent: null,
                    rootEvent: null
                  });
                  
                  // Fetch metadata for the referenced note's author if not in cache
                  if (!metadata?.[event.pubkey]) {
                    pool?.subscribeManyEose(RELAYS, [{
                      kinds: [0],
                      authors: [event.pubkey]
                    }], 
                    {
                      onevent(metadataEvent) {
                        const eventMetadata = JSON.parse(metadataEvent.content);
                        setMetadata((prev: any) => ({
                          ...prev,
                          [event.pubkey]: {
                            name: eventMetadata.name || 'Unknown',
                            picture: eventMetadata.picture
                          }
                        }));
                      }
                    });
                  }
                }
              });
            } else {
              result.push(
                <Link 
                  key={`nostr-${index}-${match.index}`}
                  to={`/profile/${nostrEntity.slice(6)}`}
                  className="text-blue-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
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
        if (lastIndex < part.length) {
          result.push(part.slice(lastIndex));
        }
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
                          <Link 
                            key={segmentIndex} 
                            to={`/people-to-follow?hashtag=${segment}`}
                            className="text-blue-500 hover:underline"
                            onClick={(e) => e.stopPropagation()} // Prevent the post click event from triggering
                          >
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
    }, [content, metadata]);
  
    useEffect(() => {
      async function fetchPublicKey() {
        if ((window as any).nostr && (window as any).nostr.getPublicKey) {
          const pk = await (window as any).nostr.getPublicKey();
          if (pk === user.pubkey) {
            setCanDelete(true);
          }
          setPublicKey(pk);
        }
        else {
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

    const handleShowLikes = () => {
      setShowLikesModal(true);
    };

    const handleShowDislikes = () => {
      setShowDislikesModal(true);
    };

    const handleShowReposts = () => {
      setShowRepostsModal(true);
    };

    if (localDeleted) {
      return (
        <div className="rounded p-16 border border-gray-600 bg-[#535bf2] bg-opacity-10 flex flex-col gap-16 break-words">
          <p className="text-body3 text-gray-400">This post has been deleted</p>
        </div>
      );
    }
    return (
      <div className="rounded p-16 border border-gray-600 bg-[#535bf2] bg-opacity-10 flex flex-col gap-16 break-words">
        <div className="flex gap-12 items-center overflow-hidden justify-between">
          <div className="flex gap-12 items-center overflow-hidden">
            {user.image ?
            <Link to={`/profile/${userNpub}`}>
              <img
                src={user.image}
                alt="note"
                className="rounded-full w-40 h-40 object-cover bg-gray-100 cursor-pointer"
              />
            </Link> : <></>}
            <div>
              <Link to={`/profile/${userNpub}`} className="text-body3 text-white overflow-hidden text-ellipsis">
                {user.name}
              </Link>
              <Link to={`/note/${id}`} className="px-16 text-body5 text-gray-400 cursor-pointer">
                {new Date(created_at * 1000).toLocaleString(undefined, {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </Link>
            </div>
          </div>
          {connectionInfo && (
            <div className="flex-shrink-0">
              <QuestionMarkCircleIcon
                className="w-6 h-6 text-[#535bf2] cursor-pointer hover:text-white"
                onClick={openConnectionInfo}
              />
            </div>
          )}
        </div>
        {imageUrls.length > 0 && (
          <div className="relative">
            {imageUrls.length > 1 && (
            <div className="flex justify-center mb-4">
              <button onClick={handlePrev} 
              disabled={currentIndex === 0}
              className={`font-bold py-2 px-6 rounded flex items-center mb-2 sm:mb-0 sm:mr-2 ${currentIndex === 0 ? 'bg-gray-500 text-gray-300 cursor-not-allowed hover:bg-gray-500 hover:text-gray-300' : 'text-white'}`}>
                Previous
              </button>
              <button onClick={handleNext} 
              className={`font-bold py-2 px-6 rounded flex items-center mb-2 sm:mb-0 sm:mr-2 ${currentIndex === imageUrls.length - 1 ? 'bg-gray-500 text-gray-300 cursor-not-allowed hover:bg-gray-500 hover:text-gray-300' : 'text-white'}`}
              disabled={currentIndex === imageUrls.length - 1}>
                Next
              </button>
            </div>)}
            <div ref={carouselRef} className="overflow-hidden">
              <div
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
              >
                {imageUrls.map((url, index) => (
                  <div key={index} className="w-full flex-shrink-0 p-4">
                    <img
                      src={url}
                      alt={`Post content ${index + 1}`}
                      className="max-w-full h-auto rounded-lg mt-2 cursor-pointer" 
                      style={{ maxHeight: '1200px', objectFit: 'cover' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageClick(url);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {referencedNote && (
          <div className="mt-4 border-l-2 border-gray-500 pl-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-gray-400 text-sm">Referenced Note:</p>
              <Link to={`/note/${referencedNote.id}`} className="text-blue-500 hover:underline text-sm">
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
        {repliedEvent && (
          <div className="mt-2 border-l-2 border-gray-500">
            <p className="text-gray-400 text-sm mb-2 pl-4">Replied</p>
          </div>
        )}
        {repostedEvent && (
          <div className="mt-2 border-l-2 border-gray-500">
            <p className="text-gray-400 text-sm mb-2 pl-4">Reposted</p>
            <NoteCard
              referencedNoteInput={referencedNote}
              event={repostedEvent}
              isPreview={false}
              id={repostedEvent.id}
              content={repostedEvent.content}
              user={{
                name:
                    metadata?.[repostedEvent.pubkey]?.name ??
                    `${nip19.npubEncode(repostedEvent.pubkey).slice(0, 12)}...`,
                image:
                    metadata?.[repostedEvent.pubkey]?.picture,
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

        {replyDepth && replyDepth > 0 && (
          <div 
            className="absolute left-0 top-0 bottom-0 border-l-2 border-gray-400"
            style={{ left: `${(replyDepth - 1) * 20}px` }}
          ></div>
        )}

        <div>
          <p>{processedContent}</p>
          {youtubeVideoId && (
            <div className="mt-2">
              <iframe
                width="100%"
                height="315"
                src={`https://www.youtube.com/embed/${youtubeVideoId}`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          )}
        </div>
        <ul className="flex flex-wrap gap-12">
          {hashtags
            .filter((t) => hashtags.indexOf(t) === hashtags.lastIndexOf(t))
            .map((hashtag) => (
              <Link
                key={hashtag}
                to={`/people-to-follow?hashtag=${hashtag}`}
                className="bg-gray-300 text-body5 text-gray-900 font-medium rounded-24 px-12 py-4 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                #{hashtag}
              </Link>
            ))}
        </ul>
      {!isPreview && (
        <div className="flex justify-between items-center">
          <button 
            onClick={toggleAccordion} 
            className="flex items-center text-blue-500 focus:outline-none"
            style={{ padding: '10px', background: 'transparent', border: 'none' }}
          >
            <svg
              className={`w-6 h-6 transform transition-transform duration-200 ${isAccordionOpen ? 'rotate-180' : ''}`}
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>)}

      {isAccordionOpen && (
      <div className="flex flex-wrap items-center justify-start">
        {!repostedEvent && !isPreview && (
          <>
            <div className="p-4">
              <BoltIcon
                className={user.nip05 ? "h-6 w-6 text-[#535bf2] cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={user.nip05 ? "Zap " + user.name + " for this post" : user.name + " does not have zaps enabled"}
                onClick={() => sendZap(user, id)}>
              </BoltIcon>
            </div>
            <div className="p-4 pl-8 md:pl-32">
              <HandThumbUpIcon
                className={!alreadyLiked ? "h-6 w-6 text-[#535bf2] cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={!alreadyLiked ? "Like this post" : "You have already liked this post"}
                onClick={!alreadyLiked ? () => handleReaction("+") : undefined}
              />
            </div>
            {loadingCounts ? <Loading vCentered={true} tiny={true}></Loading> : (
            <div className="p-4">
              <span 
                className="text-body5 text-gray-400 cursor-pointer hover:underline"
                onClick={() => handleShowLikes()}
              >
                {localReactions.filter((r) => r.type !== "-").length}
              </span>
            </div>)}
            
            <ProfilesModal
              npubs={localReactions.length ? localReactions.filter(r => r.type !== "-").map(r => nip19.npubEncode(r.liker_pubkey)) : []}
              pool={pool}
              isOpen={showLikesModal}
              onClose={() => setShowLikesModal(false)}
              title="Users Who Liked This Note"
            />
            <div className="p-4 pl-8 md:pl-32">
              <HandThumbDownIcon
                className={!alreadyDisliked ? "h-6 w-6 text-[#535bf2] cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={!alreadyDisliked ? "Dislike this post" : "You have already disliked this post"}
                onClick={!alreadyDisliked ? () => handleReaction("-") : undefined}
              />
            </div>
            {loadingCounts ? <Loading vCentered={true} tiny={true}></Loading> : (
              <div className="p-4">
                <span 
                  className="text-body5 text-gray-400 cursor-pointer hover:underline"
                  onClick={() => handleShowDislikes()}
                >
                  {cachedCounts ? cachedCounts.dislikes : (localReactions ? localReactions.filter((r) => r.type === "-").length : <Loading vCentered={true} tiny={true} />)}
                </span>
              </div>)}
            <ProfilesModal
              npubs={localReactions.length ? localReactions.filter(r => r.type === '-').map(r => nip19.npubEncode(r.liker_pubkey)) : []}
              pool={pool}
              isOpen={showDislikesModal}
              onClose={() => setShowDislikesModal(false)}
              title="Users Who Disliked This Note"
            />
            <div className="p-4 pl-8 md:pl-32">
              <ArrowPathRoundedSquareIcon
                className="h-6 w-6 text-[#535bf2] cursor-pointer"
                title="Repost this post"
                onClick={handleRepost}
              />
            </div>
            {loadingCounts ? <Loading vCentered={true} tiny={true}></Loading> : (
              <div className="p-4">
                <span 
                  className="text-body5 text-gray-400 cursor-pointer hover:underline"
                  onClick={() => handleShowReposts()}
                >
                  {cachedCounts ? cachedCounts.reposts : (localReposts ? localReposts.length : <Loading vCentered={true} tiny={true} />)}
                </span>
              </div>)}
            <ProfilesModal
              npubs={(localReposts) ? localReposts.map(r => nip19.npubEncode(r.pubkey)) : []}
              pool={pool}
              isOpen={showRepostsModal}
              onClose={() => setShowRepostsModal(false)}
              title="Users Who Reposted This Note"
            />
            <div className="p-4 pl-8 md:pl-32">
              <ChatBubbleLeftIcon
                className="h-6 w-6 text-[#535bf2] cursor-pointer"
                title="View replies"
                onClick={() => navigate(`/note/${id}`)}
              />
            </div>
              {loadingCounts ? <Loading vCentered={true} tiny={true}></Loading> : (
                <div className="p-4">
                  <Link to={`/note/${id}`}>
                    <span className="text-body5 text-gray-400 cursor-pointer hover:underline font-normal">
                    {cachedCounts ? cachedCounts.replies : (localReplies ? localReplies.length : <Loading vCentered={true} tiny={true} />)}
                    </span>
                  </Link>
                </div>
              )}
          </>
        )}
        {canDelete && !isPreview &&
          <div className={`p-4 ${!repostedEvent ? 'pl-8 md:pl-32' : ''}`}>
            <TrashIcon
              className={canDelete ? "h-6 w-6 text-[#535bf2] cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={canDelete ? "Delete this post" : "You cannot delete this post"}
                onClick={canDelete ? () => handleDelete(id) : undefined}
              />
          </div>
        }
        </div>
      )}
        {selectedImage && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setSelectedImage(null)}
          >
            <img 
              src={selectedImage} 
              alt="Full size" 
              className="max-w-full max-h-full object-contain"
              onClick={() => setSelectedImage(null)}
            />
          </div>
        )}
        {repliedEvent && (
          <div className="mt-2 border-l-2 border-gray-500">
            <p className="text-gray-400 text-sm mb-2 pl-4">Replied to</p>
            <NoteCard
              event={repliedEvent}
              referencedNoteInput={null}
              isPreview={false}
              id={repliedEvent.id}
              content={repliedEvent.content}
              user={{
                name:
                  metadata?.[repliedEvent.pubkey]?.name ??
                  `${nip19.npubEncode(repliedEvent.pubkey).slice(0, 12)}...`,
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
        {rootEvent && (
          <div className="mt-2 border-l-2 border-gray-500">
            <p className="text-gray-400 text-sm mb-2 pl-4">Original note</p>
            <NoteCard
              event={rootEvent}
              referencedNoteInput={null}
              isPreview={false}
              id={rootEvent.id}
              content={rootEvent.content}
              user={{
                name:
                  metadata?.[rootEvent.pubkey]?.name ??
                  `${nip19.npubEncode(rootEvent.pubkey).slice(0, 12)}...`,
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

  export default NoteCard;