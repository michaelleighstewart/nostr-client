import { ExtendedEvent, Metadata, Reaction, Reply } from "../utils/interfaces";
import { SimplePool } from "nostr-tools";
import NoteCard from "./NoteCard";
import React, { useMemo } from "react";

interface ThreadedReplyProps {
    reply: Reply;
    depth: number;
    handleReplyClick: (replyId: string) => void;
    pool: SimplePool | null;
    nostrExists: boolean | null;
    keyValue: string;
    metadata: Record<string, Metadata>;
    allReactions: Record<string, Reaction[]>;
    allReplies: Record<string, ExtendedEvent[]>;
    allReposts: Record<string, ExtendedEvent[]>;
    setMetadata: React.Dispatch<React.SetStateAction<Record<string, Metadata>>>;
  }
  
  const ThreadedReply: React.FC<ThreadedReplyProps> = React.memo(({
    reply,
    depth,
    handleReplyClick,
    pool,
    nostrExists,
    keyValue,
    metadata,
    allReactions,
    allReplies,
    allReposts,
    setMetadata
  }) => {
    const nestedReplies = useMemo(() => {
      return reply.replies
        .filter(Boolean)
        .flat();
    }, [reply.replies]);
  
    return (
      <div style={{ marginLeft: `${depth * 20}px` }}>
        <div onClick={() => handleReplyClick(reply.id)}>
          <NoteCard
            isPreview={false}
            id={reply.id}
            content={reply.content}
            user={{
              pubkey: reply.pubkey,
              name: metadata[reply.pubkey]?.name || '',
              image: metadata[reply.pubkey]?.picture || '',
              nip05: metadata[reply.pubkey]?.nip05 || '',
            }}
            created_at={reply.created_at}
            hashtags={reply.hashtags}
            pool={pool}
            nostrExists={nostrExists}
            reactions={allReactions[reply.id] || []}
            keyValue={keyValue}
            deleted={false}
            replies={reply.replies.length}
            repostedEvent={null}
            metadata={metadata}
            allReactions={allReactions}
            allReplies={allReplies}
            repliedEvent={null} 
            reposts={allReposts[reply.id]?.length || 0}
            allReposts={allReposts}
            setMetadata={setMetadata}
            connectionInfo={null}
          />
        </div>
        {nestedReplies.map((nestedReply: Reply) => (
          <ThreadedReply
            key={nestedReply.id}
            reply={{
              ...nestedReply,
              reactions: allReactions[nestedReply.id] || [],
              replies: nestedReply.replies,
              hashtags: nestedReply.hashtags
            } as Reply}
            depth={depth + 1}
            handleReplyClick={handleReplyClick}
            pool={pool}
            nostrExists={nostrExists}
            keyValue={keyValue}
            metadata={metadata}
            allReactions={allReactions}
            allReplies={allReplies}
            allReposts={allReposts}
            setMetadata={setMetadata}
          />
        ))}
      </div>
    );
  });
  export default ThreadedReply;