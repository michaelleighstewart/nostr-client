import { BoltIcon, HandThumbUpIcon, HandThumbDownIcon, TrashIcon, ChatBubbleLeftIcon, ArrowPathRoundedSquareIcon } from "@heroicons/react/16/solid";
import { sendZap, reactToPost, deletePost, bech32Decoder, repostMessage } from "../utils/helperFunctions";
import { SimplePool, getPublicKey } from "nostr-tools";
import { useState, useEffect } from "react";
import { CustomToast } from '../components/CustomToast'; // Import CustomToast
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import React from "react";
import { RELAYS } from "../utils/constants";
import { Metadata, Reaction, User, ExtendedEvent } from "../utils/interfaces";

interface Props {
    id: string;
    content: string;
    user: User;
    created_at: number;
    hashtags: string[];
    pool: SimplePool | null;
    nostrExists: boolean | null;
    reactions: Reaction[];
    keyValue: string;
    replies: number;
    deleted: boolean | undefined;
    repostedEvent: ExtendedEvent | null;
    repliedEvent: ExtendedEvent | null;
    metadata: Record<string, Metadata> | null;
    allReactions: Record<string, Reaction[]> | null;
    allReplies: Record<string, number> | null;
    reposts: number;
    allReposts: Record<string, number> | null;
  }
  
  export default function NoteCard({
    id,
    content,
    user,
    created_at,
    hashtags,
    pool,
    nostrExists,
    reactions,
    keyValue,
    deleted,
    replies,
    repostedEvent,
    repliedEvent,
    metadata,
    allReactions,
    allReplies,
    reposts,
    allReposts
  }: Props) {
    const [alreadyLiked, setAlreadyLiked] = useState(false);
    const [alreadyDisliked, setAlreadyDisliked] = useState(false);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [localReactions, setLocalReactions] = useState<Reaction[]>(reactions || []);
    const [canDelete, setCanDelete] = useState(false);
    const [localDeleted, setLocalDeleted] = useState(deleted);
    const [userNpub, setUserNpub] = useState<string>('');
    const [imageUrls, setImageUrls] = useState<string[]>([]);
    const [processedContent, setProcessedContent] = useState<React.ReactNode[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
    const navigate = useNavigate();

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
      // Check if content contains image URLs
      const imageRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/gi;
      const imageMatches: string[] = content.match(imageRegex) || [];
      setImageUrls(imageMatches);

      // Check for YouTube video
      const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/g;
      const youtubeMatch = youtubeRegex.exec(content);
      if (youtubeMatch && youtubeMatch[1]) {
        setYoutubeVideoId(youtubeMatch[1]);
      }

      const linkRegex = /(https?:\/\/[^\s]+)/g;
      const nostrBech32Regex = /(nostr:(naddr|npub|note|nsec|nprofile)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+)\b/;
      const hashtagRegex = /#(\w+)/g;
      const parts: string[] = content.split(linkRegex);
      const processed = parts.map((part, index) => {
        if (part.match(linkRegex)) {
          if (!imageMatches.includes(part as string) && !youtubeMatch) {
            return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
          }
          return null;
        }
        const nostrMatch = part.match(nostrBech32Regex);
        if (nostrMatch) {
          const [fullMatch, nostrEntity] = nostrMatch;
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
                      return prevContent; // If it has, return the previous content without changes
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
            return (
              <React.Fragment key={index}>
                {part.substring(0, nostrMatch.index).split('\n').map((line, lineIndex) => (
                  <React.Fragment key={`before-${lineIndex}`}>
                    {lineIndex > 0 && <br />}
                    {line}
                  </React.Fragment>
                ))}
                {part.substring(nostrMatch.index !== undefined ? nostrMatch.index + fullMatch.length : 0).split('\n').map((line, lineIndex) => (
                  <React.Fragment key={`after-${lineIndex}`}>
                    {lineIndex > 0 && <br />}
                    {line}
                  </React.Fragment>
                ))}
              </React.Fragment>
            );
          } catch (error) {
            console.error("Error decoding Nostr entity:", error);
            return part;
          }
        }

        const lines = part.split('\n');
        return (
          <span key={index}>
            {lines.map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {lineIndex > 0 && <br />}
                {line.split(hashtagRegex).map((segment, segmentIndex) => {
                  if (segmentIndex % 2 === 1) { // This is a hashtag
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
      });
      setProcessedContent(processed.filter(Boolean));
    }, [content]);
  
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
      setLocalReactions(reactions || []);
    }, [reactions]);
  
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
          CustomToast("Post deleted", "success");
          setLocalDeleted(true);
        }
        else {
          CustomToast("Failed to delete post", "error");
        }
      });
    }

    const handleContentClick = () => {
      navigate(`/post/${id}`);
    };

    const handleImageClick = (url: string) => {
      setSelectedImage(url);
    };

    const handleRepost = () => {
      repostMessage(pool, nostrExists, keyValue, id, user.pubkey, content).then((result) => {
        if (result) {
          CustomToast("Post reposted", "success");
        }
        else {
          CustomToast("Failed to repost post", "error");
        }
      });
    };

    if (localDeleted) {
      return (
        <div className="rounded p-16 border border-gray-600 bg-gray-700 flex flex-col gap-16 break-words">
          <p className="text-body3 text-gray-400">This post has been deleted</p>
        </div>
      );
    }
    return (
      <div className="rounded p-16 border border-gray-600 bg-gray-700 flex flex-col gap-16 break-words">
        <div className="flex gap-12 items-center overflow-hidden">
          {user.image ?
          <Link to={`/profile?npub=${userNpub}`}>
            <img
              src={user.image}
              alt="note"
              className="rounded-full w-40 aspect-square bg-gray-100 cursor-pointer"
            />
          </Link> : <></>}
          <div>
            <span
              className="text-body3 text-white overflow-hidden text-ellipsis"
            >
              {user.name}
            </span>
            <span className="px-16 text-body5 text-gray-400">
              {new Date(created_at * 1000).toISOString().split("T")[0]}
            </span>
          </div>
        </div>
        {repliedEvent && (
          <div className="mt-2 border-l-2 border-gray-500">
            <p className="text-gray-400 text-sm mb-2 pl-4">Replied</p>
          </div>
        )}
        {repostedEvent && (
          <div className="mt-2 border-l-2 border-gray-500">
            <p className="text-gray-400 text-sm mb-2 pl-4">Reposted</p>
            <NoteCard
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
              reactions={allReactions?.[repostedEvent.id] ?? []}
              keyValue={keyValue}
              replies={allReplies?.[repostedEvent.id] ?? 0}
              deleted={repostedEvent.deleted}
              repostedEvent={null}
              repliedEvent={repliedEvent}
              metadata={metadata}
              allReactions={allReactions}
              allReplies={allReplies}
              reposts={allReposts?.[repostedEvent.id] ?? 0}
              allReposts={allReposts}
            />
          </div>
        )}
        <div onClick={handleContentClick} className="cursor-pointer">
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
          {imageUrls.map((url, index) => (
            <img 
              key={index} 
              src={url} 
              alt="Post content" 
              className="max-w-full h-auto rounded-lg mt-2 cursor-pointer" 
              style={{ maxHeight: '1200px', objectFit: 'cover' }}
              onClick={(e) => {
                e.stopPropagation();
                handleImageClick(url);
              }}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-12">
          {hashtags
            .filter((t) => hashtags.indexOf(t) === hashtags.lastIndexOf(t))
            .map((hashtag) => (
              <li
                key={hashtag}
                className="bg-gray-300 text-body5 text-gray-900 font-medium rounded-24 px-12 py-4"
              >
                #{hashtag}
              </li>
            ))}
        </ul>
        <div className="inline-flex">
        {!repostedEvent && (
          <>
            <div className="p-4">
              <BoltIcon
                className={user.nip05 ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={user.nip05 ? "Zap " + user.name + " for this post" : user.name + " does not have zaps enabled"}
                onClick={() => sendZap(user, id)}>
              </BoltIcon>
            </div>
            <div className="p-4 pl-32">
              <HandThumbUpIcon
                className={!alreadyLiked ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={!alreadyLiked ? "Like this post" : "You have already liked this post"}
                onClick={!alreadyLiked ? () => handleReaction("+") : undefined}
              />
            </div>
            <div className="p-4">
              <span className="text-body5 text-gray-400">
                {localReactions.filter((r) => r.type === "+").length}
              </span>
            </div>
            <div className="p-4 pl-32">
              <HandThumbDownIcon
                className={!alreadyDisliked ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={!alreadyDisliked ? "Dislike this post" : "You have already disliked this post"}
                onClick={!alreadyDisliked ? () => handleReaction("-") : undefined}
              />
            </div>
            <div className="p-4">
              <span className="text-body5 text-gray-400">
                {localReactions.filter((r) => r.type === "-").length}
              </span>
            </div>
            <div className="p-4 pl-32">
              <ArrowPathRoundedSquareIcon
                className="h-6 w-6 text-blue-500 cursor-pointer"
                title="Repost this post"
                onClick={handleRepost}
              />
            </div>
            <div className="p-4">
              <span className="text-body5 text-gray-400">
                {reposts}
              </span>
            </div>
            <div className="p-4 pl-32">
              <ChatBubbleLeftIcon
                className="h-6 w-6 text-blue-500 cursor-pointer"
                title="View replies"
                onClick={() => navigate(`/post/${id}`)}
              />
            </div>
            <div className="p-4">
              <span className="text-body5 text-gray-400">
                {replies}
              </span>
            </div>
          </>
        )}
        {canDelete &&
          <div className={`p-4 ${!repostedEvent ? 'pl-32' : ''}`}>
            <TrashIcon
              className={canDelete ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={canDelete ? "Delete this post" : "You cannot delete this post"}
                onClick={canDelete ? () => handleDelete(id) : undefined}
              />
          </div>
        }
        </div>
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
        {repliedEvent ? (
                    <NoteCard
                    id={repliedEvent.id}
                    content={repliedEvent.content}
                    user={{
                      name:
                          metadata?.[repliedEvent.pubkey]?.name ??
                          `${nip19.npubEncode(repliedEvent.pubkey).slice(0, 12)}...`,
                      image:
                          metadata?.[repliedEvent.pubkey]?.picture,
                      pubkey: repliedEvent.pubkey,
                      nip05: metadata?.[repliedEvent.pubkey]?.nip05
                    }}
                    created_at={repliedEvent.created_at}
                    hashtags={[]}
                    pool={pool}   
                    nostrExists={nostrExists}
                    reactions={allReactions?.[repliedEvent.id] ?? []}
                    keyValue={keyValue}
                    replies={allReplies?.[repliedEvent.id] ?? 0}
                    deleted={repliedEvent.deleted}
                    repostedEvent={null}
                    repliedEvent={null}
                    metadata={metadata}
                    allReactions={allReactions}
                    allReplies={allReplies}
                    reposts={reposts}
                    allReposts={allReposts}
                  />
      ) : <></>}
      </div>
    );
  }