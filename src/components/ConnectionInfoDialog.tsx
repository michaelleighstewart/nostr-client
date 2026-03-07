import React from 'react';
import { UserCircleIcon, ArrowRightIcon } from '@heroicons/react/24/solid';
import { LinkIcon } from '@heroicons/react/24/solid';

interface ConnectionInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    name: string;
    picture: string;
    about: string;
  };
  connectionInfo: {
    degree: number;
    connectedThrough?: {
      name: string;
      picture: string;
    };
  } | null;
}

const ConnectionInfoDialog: React.FC<ConnectionInfoDialogProps> = ({ isOpen, onClose, user, connectionInfo }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-center">
          <LinkIcon className="mx-auto h-10 w-10 text-violet-500 mb-4" />
          
          <div className="flex items-center justify-center gap-3 mb-4">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full object-cover ring-1 ring-white/10" />
            ) : (
              <UserCircleIcon className="w-12 h-12 text-gray-500" />
            )}
            <div className="text-left">
              <p className="text-sm font-semibold text-white">{user.name}</p>
              {user.about && <p className="text-xs text-gray-400 line-clamp-2">{user.about}</p>}
            </div>
          </div>

          {connectionInfo && (
            <div className="text-left bg-[var(--color-bg-input)] rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-300 mb-2">
                {connectionInfo.degree === 1
                  ? "You are directly connected to this user."
                  : `This user is a ${connectionInfo.degree}${connectionInfo.degree === 2 ? 'nd' : 'rd'} degree connection.`}
              </p>
              {connectionInfo.connectedThrough && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-gray-500">via</span>
                  {connectionInfo.connectedThrough.picture ? (
                    <img 
                      src={connectionInfo.connectedThrough.picture} 
                      alt={connectionInfo.connectedThrough.name} 
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <UserCircleIcon className="w-6 h-6 text-gray-500" />
                  )}
                  <span className="text-xs font-medium text-white">{connectionInfo.connectedThrough.name}</span>
                  <ArrowRightIcon className="w-3 h-3 text-gray-500" />
                  {user.picture && (
                    <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full object-cover" />
                  )}
                  <span className="text-xs font-medium text-white">{user.name}</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={onClose}
            className="btn-primary w-full text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConnectionInfoDialog;
