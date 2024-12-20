import React, { useState, useEffect } from 'react';
import { API_URLS } from '../utils/apiConstants';
import Loading from './Loading';
import { getUserPublicKey } from '../utils/profileUtils';
import { nip19, SimplePool } from 'nostr-tools';
import { showCustomToast } from './CustomToast';
import { sendMessage } from '../utils/helperFunctions';
import AudioEmbed from './AudioEmbed';

interface PodcastRequestsProps {
  keyValue: string;
  nostrExists: boolean | null;
  pool: SimplePool | null;
}

interface PodcastRequest {
  request_id: string;
  topic: string;
  status: string;
  created_at: string;
  download_url?: string;
  video_url?: string;
  podcast_topic?: string;
  completion_percentage?: number;
}

interface PaginatedResponse {
  requests: PodcastRequest[];
  next_key?: string;
}

const REQUESTS_PER_PAGE = 10;

const PodcastRequests: React.FC<PodcastRequestsProps> = ({ keyValue, nostrExists, pool }) => {
  const [requests, setRequests] = useState<PodcastRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PodcastRequest | null>(null);
  const [downloadTypes, setDownloadTypes] = useState<Record<string, 'audio' | 'video'>>({});
  const [nextKey, setNextKey] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);

  const fetchPodcastRequests = async (startKey?: string) => {
    try {
      const userPubkey = await getUserPublicKey(nostrExists ?? false, keyValue);
      const npub = nip19.npubEncode(userPubkey);
      
      let url = `${API_URLS.API_URL}podcast-requests?npub=${npub}&limit=${REQUESTS_PER_PAGE}`;
      if (startKey) {
        url += `&startKey=${startKey}`;
      }
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to fetch podcast requests');
      }

      const data: PaginatedResponse = await response.json();
      
      // Sort requests with newest first
      const sortedRequests = data.requests.sort((a, b) => 
        parseInt(b.created_at) - parseInt(a.created_at)
      );

      if (!startKey) {
        setRequests(sortedRequests);
      } else {
        setRequests(prev => [...prev, ...sortedRequests]);
      }

      setNextKey(data.next_key);
      setHasMore(!!data.next_key);
      
      // Initialize download types for new requests
      const newDownloadTypes: Record<string, 'audio' | 'video'> = {};
      sortedRequests.forEach((request) => {
        newDownloadTypes[request.request_id] = request.download_url ? 'audio' : 'video';
      });
      setDownloadTypes(prev => ({...prev, ...newDownloadTypes}));

    } catch (error) {
      console.error('Error fetching podcast requests:', error);
      setError('Failed to load podcast requests');
      showCustomToast('Failed to load podcast requests', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchPodcastRequests();
  }, [keyValue, nostrExists]);

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPodcastRequests(nextKey);
  };

  const handleShare = (request: PodcastRequest) => {
    setSelectedRequest(request);
    setShareMessage(`Check out this podcast on ${request.topic} that I created with https://ghostcopywrite.com`);
    setShowShareDialog(true);
  };

  const handlePost = async () => {
    if (!selectedRequest?.video_url) return;
    
    const messageWithLink = `${shareMessage}\n\n${selectedRequest.video_url}`;
    await sendMessage(pool, nostrExists, keyValue, messageWithLink, setPosting, setShareMessage);
    setShowShareDialog(false);
    showCustomToast('Posted successfully!');
  };

  const handleDownloadTypeChange = (requestId: string, type: 'audio' | 'video') => {
    setDownloadTypes(prev => ({
      ...prev,
      [requestId]: type
    }));
  };

  if (loading) {
    return <div className="h-screen"><Loading vCentered={false} /></div>;
  }

  if (error) {
    return <div className="text-center text-red-500 mt-4">{error}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Podcasts</h1>
      {requests.length === 0 ? (
        <p className="text-center text-gray-500">No podcast requests found</p>
      ) : (
        <div className="grid gap-8">
          {requests.map((request) => (
            <div key={request.request_id} className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
              {request.status === 'processing' && request.completion_percentage !== undefined && (
                <div className="w-full bg-gray-700 h-2.5 mb-4">
                  <div 
                    className="bg-blue-500 h-2.5 transition-all duration-500"
                    style={{ width: `${request.completion_percentage}%` }}
                  ></div>
                </div>
              )}
              <div className="flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h2 className="text-xl font-semibold mb-2">{request.topic}</h2>
                    {request.podcast_topic && (
                      <p className="text-gray-400 mb-2">
                        Podcast Topic: {request.podcast_topic}
                      </p>
                    )}
                    <p className="text-gray-400">
                      Created: {new Date(parseInt(request.created_at) * 1000).toLocaleDateString()} {new Date(parseInt(request.created_at) * 1000).toLocaleTimeString()}
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
                    {request.status === 'processing' && request.completion_percentage !== undefined && (
                      <p className="text-gray-400 text-sm mt-1">
                        {request.completion_percentage}% complete
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-4">
                    {(request.download_url || request.video_url) && (
                      <>
                        <div className="flex flex-col gap-2">
                          <select
                            value={downloadTypes[request.request_id]}
                            onChange={(e) => handleDownloadTypeChange(request.request_id, e.target.value as 'audio' | 'video')}
                            className="bg-gray-700 text-white px-4 py-2 rounded"
                          >
                            {request.download_url && <option value="audio">Audio (MP3)</option>}
                            {request.video_url && <option value="video">Video</option>}
                          </select>
                          <a
                            href={downloadTypes[request.request_id] === 'audio' ? request.download_url : request.video_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-[#535bf2] text-white px-16 py-2 rounded hover:bg-[#4349d6] transition duration-200 text-center"
                          >
                            Download
                          </a>
                        </div>
                        <button
                          onClick={() => handleShare(request)}
                          className="bg-green-600 text-white px-16 py-2 rounded hover:bg-green-700 transition duration-200"
                        >
                          Share
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {downloadTypes[request.request_id] === 'audio' && request.download_url && (
                  <AudioEmbed url={request.download_url} />
                )}
                {downloadTypes[request.request_id] === 'video' && request.video_url && (
                  <div className="w-full">
                    <video 
                      controls
                      className="w-full mt-2"
                      preload="none"
                    >
                      <source src={request.video_url} type="video/mp4" />
                      Your browser does not support the video element.
                    </video>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="bg-[#535bf2] text-white px-8 py-2 rounded hover:bg-[#4349d6] disabled:opacity-50"
              >
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}

      {showShareDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold mb-4">Share Podcast</h2>
            <textarea
              value={shareMessage}
              onChange={(e) => setShareMessage(e.target.value)}
              className="w-full h-72 p-2 mb-4 bg-gray-700 rounded"
              placeholder="Enter your message..."
            />
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowShareDialog(false)}
                className="px-32 py-2 bg-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handlePost}
                disabled={posting}
                className="px-32 py-2 bg-[#535bf2] rounded hover:bg-[#4349d6] disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PodcastRequests;