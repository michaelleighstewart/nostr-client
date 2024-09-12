import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';
import { SimplePool, Event, getPublicKey, nip04, finalizeEvent } from 'nostr-tools';
import { showCustomToast } from './CustomToast';
import { nip19 } from 'nostr-tools';

interface MessagesProps {
  keyValue: string;
  pool: SimplePool | null;
  nostrExists: boolean | null;
}

interface MessageGroup {
  pubkey: string;
  messages: Event[];
  userInfo: UserInfo | null;
}

interface UserInfo {
  name: string;
  picture: string;
}

const Messages: React.FC<MessagesProps> = ({ keyValue, pool, nostrExists }) => {
  const [messageGroups, setMessageGroups] = useState<MessageGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [recipientNpub, setRecipientNpub] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!pool) return;

      let userPubkey: string;
      if (nostrExists) {
        userPubkey = await (window as any).nostr.getPublicKey();
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        userPubkey = getPublicKey(skDecoded);
      }

      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [4],
            authors: [userPubkey],
          },
          {
            kinds: [4],
            '#p': [userPubkey],
          }
        ],
        {
          onevent(event: Event) {
            setMessageGroups((prevGroups) => {
              const otherPubkey = event.pubkey === userPubkey ? event.tags.find(tag => tag[0] === 'p')?.[1] : event.pubkey;
              if (!otherPubkey) return prevGroups;

              const groupIndex = prevGroups.findIndex(group => group.pubkey === otherPubkey);
              if (groupIndex > -1) {
                const updatedGroup = {
                  ...prevGroups[groupIndex],
                  messages: [...prevGroups[groupIndex].messages, event].sort((a, b) => a.created_at - b.created_at),
                };
                return [
                  ...prevGroups.slice(0, groupIndex),
                  updatedGroup,
                  ...prevGroups.slice(groupIndex + 1),
                ];
              } else {
                const newGroup = { pubkey: otherPubkey, messages: [event], userInfo: null };
                fetchUserMetadata(otherPubkey);
                return [...prevGroups, newGroup];
              }
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
  }, [keyValue, pool, nostrExists]);

  const fetchUserMetadata = async (pubkey: string) => {
    if (!pool) return;

    const metadata = await pool.querySync(RELAYS, {
      kinds: [0],
      authors: [pubkey],
    });

    if (metadata && metadata.length > 0) {
      const content = JSON.parse(metadata[0].content);
      setMessageGroups((prevGroups) => {
        const groupIndex = prevGroups.findIndex(group => group.pubkey === pubkey);
        if (groupIndex > -1) {
          const updatedGroup = {
            ...prevGroups[groupIndex],
            userInfo: {
              name: content.name || '',
              picture: content.picture || '',
            },
          };
          return [
            ...prevGroups.slice(0, groupIndex),
            updatedGroup,
            ...prevGroups.slice(groupIndex + 1),
          ];
        }
        return prevGroups;
      });
    }
  };

  const handleSendMessage = async () => {
    if (!pool || !recipientNpub || !messageContent.trim()) return;

    setIsSending(true);

    try {
      const recipientPubkey = nip19.decode(recipientNpub).data as string;
      let userPubkey: string;
      let encryptedContent: string;

      if (nostrExists) {
        userPubkey = await (window as any).nostr.getPublicKey();
        encryptedContent = await (window as any).nostr.nip04.encrypt(recipientPubkey, messageContent);
      } else {
        const skDecoded = bech32Decoder('nsec', keyValue);
        userPubkey = getPublicKey(skDecoded);
        encryptedContent = await nip04.encrypt(skDecoded.toString('hex'), recipientPubkey, messageContent);
      }

      let event = {
        kind: 4,
        pubkey: userPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['p', recipientPubkey]],
        content: encryptedContent,
      };

      if (nostrExists) {
        await (window as any).nostr.signEvent(event).then(async (eventToSend: any) => {
          await pool?.publish(RELAYS, eventToSend);
        });
      } else {
        let sk = keyValue;
        let skDecoded = bech32Decoder('nsec', sk);
        let eventFinal = finalizeEvent(event, skDecoded);
        await pool?.publish(RELAYS, eventFinal);
      }

      showCustomToast("Message sent successfully!", "success");
      setIsDialogOpen(false);
      setRecipientNpub('');
      setMessageContent('');
    } catch (error) {
      console.error('Error sending message:', error);
      showCustomToast("Failed to send message", "error");
    } finally {
      setIsSending(false);
    }
  };

  if (loading) return <Loading vCentered={false} />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Messages</h1>
      <div>
      <button
        onClick={() => setIsDialogOpen(true)}
        className="mb-4 bg-[#535bf2] hover:bg-[#535bf2]-700 text-white font-bold py-2 px-16 rounded mt-16 mb-16"
      >
          Send New Message
        </button>
      </div>
      <div className="p-16">
        {messageGroups.map((group) => (
          <Link
            key={group.pubkey}
            to={`/conversation/${group.pubkey}`}
            className="block border-b border-gray-200 py-32 hover:bg-gray-50"
          >
            <div className="flex items-center pl-16 pr-16">
              {group.userInfo?.picture && (
                <img
                  src={group.userInfo.picture}
                  alt={group.userInfo.name || "User"}
                  className="w-64 h-64 rounded-full mr-4"
                />
              )}
              <div className="flex-grow">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{group.userInfo?.name || group.pubkey.slice(0, 8)}</span>
                  <span className="text-sm text-gray-500">
                    {new Date(group.messages[group.messages.length - 1].created_at * 1000).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {isDialogOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-gray-800">
            <div className="mt-3 text-center">
              <h3 className="text-lg leading-6 font-medium text-white">Send New Message</h3>
              <div className="mt-2 px-7 py-3">
                <input
                  type="text"
                  value={recipientNpub}
                  onChange={(e) => setRecipientNpub(e.target.value)}
                  placeholder="Recipient's npub"
                  className="px-8 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-black"
                />
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Message content"
                  className="px-8 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50 text-black"
                  rows={4}
                />
              </div>
              <div className="items-center px-4 py-3">
                <button
                  onClick={handleSendMessage}
                  disabled={isSending}
                  className="px-4 py-2 bg-[#535bf2]-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-[#535bf2]-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {isSending ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => setIsDialogOpen(false)}
                  className="mt-3 px-4 py-2 bg-gray-300 text-gray-800 text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
