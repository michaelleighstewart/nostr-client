import React, { useState, useEffect } from 'react';
import { SimplePool, Event, getPublicKey } from 'nostr-tools';
import { RELAYS } from '../utils/constants';
import Loading from './Loading';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { bech32Decoder } from "../utils/helperFunctions";

interface NotificationsProps {
  pool: SimplePool | null;
  nostrExists: boolean | null;
  keyValue: string;
}

interface Notification {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  kind: number;
}

const Notifications: React.FC<NotificationsProps> = ({ pool, nostrExists, keyValue }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pool) return;

    const fetchNotifications = async () => {
      let pk = "";
      if (nostrExists) {
        pk = await (window as any).nostr.getPublicKey();
      } else {
        let sk = keyValue;
        let skDecoded = bech32Decoder('nsec', sk);
        pk = getPublicKey(skDecoded);
      }

      const sub = pool.subscribeMany(
        RELAYS,
        [
          {
            kinds: [1, 7], // Text notes and reactions
            '#p': [pk],
            since: Math.floor(Date.now() / 1000) - 24 * 60 * 60 // Last 24 hours
          }
        ],
        {
          onevent(event: Event) {
            setNotifications(prev => [
              ...prev,
              {
                id: event.id,
                pubkey: event.pubkey,
                content: event.content,
                created_at: event.created_at,
                kind: event.kind
              }
            ]);
          },
          oneose() {
            setLoading(false);
          }
        }
      );

      return () => {
        sub.close();
      };
    };

    fetchNotifications();
  }, [pool, nostrExists, keyValue]);

  if (loading) return <Loading vCentered={false} />;

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Notifications</h2>
      {notifications.length === 0 ? (
        <p>No new notifications.</p>
      ) : (
        <ul>
          {notifications.map((notification) => (
            <li key={notification.id} className="mb-4 p-4 bg-gray-800 rounded-lg">
              <Link to={`/profile/${nip19.npubEncode(notification.pubkey)}`} className="font-bold text-blue-500">
                {notification.pubkey.slice(0, 8)}...
              </Link>
              {notification.kind === 1 ? (
                <span> mentioned you in a post: </span>
              ) : (
                <span> reacted to your post </span>
              )}
              <p className="mt-2">{notification.content}</p>
              <span className="text-sm text-gray-400">
                {new Date(notification.created_at * 1000).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Notifications;
