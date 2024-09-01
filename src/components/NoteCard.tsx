import { BoltIcon, HandThumbUpIcon, HandThumbDownIcon, TrashIcon } from "@heroicons/react/16/solid";
import { User, sendZap, reactToPost, deletePost, bech32Decoder } from "../utils/helperFunctions";
import { SimplePool, getPublicKey } from "nostr-tools";
import { Reaction } from "./Home";
import { useState, useEffect } from "react";
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

interface Props {
    id: string;
    content: string;
    user: User;
    created_at: number;
    hashtags: string[];
    pool: SimplePool | null;
    nostrExists: boolean;
    reactions: Reaction[];
    keyValue: string;
    deleted: boolean | undefined;
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
    deleted
  }: Props) {
    const [alreadyLiked, setAlreadyLiked] = useState(false);
    const [alreadyDisliked, setAlreadyDisliked] = useState(false);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [localReactions, setLocalReactions] = useState<Reaction[]>(reactions || []);
    const [canDelete, setCanDelete] = useState(false);
    const [localDeleted, setLocalDeleted] = useState(deleted);
    const [userNpub, setUserNpub] = useState<string>('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [processedContent, setProcessedContent] = useState<React.ReactNode[]>([]);

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
      // Check if content contains an image URL
      const urlRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
      const match = content.match(urlRegex);
      if (match) {
        setImageUrl(match[0]);
      }

      // Process content to detect and enable clicking on links
      const linkRegex = /(https?:\/\/[^\s]+)/g;
      const parts = content.split(linkRegex);
      const processed = parts.map((part, index) => {
        if (part.match(linkRegex)) {
          return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{part}</a>;
        }
        return part;
      });
      setProcessedContent(processed);
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
        <p>{processedContent}</p>
        {imageUrl && (
          <img src={imageUrl} alt="Post content" className="max-w-full h-auto rounded-lg" />
        )}
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
            <TrashIcon
              className={canDelete ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
              title={canDelete ? "Delete this post" : "You cannot delete this post"}
              onClick={canDelete ?() => handleDelete(id) : undefined}
              />
          </div>
        </div>
      </div>
    );
  }