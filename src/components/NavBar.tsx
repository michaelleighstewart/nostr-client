import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import * as React from 'react';
import { HomeIcon, UserIcon, CogIcon, KeyIcon, UserGroupIcon, MagnifyingGlassIcon, ArrowRightOnRectangleIcon, 
  WrenchIcon, BellIcon, EnvelopeIcon, ShareIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
import { validatePrivateKey } from '../utils/helperFunctions';
import { getPublicKey, SimplePool } from 'nostr-tools';
import Ostrich from "./Ostrich";
import { RELAYS } from "../utils/constants";

interface NavBarProps {
  keyValue: string;
  setKey: (val: string) => void;
  nostrExists: boolean | null;
  pool: SimplePool | null;
  isLoggedIn: boolean;
}

const NavBar: React.FC<NavBarProps> = ({ keyValue, setKey, nostrExists, pool, isLoggedIn }) => {
  const [isValidKey, setIsValidKey] = useState<boolean>(false);
  const [publicKey, setPublicKey] = useState<string>('');
  const location = useLocation();
  const [newNotifications, setNewNotifications] = useState<boolean>(false);
  const [newMessages, setNewMessages] = useState<boolean>(false);

  useEffect(() => {
    const isValid = validatePrivateKey(keyValue);
    setIsValidKey(isValid);

    if (isValid) {
      try {
        const pubKey = getPublicKey(new TextEncoder().encode(keyValue));
        setPublicKey(pubKey);
      } catch (error) {
        console.error("Error generating public key:", error);
      }
    }
  }, [keyValue]);

  useEffect(() => {
    if (pool && publicKey) {
      const notificationSub = pool.subscribeMany(RELAYS, [
        {
          kinds: [1, 7],
          '#p': [publicKey],
          since: Math.floor(Date.now() / 1000) - 24 * 60 * 60
        }
      ],
      {
        onevent() {
          setNewNotifications(true);
        },
        oneose() {
          notificationSub.close();
        }
      });

      const lastViewedMessageTimestamp = localStorage.getItem(`lastViewedMessage_${publicKey}`);
      const since = lastViewedMessageTimestamp 
        ? parseInt(lastViewedMessageTimestamp)
        : Math.floor(Date.now() / 1000) - 24 * 60 * 60;

      const messageSub = pool.subscribeMany(RELAYS, [
        {
          kinds: [4],
          '#p': [publicKey],
          since
        }
      ],
      {
        onevent(event) {
          if (event.created_at > since) {
            setNewMessages(true);
          }
        },
        oneose() {
          messageSub.close();
        }
      });

      return () => {
        notificationSub.close();
        messageSub.close();
      };
    }
  }, [pool, publicKey]);

  const isActive = (path: string) => {
    return location.pathname === path ? "text-white" : "";
  };

  const isDisabled = !nostrExists && !keyValue;
  const isHomePage = location.pathname === '/';

  const handleLogout = () => {
    localStorage.removeItem('privateKey');
    localStorage.removeItem(`lastViewedMessage_${publicKey}`);
    setKey('');
    setPublicKey('');
  };

  return (
    <nav className="w-full max-w-4xl mx-auto">
      <ul className="flex flex-col items-center">
        <li className="w-full px-4">
          <div className="flex items-center">
            <div className="flex-grow mr-2">
              <label htmlFor="private_key" 
                className="block mb-2 text-sm font-medium text-white">Private Key: </label>
              <input 
                value={keyValue}
                type="password" 
                id="private_key" 
                className="text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                placeholder={nostrExists ? "Key detected" : "nsec..."}
                disabled={nostrExists || isValidKey}
                onChange={(e) => setKey(e.target.value)} 
              />
            </div>
            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center pt-[30px]">
              {isValidKey && (
                <button
                  onClick={handleLogout}
                  className="text-[#535bf2] bg-transparent hover:text-white hover:bg-transparent"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </li>
          <div className="flex flex-wrap justify-center py-6">
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/" className={`flex flex-col items-center ${isActive("/")}`}>
                <HomeIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/profile" className={`flex flex-col items-center ${isActive("/profile")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <UserIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/byo-algorithm" className={`flex flex-col items-center ${isActive("/byo-algorithm")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <WrenchIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/social-graph" className={`flex flex-col items-center ${isActive("/social-graph")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <ShareIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/podcasts" className={`flex flex-col items-center ${isActive("/podcasts")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <MicrophoneIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/notifications" className={`flex flex-col items-center ${isActive("/notifications")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <div className="relative">
                  <BellIcon className="h-6 w-6 my-3" />
                  {newNotifications && (
                    <div className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></div>
                  )}
                </div>
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/messages" className={`flex flex-col items-center ${isActive("/messages")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <div className="relative">
                  <EnvelopeIcon className="h-6 w-6 my-3" />
                  {newMessages && (
                    <div className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></div>
                  )}
                </div>
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/edit-profile" className={`flex flex-col items-center ${isActive("/edit-profile")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <CogIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/generate-key" className={`flex flex-col items-center ${isActive("/generate-key")}`}>
                <KeyIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/people-to-follow" className={`flex flex-col items-center ${isActive("/people-to-follow")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <UserGroupIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-2 text-center pr-2 mb-2">
              <Link to="/search" className={`flex flex-col items-center ${isActive("/search")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <MagnifyingGlassIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
          </div>
        </ul>
        {!isLoggedIn && isHomePage && (
        <Ostrich
          show={!isLoggedIn && isHomePage}
          onClose={() => {}}
          text="Nostr is the future of communication on the internet!"
          linkText="Sign up or sign in now"
          linkUrl="/generate-key"
        />
      )}
    </nav>
  );
};

export default NavBar;
