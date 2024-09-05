import { BoltIcon, HandThumbUpIcon, HandThumbDownIcon, TrashIcon, ChatBubbleLeftIcon } from "@heroicons/react/16/solid";
import { User, sendZap, reactToPost, deletePost, bech32Decoder, ExtendedEvent } from "../utils/helperFunctions";
import { SimplePool, getPublicKey } from "nostr-tools";
import { Metadata, Reaction } from "./Home";
import { useState, useEffect } from "react";
import { toast } from 'react-toastify';
import { Link, useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

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
    metadata: Record<string, Metadata> | null;
    allReactions: Record<string, Reaction[]> | null;
    allReplies: Record<string, number> | null;
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
    metadata,
    allReactions,
    allReplies
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

      // Process content to detect and enable clicking on links
      const linkRegex = /(https?:\/\/[^\s]+)/g;
      const parts: string[] = content.split(linkRegex);
      const processed = parts.map((part, index) => {
        if (part.match(linkRegex)) {
          if (!imageMatches.includes(part as string)) {
            return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
          }
          return null; // Skip image links in the text
        }
        return part;
      });
      setProcessedContent(processed.filter(Boolean)); // Remove null values
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
          toast.success("Post deleted");
          setLocalDeleted(true);
        }
        else {
          toast.error("Failed to delete post");
        }
      });
    }

    const handleContentClick = () => {
      navigate(`/post/${id}`);
    };

    const handleImageClick = (url: string) => {
      setSelectedImage(url);
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
              metadata={metadata}
              allReactions={allReactions}
              allReplies={allReplies}
            />
          </div>
        )}
        <div onClick={handleContentClick} className="cursor-pointer">
          <p>{processedContent}</p>
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
      </div>
    );
  }