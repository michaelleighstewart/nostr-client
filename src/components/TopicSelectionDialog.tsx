import React, { useState, useEffect } from 'react';
import { API_URLS } from '../utils/apiConstants';

interface TopicSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopicNote: (topic: string) => void;
  onSelectTopicPodcast: (topic: string) => void;
  userNpub: string;
}

//for later
interface TrendingTopic {
  name: string;
  value: string;
}

const TopicSelectionDialog: React.FC<TopicSelectionDialogProps> = ({ isOpen, onClose, onSelectTopicNote, onSelectTopicPodcast, userNpub }) => {
  const [customTopic, setCustomTopic] = useState<TrendingTopic>({name: '', value: ''});
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

  const handleSelectTopic = (topic: TrendingTopic) => {
    setCustomTopic(topic);
  };

  const handleCustomTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTopic.value.trim()) {
      onSelectTopicNote(customTopic.value.trim());
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="card w-96 max-w-full p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-medium leading-6 text-white mb-4">Select a Topic</h3>
        <div className="mt-2 space-y-4">
          <div className="border-t border-[var(--color-border)] pt-4">
            <button
              onClick={() => setIsRecommendedAccordionOpen(!isRecommendedAccordionOpen)}
              className="btn-ghost w-full flex justify-between items-center"
            >
              <span>Recommended Topics</span>
              <span>{isRecommendedAccordionOpen ? '▲' : '▼'}</span>
            </button>
            {isRecommendedAccordionOpen && (
              <div className="mt-2 space-y-2">
                {predefinedTopics.map((topic) => (
                  <button
                    key={topic.name}
                    onClick={() => handleSelectTopic(topic)}
                    className="btn-primary w-full"
                  >
                    {topic.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--color-border)] pt-4">
            <button
              onClick={() => setIsTrendingAccordionOpen(!isTrendingAccordionOpen)}
              className="btn-ghost w-full flex justify-between items-center"
            >
              <span>Trending Topics In Your Network</span>
              <span>{isTrendingAccordionOpen ? '▲' : '▼'}</span>
            </button>
            {isTrendingAccordionOpen && (
              <div className="mt-2 space-y-2">
                {trendingTopics.map((topic, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectTopic({name: topic, value: topic})}
                    className="btn-primary w-full"
                  >
                    {topic}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form onSubmit={handleCustomTopicSubmit} className="mt-4">
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              value={customTopic.name}
              onChange={(e) => setCustomTopic({name: e.target.value, value: e.target.value})}
              placeholder="Enter custom topic"
              className="input-field"
            />
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  if (customTopic.value.trim()) {
                    onSelectTopicNote(customTopic.value.trim());
                    onClose();
                  }
                }}
                className="btn-primary flex-1"
              >
                Generate Post
              </button>
              <button
                type="button"
                onClick={() => {
                  if (customTopic.value.trim()) {
                    onSelectTopicPodcast(customTopic.value.trim());
                    onClose();
                  }
                }}
                className="btn-primary flex-1"
              >
                Generate Podcast
              </button>
            </div>
          </div>
        </form>
        </div>
        <button
          onClick={onClose}
          className="btn-secondary mt-4 w-full"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default TopicSelectionDialog;