import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RELAYS } from '../utils/constants';
import { bech32Decoder } from '../utils/helperFunctions';
import Loading from './Loading';
import { SimplePool, Event, getPublicKey } from 'nostr-tools';

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
                return [...prevGroups, { pubkey: otherPubkey, messages: [event], userInfo: null }];
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

  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!pool) return;

      const userInfoSub = pool.subscribeMany(
        RELAYS,
        messageGroups.map(group => ({
          kinds: [0],
          authors: [group.pubkey],
        })),
        {
          onevent(event: Event) {
            setMessageGroups(prevGroups => {
              const groupIndex = prevGroups.findIndex(group => group.pubkey === event.pubkey);
              if (groupIndex > -1) {
                const userInfo = JSON.parse(event.content);
                const updatedGroup = {
                  ...prevGroups[groupIndex],
                  userInfo: {
                    name: userInfo.name || 'Unknown',
                    picture: userInfo.picture || '',
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
          },
        }
      );

      return () => {
        userInfoSub.close();
      };
    };

    fetchUserInfo();
  }, [messageGroups, pool]);

  if (loading) return <Loading vCentered={false} />;

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-4">Messages</h1>
      {messageGroups.map((group) => (
        <Link
          key={group.pubkey}
          to={`/conversation/${group.pubkey}`}
          className="block border-b border-gray-200 py-4 hover:bg-gray-50"
        >
          <div className="flex items-center">
            {group.userInfo && group.userInfo.picture && (
              <img src={group.userInfo.picture} alt={group.userInfo.name} className="w-10 h-10 rounded-full mr-4" />
            )}
            <div className="flex-grow">
              <div className="flex justify-between items-center">
                <span className="font-semibold">{group.userInfo ? group.userInfo.name : group.pubkey.slice(0, 8)}</span>
                <span className="text-sm text-gray-500">
                  {new Date(group.messages[group.messages.length - 1].created_at * 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
};

export default Messages;