import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

interface OstrichProps {
  show: boolean;
  onClose: () => void;
  text: string;
  linkText?: string;
  linkUrl?: string;
}

const Ostrich: React.FC<OstrichProps> = ({ show, onClose, text, linkText, linkUrl }) => {
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: show ? 0 : "100%" }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50"
      onClick={onClose}
    >
      <div className="relative">
        <img src="/ostrich.png" alt="Ostrich" className="ostrich max-w-full max-h-full" />
        <div className="absolute top-0 left-full ml-4 p-32 bg-white rounded-lg shadow-lg speech-bubble" style={{ width: '400px' }}>
          <p className="text-black">
            {text}{' '}
            {linkText && linkUrl && (
              <Link to={linkUrl} className="text-blue-500 hover:underline">
                {linkText}
              </Link>
            )}
          </p>
        </div>
      </div>
      <style>{`
        .speech-bubble::before {
          content: '';
          position: absolute;
          left: -20px;
          top: 50%;
          transform: translateY(-50%);
          border-width: 10px;
          border-style: solid;
          border-color: transparent white transparent transparent;
        }
        .ostrich {
          max-width: 100%;
          max-height: 100%;
        }
        @media (max-width: 768px) {
          .ostrich {
            display: none;
          }
          .speech-bubble {
            position: static;
            width: 90% !important;
            margin: 0 auto;
          }
          .speech-bubble::before {
            display: none;
          }
        }
      `}</style>
    </motion.div>
  );
};

export default Ostrich;