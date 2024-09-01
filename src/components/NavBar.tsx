import { Outlet, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import * as React from 'react';

interface NavBarProps {
  keyValue: string;
  setKey: (val: string) => void;
}

const NavBar: React.FC<NavBarProps> = (props: NavBarProps) => {
  const [nostrExists, setNostrExists] = useState(false);

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
          <div className="flex">
            <li className="inline-block mr-4 text-center pr-24 text-base">
              <Link to="/">Home</Link>
            </li>
            <li className="inline-block mr-4 text-center pr-24 text-base">
              <Link to="/profile">Profile</Link>
            </li>
            <li className="inline-block mr-4 text-center pr-24 text-base">
              <Link to="/edit-profile">Settings</Link>
            </li>
            <li className="inline-block mr-4 text-center pr-24 text-base">
              <Link to="/generate-key">Keys</Link>
            </li>
            <li className="inline-block mr-4 text-center pr-24 text-base">
              <Link to="/people-to-follow">Follow</Link>
            </li>
          </div>
        </ul>
      </nav>

      <Outlet />
    </div>
  );
};

export default NavBar;