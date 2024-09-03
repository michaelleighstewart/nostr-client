import { Outlet, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import * as React from 'react';
import { HomeIcon, UserIcon, CogIcon, KeyIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface NavBarProps {
  keyValue: string;
  setKey: (val: string) => void;
}

const NavBar: React.FC<NavBarProps> = (props: NavBarProps) => {
  const [nostrExists, setNostrExists] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkNostrAvailability = () => {
      if ((window as any).nostr) {
        setNostrExists(true);
        clearInterval(nostrCheckInterval);
      }
    };

    const nostrCheckInterval = setInterval(checkNostrAvailability, 100);

    return () => {
      clearInterval(nostrCheckInterval);
    };
  }, [props.keyValue]);

  const isActive = (path: string) => {
    return location.pathname === path ? "text-white" : "";
  };

  const isDisabled = !nostrExists && !props.keyValue;

  return (
    <div className="sticky top-0 w-full h-200">
      <nav>
        <ul>
          <li>
            <div>
              <label htmlFor="private_key" 
                className="block mb-2 text-sm font-medium text-white">Private Key: </label>
              <input 
                value={props.keyValue}
                type="password" 
                id="private_key" 
                className={nostrExists ? "text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 disabled" : "text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"} 
                placeholder={nostrExists ? "Key detected" : "nsec..."}
                disabled={nostrExists}
                onChange={(e) => props.setKey(e.target.value)} 
              />
            </div>
          </li>
          <div className="flex justify-center py-6">
            <li className="inline-block mx-4 text-center pr-16">
              <Link to="/" className={`flex flex-col items-center ${isActive("/")}`}>
                <HomeIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-16">
              <Link to="/profile" className={`flex flex-col items-center ${isActive("/profile")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <UserIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-16">
              <Link to="/edit-profile" className={`flex flex-col items-center ${isActive("/edit-profile")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <CogIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-16">
              <Link to="/generate-key" className={`flex flex-col items-center ${isActive("/generate-key")}`}>
                <KeyIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-16">
              <Link to="/people-to-follow" className={`flex flex-col items-center ${isActive("/people-to-follow")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <UserGroupIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
            <li className="inline-block mx-4 text-center pr-16">
              <Link to="/search" className={`flex flex-col items-center ${isActive("/search")} ${isDisabled ? "pointer-events-none opacity-50" : ""}`}>
                <MagnifyingGlassIcon className="h-6 w-6 my-3" />
              </Link>
            </li>
          </div>
        </ul>
      </nav>

      <Outlet />
    </div>
  );
};

export default NavBar;