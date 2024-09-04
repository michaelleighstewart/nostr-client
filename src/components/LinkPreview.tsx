import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface LinkPreviewProps {
  url: string;
}

const LinkPreview: React.FC<LinkPreviewProps> = ({ url }) => {
  const [preview, setPreview] = useState<{
    title: string;
    description: string;
    image: string;
  } | null>(null);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        const response = await axios.get(`https://api.linkpreview.net/?key=a0324404c04b948e12556c5d70a635f3&q=${encodeURIComponent(url)}`);
        setPreview(response.data);
      } catch (error) {
        console.error('Error fetching link preview:', error);
      }
    };

    fetchPreview();
  }, [url]);

  if (!preview) {
    return null;
  }

  return (
    <div className="border rounded-lg p-4 mt-2 bg-white shadow-sm">
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-start">
        {preview.image && (
          <img src={preview.image} alt={preview.title} className="w-24 h-24 object-cover rounded mr-4" />
        )}
        <div>
          <h3 className="text-lg font-semibold text-blue-600 hover:underline">{preview.title}</h3>
          <p className="text-sm text-gray-600 mt-1">{preview.description}</p>
        </div>
      </a>
    </div>
  );
};

export default LinkPreview;
