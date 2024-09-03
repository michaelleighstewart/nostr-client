import React, { useState } from 'react';
import { SimplePool, nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';
import { RELAYS } from '../utils/constants';
import { UserCircleIcon } from '@heroicons/react/24/solid';

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

  const handleSearch = async () => {
    if (!pool || !searchTerm) return;

    try {
      const { type, data } = nip19.decode(searchTerm);
      if (type !== 'npub') {
        console.error('Invalid npub');
        return;
      }

      const pubkey = data;
      const results: ProfileResult[] = [];

      const sub = pool.subscribeMany(
        RELAYS,
        [{ kinds: [0], authors: [pubkey] }],
        {
          onevent(event) {
            const profile = JSON.parse(event.content);
            results.push({
              npub: searchTerm,
              name: profile.name,
              picture: profile.picture,
            });
          },
          oneose() {
            setSearchResults(results);
            sub.close();
          },
        }
      );
    } catch (error) {
      console.error('Error searching for profile:', error);
    }
  };

  return (
    <div className="p-4">
      <div className="flex mb-4">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Enter npub"
          className="flex-grow p-2 border rounded-l text-black"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-500 text-white rounded-r hover:bg-blue-600"
        >
          Search
        </button>
      </div>
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
    </div>
  );
};

export default Search;
