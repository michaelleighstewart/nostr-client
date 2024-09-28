import React from 'react';
import { UserCircleIcon, ArrowRightIcon } from '@heroicons/react/24/solid';

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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-gray-800">
        <div className="mt-3 text-center">
          <div className="mt-2 px-7 py-3">
            <div className="flex items-center justify-center mb-4">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="w-64 h-64 rounded-full mr-4" />
              ) : (
                <UserCircleIcon className="w-16 h-16 text-gray-400 mr-4" />
              )}
              <div className="text-left">
                <p className="text-lg font-medium text-white">{user.name}</p>
                <p className="text-sm text-gray-400">{user.about}</p>
              </div>
            </div>
            {connectionInfo && (
              <div className="mt-4 text-left">
                <p className="text-sm text-gray-300">
                  {connectionInfo.degree === 1
                    ? "You are directly connected to this user."
                    : `This user is a ${connectionInfo.degree}${connectionInfo.degree === 2 ? 'nd' : 'rd'} degree connection.`}
                </p>
                {connectionInfo.connectedThrough && (
                  <div className="flex items-center mt-2">
                    <p className="text-sm text-gray-300 mr-2 font-bold">Connected through:</p>
                    <div className="flex items-center">
                      {connectionInfo.connectedThrough.picture ? (
                        <img 
                          src={connectionInfo.connectedThrough.picture} 
                          alt={connectionInfo.connectedThrough.name} 
                          className="w-32 h-32 rounded-full mr-2"
                        />
                      ) : (
                        <UserCircleIcon className="w-16 h-16 text-gray-400 mr-2" />
                      )}
                      <p className="text-sm font-medium text-white">{connectionInfo.connectedThrough.name}</p>
                    </div>
                    <ArrowRightIcon className="w-32 h-32 text-gray-400 mx-2 pl-16" />
                    {user.picture && (
                        <img 
                        src={user.picture} 
                        alt={user.name} 
                        className="w-32 h-32 rounded-full mr-2"
                      />
                    )
                    }
                    <p className="text-sm font-medium text-white">{user.name}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="items-center px-4 py-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#535bf2] text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-[#4347d9] focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConnectionInfoDialog;