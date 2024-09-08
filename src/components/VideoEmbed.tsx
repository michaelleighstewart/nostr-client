import React from 'react';

interface VideoEmbedProps {
  url: string;
}

const VideoEmbed: React.FC<VideoEmbedProps> = ({ url }) => {
  return (
    <div className="video-embed">
      <video
        controls
        width="100%"
        height="auto"
        className="rounded-lg shadow-lg"
      >
        <source src={url} type="video/mp4" />
        <source src={url} type="video/avi" />
        <source src={url} type="video/quicktime" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default VideoEmbed;
