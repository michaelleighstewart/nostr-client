import { BoltIcon, HandThumbUpIcon } from "@heroicons/react/16/solid";
import { User, sendZap, likePost } from "../utils/helperFunctions";
import { SimplePool } from "nostr-tools";
import { Reaction } from "./Home";
import React, { useState, useEffect } from "react";

interface Props {
    id: string;
    content: string;
    user: User;
    created_at: number;
    hashtags: string[];
    pool: SimplePool | null;
    nostrExists: boolean;
    reactions: Reaction[];
  }
  
  export default function NoteCard({
    id,
    content,
    user,
    created_at,
    hashtags,
    pool,
    nostrExists,
    reactions
  }: Props) {
    const [alreadyReacted, setAlreadyReacted] = useState(false);
    const [publicKey, setPublicKey] = useState<string | null>(null);
  
    useEffect(() => {
      async function fetchPublicKey() {
        if (window.nostr && window.nostr.getPublicKey) {
          const pk = await window.nostr.getPublicKey();
          setPublicKey(pk);
        }
      }
      fetchPublicKey();
    }, []);
  
    useEffect(() => {
      if (publicKey && reactions) {
        setAlreadyReacted(reactions.some((r: Reaction) => r.liker_pubkey === publicKey));
      } else if (!user.pubkey) {
        setAlreadyReacted(true);
      }
    }, [publicKey, reactions, user.pubkey]);
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
          <div className="p-4">
              <HandThumbUpIcon
                className={!alreadyReacted  ? "h-6 w-6 text-blue-500 cursor-pointer" : "h-6 w-6 text-grey-500 cursor-not-allowed"}
                title={!alreadyReacted ? "Like this post" : "You have already liked this post"}
                onClick={() => likePost(user, id, pool, nostrExists)}>
              </HandThumbUpIcon>
          </div>
          <div className="p-4">
            <span className="text-body5 text-gray-400">
              {reactions?.length ?? 0} likes
            </span>
          </div>
        </div>
      </div>
    );
  }
  