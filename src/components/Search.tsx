import React, { useState, KeyboardEvent } from 'react';
import { SimplePool, nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { RELAYS } from '../utils/constants';
import { UserCircleIcon } from '@heroicons/react/24/solid';
import Loading from './Loading';

interface SearchProps {
  pool: SimplePool | null;
}

interface ProfileResult {
  npub: string;
  name?: string;
  picture?: string;
}

const Search: React.FC<SearchProps> = ({ pool }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!pool || !searchTerm) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      let pubkeys: string[] = [];

      // Check if the search term is an npub
      try {
        const { type, data } = nip19.decode(searchTerm);
        if (type === 'npub') {
          pubkeys.push(data);
        }
      } catch (error) {
        // If it's not an npub, we'll search by username
        console.log('Not an npub, searching by username');
      }

      const results: ProfileResult[] = [];

      const sub = pool.subscribeMany(
        RELAYS,
        [{ kinds: [0], ...(pubkeys.length ? { authors: pubkeys } : {}) }],
        {
          onevent(event) {
            const profile = JSON.parse(event.content);
            if (pubkeys.length || profile.name?.toLowerCase().includes(searchTerm.toLowerCase())) {
              results.push({
                npub: nip19.npubEncode(event.pubkey),
                name: profile.name,
                picture: profile.picture,
              });
            }
          },
          oneose() {
            setSearchResults(results);
            setIsLoading(false);
            sub.close();
          },
        }
      );
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

  return (
    <div className="p-4">
      <div className="flex mb-4">
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
          className="px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600"
        >
          Search
        </button>
      </div>
      {isLoading ? (
        <Loading vCentered={false} />
      ) : hasSearched && searchResults.length === 0 ? (
        <p className="text-center">No results found</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {searchResults.map((result) => (
            <Link
              key={result.npub}
              to={`/profile?npub=${result.npub}`}
              className="block p-4 border rounded hover:shadow-md transition-shadow"
            >
              {result.picture ? (
                <img
                  src={result.picture}
                  alt={result.name || 'Profile'}
                  className="w-20 h-20 rounded-full mx-auto mb-2"
                />
              ) : (
                <UserCircleIcon className="w-20 h-20 text-gray-400 mx-auto mb-2" />
              )}
              <p className="text-center font-semibold">{result.name || 'Unknown'}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;