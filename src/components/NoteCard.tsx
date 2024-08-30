import { BoltIcon, HandThumbUpIcon, HandThumbDownIcon, TrashIcon } from "@heroicons/react/16/solid";
import { User, sendZap, reactToPost, deletePost } from "../utils/helperFunctions";
import { SimplePool, getPublicKey} from "nostr-tools";
import { bech32Decoder } from "../utils/helperFunctions";
import { Reaction } from "./Home";
import { useState, useEffect } from "react";
import { toast } from 'react-toastify';

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
  
    useEffect(() => {
      async function fetchPublicKey() {
        if (window.nostr && window.nostr.getPublicKey) {
          const pk = await window.nostr.getPublicKey();
          if (pk === user.pubkey) {
            setCanDelete(true);
          }
          setPublicKey(pk);
        }
      }
      fetchPublicKey();
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
      if (publicKey && localReactions) {
        setAlreadyLiked(localReactions.some((r) => r.liker_pubkey === publicKey && r.type === "+"));
        setAlreadyDisliked(localReactions.some((r) => r.liker_pubkey === publicKey && r.type === "-"));
      } else if (!user.pubkey) {
        setAlreadyLiked(true);
        setAlreadyDisliked(true);
      }
    }, [publicKey, localReactions, user.pubkey]);
  
    const handleReaction = (type: string) => {
      reactToPost(user, id, pool, nostrExists, type, publicKey).then((newReaction) => {
        if (newReaction) {
          setLocalReactions((prevReactions) => [...prevReactions, newReaction]);
        }
      });
    };

    const handleDelete = (id: string) => {
      deletePost(id, pool, nostrExists).then((result) => {
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
          <img
            src={user.image}
            alt="note"
            className="rounded-full w-40 aspect-square bg-gray-100"
          /> : <></>}
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
        <p>{content}</p>
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
              {localReactions.filter((r) => r.type === "+").length} like{localReactions.filter((r) => r.type === "+").length !== 1 ? "s" : ""}
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
              {localReactions.filter((r) => r.type === "-").length} dislike{localReactions.filter((r) => r.type === "-").length !== 1 ? "s" : ""}
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
  