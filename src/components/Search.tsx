import React, { useState, KeyboardEvent, useEffect } from 'react';
import { SimplePool, nip19, finalizeEvent, getPublicKey } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { RELAYS } from '../utils/constants';
import { UserCircleIcon } from '@heroicons/react/24/solid';
import { UserPlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import Loading from './Loading';
import { bech32Decoder } from '../utils/helperFunctions';
import { API_URLS } from '../utils/apiConstants';

interface SearchProps {
  pool: SimplePool | null;
  nostrExists: boolean | null;
  keyValue: string;
}

interface ProfileResult {
  npub: string;
  name?: string;
  picture?: string;
  isFollowing: boolean;
}

const Search: React.FC<SearchProps> = ({ pool, nostrExists, keyValue }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentUserPubkey, setCurrentUserPubkey] = useState<string | null>(null);
  const [followingList, setFollowingList] = useState<string[]>([]);

  useEffect(() => {
    const fetchCurrentUserPubkey = async () => {
      if (nostrExists) {
        const pubkey = await (window as any).nostr.getPublicKey();
        setCurrentUserPubkey(pubkey);
      } else if (keyValue) {
        const skDecoded = bech32Decoder("nsec", keyValue);
        const pubkey = getPublicKey(skDecoded);
        setCurrentUserPubkey(pubkey);
      }
    };

    fetchCurrentUserPubkey();
  }, [nostrExists, keyValue]);

  useEffect(() => {
    const fetchFollowingList = async () => {
      if (!pool || !currentUserPubkey) return;

      const followEvents = await pool.querySync(
        RELAYS,
        { kinds: [3], authors: [currentUserPubkey] }
      );

      if (followEvents.length > 0) {
        const followedPubkeys = followEvents[0].tags
          .filter(tag => tag[0] === 'p')
          .map(tag => tag[1]);

        setFollowingList(followedPubkeys);
      }
    };

    fetchFollowingList();
  }, [pool, currentUserPubkey]);

  const handleSearch = async () => {
    if (!pool || !searchTerm) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      let results: ProfileResult[] = [];

      if (searchTerm.startsWith('npub')) {
        // Search by npub
        let pubkey: string | null = null;
        try {
          const { type, data } = nip19.decode(searchTerm);
          if (type === 'npub') {
            pubkey = data;
          }
        } catch (error) {
          console.log('Not a valid npub');
          setIsLoading(false);
          setSearchResults([]);
          return;
        }

        if (!pubkey) {
          setIsLoading(false);
          setSearchResults([]);
          return;
        }

        const sub = pool.subscribeMany(
          RELAYS,
          [
            {
              kinds: [0],
              authors: [pubkey],
            },
          ],
          {
            onevent(event) {
              const profile = JSON.parse(event.content);
              results.push({
                npub: nip19.npubEncode(event.pubkey),
                name: profile.display_name || profile.name,
                picture: profile.picture,
                isFollowing: followingList.includes(event.pubkey),
              });
            },
            oneose() {
              setSearchResults(results);
              setIsLoading(false);
              sub.close();
            },
          }
        );
      } else {
        // Search by term using the API
        const response = await fetch(`https://api.nostr.wine/search?query=${encodeURIComponent(searchTerm)}&kind=0`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        results = data.data.map((profile: any) => {
          const content = JSON.parse(profile.content);
          return {
            npub: nip19.npubEncode(profile.pubkey),
            name: content.display_name || content.name,
            picture: content.picture,
            isFollowing: followingList.includes(profile.pubkey),
          };
        });
        setSearchResults(results);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error searching for profile:', error);
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  const handleFollow = async (pubkey: string) => {
    if (!pool) return;

    const event = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags: [...followingList.map(pk => ['p', pk]), ['p', pubkey]],
        content: '',
    };

    try {
        if (nostrExists) {
            const signedEvent = await (window as any).nostr.signEvent(event);
            await pool.publish(RELAYS, signedEvent);
        } else {
            const skDecoded = bech32Decoder("nsec", keyValue);
            const signedEvent = finalizeEvent(event, skDecoded);
            await pool.publish(RELAYS, signedEvent);
        }

        setFollowingList(prevList => [...prevList, pubkey]);
        // Update UI to show that the user is now following

        // Call the batch-processor API
        const response = await fetch(API_URLS.API_URL + 'batch-processor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: 'social_graph_processor',
                npub: nip19.npubEncode(pubkey),
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to call batch-processor API');
        }
    } catch (error) {
        console.error("Error following user or calling batch-processor API:", error);
        // Show error message to user
    }
};

  const showFollowFunctionality = true;

  return (
    <div className="p-4">
      <div className="flex mb-4 pb-32">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Enter npub or username"
          className="flex-grow p-2 border rounded-l text-black"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 text-white rounded-r"
        >
          Search
        </button>
      </div>
      {isLoading ? (
          <div className="h-screen"><Loading vCentered={false} /></div>
      ) : hasSearched && searchResults.length === 0 ? (
        <p className="text-center">No results found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
          {searchResults.map((result) => (
            <div key={result.npub} className="flex flex-col items-center justify-between p-32 border rounded hover:shadow-md transition-shadow h-full">
              <Link
                to={`/profile/${result.npub}`}
                className="flex flex-col items-center"
              >
                <div className="w-80 h-80 mb-4 overflow-hidden rounded-full">
                  {result.picture ? (
                    <img
                      src={result.picture}
                      alt={result.name || 'Profile'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="w-full h-full text-gray-400" />
                  )}
                </div>
                <p className="text-center font-semibold">{result.name || 'Unknown'}</p>
              </Link>
              {showFollowFunctionality && (
              <button
                onClick={() => handleFollow(result.npub)}
                className={`mt-4 flex items-center justify-center px-8 py-2 text-white rounded ${
                  result.isFollowing ? 'bg-green-500' : 'bg-[#535bf2]-500'
                }`}
                disabled={result.isFollowing}
              >
                {result.isFollowing ? (
                  <>
                    <CheckIcon className="h-5 w-5 mr-2" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlusIcon className="h-5 w-5 mr-2" />
                    Follow
                  </>
                )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;
