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
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50"
      onClick={onClose}
    >
      <div className="relative flex items-center gap-6 max-w-2xl mx-4" onClick={e => e.stopPropagation()}>
        <img 
          src="/ostrich.png" 
          alt="Ostrich" 
          className="hidden md:block max-w-[200px] max-h-[300px] object-contain flex-shrink-0" 
        />
        <div className="relative card p-6 shadow-glow">
          <div className="hidden md:block absolute -left-3 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 bg-[var(--color-bg-card)] border-l border-b border-[var(--color-border)]" />
          <p className="text-sm text-gray-200 leading-relaxed">
            {text}{' '}
            {linkText && linkUrl && (
              <Link to={linkUrl} className="text-violet-400 hover:text-violet-300 hover:underline font-medium">
                {linkText}
              </Link>
            )}
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default Ostrich;
