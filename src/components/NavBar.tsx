import { Outlet, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import * as React from 'react';
import { HomeIcon, UserIcon, CogIcon, KeyIcon, UserGroupIcon, MagnifyingGlassIcon, ArrowRightOnRectangleIcon, BellIcon } from '@heroicons/react/24/outline';
import { validatePrivateKey } from '../utils/helperFunctions';
import { getPublicKey } from 'nostr-tools';
import Ostrich from "./Ostrich";

interface NavBarProps {
  keyValue: string;
  setKey: (val: string) => void;
  nostrExists: boolean | null;
}

const NavBar: React.FC<NavBarProps> = (props: NavBarProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(true);
  const [isValidKey, setIsValidKey] = useState<boolean>(false);
  const [publicKey, setPublicKey] = useState<string>('');
  const location = useLocation();

  useEffect(() => {
    const storedPrivateKey = localStorage.getItem('privateKey');
    if (storedPrivateKey) {
      props.setKey(storedPrivateKey);
    }
  }, []);

  useEffect(() => {
    if (props.nostrExists !== null) {
      setIsLoggedIn(props.nostrExists || !!props.keyValue);
    }
    else {
      if (props.nostrExists === false) {
        setIsLoggedIn(props.keyValue !== "");
      }
    }

    // Check if the key is valid
    const isValid = validatePrivateKey(props.keyValue);
    setIsValidKey(isValid);

    // If valid, save to local storage and generate public key
    if (isValid) {
      localStorage.setItem('privateKey', props.keyValue);
      try {
        const pubKey = getPublicKey(Buffer.from(props.keyValue, 'hex'));
        setPublicKey(pubKey);
      } catch {
      }
    }
  }, [props.nostrExists, props.keyValue]);

  const isActive = (path: string) => {
    return location.pathname === path ? "text-white" : "";
  };

  const isDisabled = !props.nostrExists && !props.keyValue;
  const isHomePage = location.pathname === '/';

  const handleLogout = () => {
    localStorage.removeItem('privateKey');
    props.setKey('');
    setPublicKey('');
  };

  return (
    <div className="inset-0 flex flex-col items-center">
      <nav className="w-full max-w-4xl">
        <ul className="flex flex-col items-center">
          <li className="w-full px-4">
            <div className="flex items-center">
              <div className="flex-grow mr-2">
                <label htmlFor="private_key" 
                  className="block mb-2 text-sm font-medium text-white">Private Key: </label>
                <input 
                  value={props.keyValue}
                  type="password" 
                  id="private_key" 
                  className="text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                  placeholder={props.nostrExists ? "Key detected" : "nsec..."}
                  disabled={(props.nostrExists ?? false) || isValidKey}
                  onChange={(e) => props.setKey(e.target.value)} 
                />
              </div>
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center pt-[30px]">
                {isValidKey && (
                  <button
                    onClick={handleLogout}
                    className="text-white"
                  >
                    <ArrowRightOnRectangleIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </li>
          {publicKey && (
            <li className="w-full px-4 mt-2">
              <div className="text-sm text-white">
                Public Key: {publicKey}
              </div>
            </li>
          )}
          <div className="flex justify-center py-6">
            <li className="inline-block mx-4 text-center pr-2">
              <Link to="/" className={`flex flex-col items-center ${isActive("/")}`}>
                <HomeIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-2">
              <Link to="/profile" className={`flex flex-col items-center ${isActive("/profile")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <UserIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-2">
              <Link to="/notifications" className={`flex flex-col items-center ${isActive("/notifications")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <BellIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-2">
              <Link to="/edit-profile" className={`flex flex-col items-center ${isActive("/edit-profile")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <CogIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-2">
              <Link to="/generate-key" className={`flex flex-col items-center ${isActive("/generate-key")}`}>
                <KeyIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-2">
              <Link to="/people-to-follow" className={`flex flex-col items-center ${isActive("/people-to-follow")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <UserGroupIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-2">
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

      <Outlet />
    </div>
  );
};

export default NavBar;