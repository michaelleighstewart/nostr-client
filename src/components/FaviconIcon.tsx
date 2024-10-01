import React from 'react';

interface FaviconIconProps {
  className?: string;
  onClick?: () => void;
}

const FaviconIcon: React.FC<FaviconIconProps> = ({ className, onClick }) => {
  return (
    <img
      src="/favicon.ico"
      alt="Favicon"
      className={`w-6 h-6 cursor-pointer ${className || ''}`}
      onClick={onClick}
    />
  );
};

export default FaviconIcon;