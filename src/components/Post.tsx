import React, { useState, useEffect } from 'react';
import { SimplePool, Event } from 'nostr-tools';
import { useParams } from 'react-router-dom';
import NoteCard from './NoteCard';
import { Reaction } from './Home'; // Assuming Reaction type is defined in Home.tsx
import { RELAYS } from '../utils/constants';
import { User } from '../utils/helperFunctions';

interface PostProps {
  pool: SimplePool | null;
}

interface Reply {
  id: string;
  content: string;
  user: User;
  created_at: number;
  hashtags: string[];
  reactions: Reaction[];
}

const Post: React.FC<PostProps> = ({ pool }) => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Reply | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div>Loading...</div>;
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
        nostrExists={true}
        reactions={post.reactions}
        keyValue=""
        deleted={false}
      />
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
          nostrExists={true}
          reactions={reply.reactions}
          keyValue=""
          deleted={false}
        />
      ))}
    </div>
  );
};

export default Post;
