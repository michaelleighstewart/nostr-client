import React, { useState, useEffect } from 'react';
import { API_URLS } from '../utils/apiConstants';
import Loading from './Loading';
import { getUserPublicKey } from '../utils/profileUtils';
import { nip19 } from 'nostr-tools';
import { showCustomToast } from './CustomToast';

interface PodcastRequestsProps {
  keyValue: string;
  nostrExists: boolean | null;
}

interface PodcastRequest {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  download_url?: string;
}

const PodcastRequests: React.FC<PodcastRequestsProps> = ({ keyValue, nostrExists }) => {
  const [requests, setRequests] = useState<PodcastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPodcastRequests = async () => {
      try {
        const userPubkey = await getUserPublicKey(nostrExists ?? false, keyValue);
        const npub = nip19.npubEncode(userPubkey);
        
        const response = await fetch(`${API_URLS.API_URL}podcast-requests?npub=${npub}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch podcast requests');
        }

        const data = await response.json();
        setRequests(data.requests);
      } catch (error) {
        console.error('Error fetching podcast requests:', error);
        setError('Failed to load podcast requests');
        showCustomToast('Failed to load podcast requests', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchPodcastRequests();
  }, [keyValue, nostrExists]);

  if (loading) {
    return <div className="h-screen"><Loading vCentered={false} /></div>;
  }

  if (error) {
    return <div className="text-center text-red-500 mt-4">{error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Podcast Requests</h1>
      {requests.length === 0 ? (
        <p className="text-center text-gray-500">No podcast requests found</p>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <div key={request.id} className="bg-gray-800 rounded-lg p-4 shadow">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold mb-2">{request.topic}</h2>
                  <p className="text-gray-400">
                    Created: {new Date(request.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-gray-400">
                    Status: <span className={`font-semibold ${
                      request.status === 'completed' ? 'text-green-500' : 
                      request.status === 'failed' ? 'text-red-500' : 
                      'text-yellow-500'
                    }`}>
                      {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                    </span>
                  </p>
                </div>
                {request.download_url && (
                  <a
                    href={request.download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#535bf2] text-white px-4 py-2 rounded hover:bg-[#4349d6] transition duration-200"
                  >
                    Download
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PodcastRequests;