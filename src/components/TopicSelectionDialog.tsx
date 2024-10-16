import React, { useState, useEffect } from 'react';
import { API_URLS } from '../utils/apiConstants';

interface TopicSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic: (topic: string) => void;
  userNpub: string;
}

//for later
//interface TrendingTopic {
//  name: string;
//  value: string;
//}

const TopicSelectionDialog: React.FC<TopicSelectionDialogProps> = ({ isOpen, onClose, onSelectTopic, userNpub }) => {
  const [customTopic, setCustomTopic] = useState('');
  const [trendingTopics, setTrendingTopics] = useState<string[]>([]);
  const [isTrendingAccordionOpen, setIsTrendingAccordionOpen] = useState(false);
  const [isRecommendedAccordionOpen, setIsRecommendedAccordionOpen] = useState(false);
  const predefinedTopics = [{'name': 'nostr', 'value': 'nostr, a decentralized, censorship-resistant messaging protocol'}, {'name': 'bitcoin', 'value': 'bitcoin'}];

  useEffect(() => {
    const fetchTrendingTopics = async () => {
      try {
        const response = await fetch(`${API_URLS.API_URL}trending-topics?npub=${userNpub}`);
        if (!response.ok) {
          throw new Error('Failed to fetch trending topics');
        }
        const data = await response.json();
        setTrendingTopics(data.trendingTopics);
      } catch (error) {
        console.error('Error fetching trending topics:', error);
      }
    };

    if (isOpen) {
      fetchTrendingTopics();
    }
  }, [isOpen, userNpub]);

  const handleSelectTopic = (topic: string) => {
    onSelectTopic(topic);
    onClose();
  };

  const handleCustomTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTopic.trim()) {
      onSelectTopic(customTopic.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-gray-800">
        <h3 className="text-lg font-medium leading-6 text-white mb-4">Select a Topic</h3>
        <div className="mt-2 space-y-4">
          <div className="border-t border-gray-600 pt-4">
            <button
              onClick={() => setIsRecommendedAccordionOpen(!isRecommendedAccordionOpen)}
              className="w-full p-2 bg-gray-700 text-white rounded flex justify-between items-center"
            >
              <span>Recommended Topics</span>
              <span>{isRecommendedAccordionOpen ? '▲' : '▼'}</span>
            </button>
            {isRecommendedAccordionOpen && (
              <div className="mt-2 space-y-2">
                {predefinedTopics.map((topic) => (
                  <button
                    key={topic.name}
                    onClick={() => handleSelectTopic(topic.value)}
                    className="w-full p-2 bg-[#535bf2] text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
                  >
                    {topic.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-600 pt-4">
            <button
              onClick={() => setIsTrendingAccordionOpen(!isTrendingAccordionOpen)}
              className="w-full p-2 bg-gray-700 text-white rounded flex justify-between items-center"
            >
              <span>Trending Topics In Your Network</span>
              <span>{isTrendingAccordionOpen ? '▲' : '▼'}</span>
            </button>
            {isTrendingAccordionOpen && (
              <div className="mt-2 space-y-2">
                {trendingTopics.map((topic, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectTopic(topic)}
                    className="w-full p-2 bg-[#535bf2] text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form onSubmit={handleCustomTopicSubmit} className="mt-4">
            <div className="flex">
              <input
                type="text"
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Enter custom topic"
                className="flex-grow p-2 border border-r-0 rounded-l text-black"
              />
              <button
                type="submit"
                className="p-2 bg-[#535bf2] text-white rounded-r hover:bg-[#535bf2]-700 transition duration-200"
              >
                Generate
              </button>
            </div>
          </form>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full p-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition duration-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default TopicSelectionDialog;