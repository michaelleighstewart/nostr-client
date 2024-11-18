import React from 'react';

interface AudioEmbedProps {
  url: string;
}

const AudioEmbed: React.FC<AudioEmbedProps> = ({ url }) => {
  return (
    <div className="mt-2">
      <audio controls className="w-full">
        <source src={url} type="audio/mpeg" />
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioEmbed;
