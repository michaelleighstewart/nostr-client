import React, { useState, useEffect } from 'react';
import { SimplePool, Event, getPublicKey } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NoteCard from './NoteCard';
import { Reaction } from './Home';
import { RELAYS } from '../utils/constants';
import { User, bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';

interface PostProps {
  pool: SimplePool | null;
  nostrExists: boolean | null;
  keyValue: string;
}

interface Reply {
  id: string;
  content: string;
  user: User;
  created_at: number;
  hashtags: string[];
  reactions: Reaction[];
}

const Post: React.FC<PostProps> = ({ pool, nostrExists, keyValue }) => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Reply | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyContent, setReplyContent] = useState('');

  useEffect(() => {
    if (!pool || !id) return;

    const sub = pool.subscribeMany(
      RELAYS,
      [
        { kinds: [1], ids: [id] },
        { kinds: [1], '#e': [id] }
      ],
      {
        onevent: (event: Event) => {
          const newReply: Reply = {
            id: event.id,
            content: event.content,
            user: { 
              pubkey: event.pubkey,
              name: event.tags.find(tag => tag[0] === 'name')?.[1] || '',
              image: event.tags.find(tag => tag[0] === 'picture')?.[1] || '',
              nip05: event.tags.find(tag => tag[0] === 'nip05')?.[1] || '',
            },
            created_at: event.created_at,
            hashtags: event.tags.filter((tag: string[]) => tag[0] === 't').map((tag: string[]) => tag[1]),
            reactions: [],
          };

          if (event.id === id) {
            setPost(newReply);
          } else {
            setReplies((prevReplies) => [...prevReplies, newReply]);
          }
        },
        oneose: () => {
          setLoading(false);
        },
      }
    );

    return () => {
      sub.close();
    };
  }, [id, pool]);

  const handleReply = async () => {
    if (!pool || !id || !replyContent.trim()) return;

    const replyEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', id]],
      content: replyContent,
    };

    try {
      let signedEvent;
      if (nostrExists) {
        signedEvent = await (window as any).nostr.signEvent(replyEvent);
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        const publicKey = getPublicKey(skDecoded);
        signedEvent = {
          ...replyEvent,
          pubkey: publicKey,
          id: '',
          sig: '',
        };
      }

      await pool.publish(RELAYS, signedEvent);
      setReplyContent('');
      // Optionally, you can add the new reply to the replies state here
    } catch (error) {
      console.error('Failed to post reply:', error);
    }
  };

  if (loading) {
    return <Loading vCentered={false} />;
  }

  if (!post) {
    return <div>Post not found</div>;
  }

  return (
    <div className="space-y-4">
      <NoteCard
        id={post.id}
        content={post.content}
        user={post.user}
        created_at={post.created_at}
        hashtags={post.hashtags}
        pool={pool}
        nostrExists={nostrExists}
        reactions={post.reactions}
        keyValue={keyValue}
        deleted={false}
        replies={replies.length}
      />
      <div className="mt-8 p-16 rounded-lg">
        <textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Write your reply..."
          className="w-full p-2 border rounded text-black"
        />
        <button
          onClick={handleReply}
          className="mt-2 p-12 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Reply
        </button>
      </div>
      <h2 className="text-xl font-bold mt-6 mb-4">Replies</h2>
      {replies.map(reply => (
        <NoteCard
          key={reply.id}
          id={reply.id}
          content={reply.content}
          user={reply.user}
          created_at={reply.created_at}
          hashtags={reply.hashtags}
          pool={pool}
          nostrExists={nostrExists}
          reactions={reply.reactions}
          keyValue={keyValue}
          deleted={false}
          replies={replies.length}
        />
      ))}
    </div>
  );
};

export default Post;
