import React, { useState } from 'react';

interface TopicSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTopic: (topic: string) => void;
}

const TopicSelectionDialog: React.FC<TopicSelectionDialogProps> = ({ isOpen, onClose, onSelectTopic }) => {
  const [customTopic, setCustomTopic] = useState('');
  const predefinedTopics = [{'name': 'nostr', 'value': 'nostr, a decentralized, censorship-resistant messaging protocol'}, {'name': 'bitcoin', 'value': 'bitcoin'}];

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
          {predefinedTopics.map((topic) => (
            <button
              key={topic.name}
              onClick={() => handleSelectTopic(topic.value)}
              className="w-full p-2 bg-[#535bf2] text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
            >
              {topic.name}
            </button>
          ))}
          <form onSubmit={handleCustomTopicSubmit} className="mt-4">
            <input
              type="text"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              placeholder="Enter custom topic"
              className="w-full p-2 border rounded text-black"
            />
            <button
              type="submit"
              className="w-full mt-2 p-2 bg-[#535bf2] text-white rounded hover:bg-[#535bf2]-700 transition duration-200"
            >
              Use Custom Topic
            </button>
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