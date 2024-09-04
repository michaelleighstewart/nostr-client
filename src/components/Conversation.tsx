import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SimplePool, Event, getPublicKey, nip04 } from 'nostr-tools';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';

interface ConversationProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

interface Message {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
}

const Conversation: React.FC<ConversationProps> = ({ keyValue, pool, nostrExists }) => {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [userPubkey, setUserPubkey] = useState<string>('');
  const [privateKey, setPrivateKey] = useState<string>('');

  useEffect(() => {
    const fetchUserPubkey = async () => {
      if (nostrExists) {
        const pubkey = await (window as any).nostr.getPublicKey();
        setUserPubkey(pubkey);
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        const pubkey = getPublicKey(skDecoded);
        setUserPubkey(pubkey);
        setPrivateKey(skDecoded.toString('hex'));
      }
    };

    fetchUserPubkey();
  }, [keyValue, nostrExists]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!pool || !id || !userPubkey) return;

      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [4],
            authors: [userPubkey],
            '#p': [id],
            limit: 10,
          },
          {
            kinds: [4],
            authors: [id],
            '#p': [userPubkey],
            limit: 10,
          }
        ],
        {
          async onevent(event: Event) {
            let decryptedContent: string;
            if (event.pubkey === userPubkey) {
              decryptedContent = await (window as any).nostr.nip04.decrypt(event.tags[0][1], event.content);
            } else {
                if (nostrExists) {
                    decryptedContent = await (window as any).nostr.nip04.decrypt(event.pubkey, event.content);
                } else {
                    decryptedContent = await nip04.decrypt(privateKey, event.pubkey, event.content);
                }
            }

            const newMessage: Message = {
              id: event.id,
              content: decryptedContent,
              created_at: event.created_at,
              pubkey: event.pubkey,
            };

            setMessages(prevMessages => {
              const updatedMessages = [...prevMessages, newMessage]
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, 10);
              return updatedMessages;
            });
          },
          oneose() {
            setLoading(false);
          },
        }
      );

      return () => {
        sub.close();
      };
    };

    fetchMessages();
  }, [pool, id, userPubkey, nostrExists, privateKey]);

  if (loading) return <Loading vCentered={false} />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Conversation</h1>
      <div className="space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-4 rounded-lg ${
              message.pubkey === userPubkey ? 'bg-blue-100 ml-auto' : 'bg-gray-100'
            } max-w-[70%]`}
          >
            <p className="text-black">{message.content}</p>
            <span className="text-xs text-gray-500">
              {new Date(message.created_at * 1000).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Conversation;