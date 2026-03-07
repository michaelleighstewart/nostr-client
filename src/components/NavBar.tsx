import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import * as React from 'react';
import { HomeIcon, UserIcon, CogIcon, KeyIcon, UserGroupIcon, MagnifyingGlassIcon, ArrowRightOnRectangleIcon, 
  WrenchIcon, BellIcon, EnvelopeIcon, ShareIcon } from '@heroicons/react/24/outline';
import { validatePrivateKey, bech32Decoder } from '../utils/helperFunctions';
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
  const [isPoolReady, setIsPoolReady] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);

  useEffect(() => {
    const isValid = validatePrivateKey(keyValue);
    setIsValidKey(isValid);

    if (isValid) {
      try {
        const skDecoded = bech32Decoder('nsec', keyValue);
        const pubKey = getPublicKey(skDecoded);
        setPublicKey(pubKey);
      } catch (error) {
        console.error("Error generating public key:", error);
      }
    }
  }, [keyValue]);

  useEffect(() => {
    if (pool) {
      Promise.all(RELAYS.map(relay => pool.ensureRelay(relay)))
        .then(() => setIsPoolReady(true))
        .catch((err) => console.error("Error connecting to relays:", err));
    }
  }, [pool]);

  useEffect(() => {
    if (pool && publicKey && isPoolReady) {
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
  }, [pool, isPoolReady, publicKey]);

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const isDisabled = !nostrExists && !keyValue;
  const isHomePage = location.pathname === '/';

  const handleLogout = () => {
    localStorage.removeItem('privateKey');
    localStorage.removeItem(`lastViewedMessage_${publicKey}`);
    setKey('');
    setPublicKey('');
  };

  const navItems = [
    { path: '/', icon: HomeIcon, label: 'Home', alwaysEnabled: true },
    { path: '/profile', icon: UserIcon, label: 'Profile' },
    { path: '/search', icon: MagnifyingGlassIcon, label: 'Search' },
    { path: '/notifications', icon: BellIcon, label: 'Alerts', badge: newNotifications },
    { path: '/messages', icon: EnvelopeIcon, label: 'Messages', badge: newMessages },
  ];

  const secondaryNavItems = [
    { path: '/byo-algorithm', icon: WrenchIcon, label: 'Algorithm' },
    { path: '/social-graph', icon: ShareIcon, label: 'Graph' },
    { path: '/people-to-follow', icon: UserGroupIcon, label: 'Discover' },
    { path: '/edit-profile', icon: CogIcon, label: 'Settings' },
    { path: '/generate-key', icon: KeyIcon, label: 'Keys', alwaysEnabled: true },
  ];

  const NavLink = ({ item }: { item: typeof navItems[0] }) => {
    const enabled = item.alwaysEnabled || !isDisabled;
    const active = isActive(item.path);
    return (
      <Link
        to={item.path}
        className={`
          relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap flex-shrink-0
          ${active ? 'text-violet-400 bg-violet-500/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}
          ${!enabled ? 'pointer-events-none opacity-40' : ''}
        `}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        <span className="hidden lg:inline">{item.label}</span>
        {'badge' in item && item.badge && (
          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop nav - top bar */}
      <nav className="hidden md:block sticky top-0 z-40 backdrop-blur-md bg-[var(--color-bg-primary)]/80 border-b border-[var(--color-border)]">
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-center h-14 gap-1">
            {navItems.map(item => (
              <NavLink key={item.path} item={item} />
            ))}
            <div className="w-px h-6 bg-gray-700 mx-1 flex-shrink-0" />
            {secondaryNavItems.map(item => (
              <NavLink key={item.path} item={item} />
            ))}
            {isLoggedIn && (
              <>
                <div className="w-px h-6 bg-gray-700 mx-1 flex-shrink-0" />
                <button
                  onClick={handleLogout}
                  className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 whitespace-nowrap flex-shrink-0"
                  title="Sign out"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                  <span className="hidden lg:inline">Sign out</span>
                </button>
              </>
            )}
            {!isLoggedIn && !nostrExists && (
              showKeyInput ? (
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                  <input 
                    value={keyValue}
                    type="password" 
                    className="input-field w-40 lg:w-56 text-xs"
                    placeholder="nsec..."
                    onChange={(e) => setKey(e.target.value)} 
                  />
                  <button
                    onClick={() => setShowKeyInput(false)}
                    className="btn-ghost p-2 text-gray-400 text-xs whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowKeyInput(true)}
                  className="btn-primary text-sm py-1.5 px-3 flex-shrink-0 ml-auto"
                >
                  Sign in
                </button>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Mobile nav - bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-bg-primary)]/95 backdrop-blur-md border-t border-[var(--color-border)] safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1">
          {navItems.map(item => {
            const active = isActive(item.path);
            const enabled = item.alwaysEnabled || !isDisabled;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`
                  relative flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-lg text-xs transition-colors
                  ${active ? 'text-violet-400' : 'text-gray-500'}
                  ${!enabled ? 'pointer-events-none opacity-40' : ''}
                `}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
                {'badge' in item && item.badge && (
                  <span className="absolute top-0.5 right-0 h-2 w-2 bg-red-500 rounded-full" />
                )}
              </Link>
            );
          })}
          <button
            onClick={() => setShowKeyInput(prev => !prev)}
            className={`flex flex-col items-center gap-0.5 py-1.5 px-2 text-xs ${showKeyInput ? 'text-violet-400' : 'text-gray-500'}`}
          >
            {isValidKey ? (
              <>
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
                <span>More</span>
              </>
            ) : (
              <>
                <KeyIcon className="h-5 w-5" />
                <span>Sign in</span>
              </>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile key input overlay */}
      {showKeyInput && (
        <div className="md:hidden fixed bottom-16 left-0 right-0 z-30 p-4 bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)]">
          {isValidKey ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                {secondaryNavItems.map(item => {
                  const enabled = item.alwaysEnabled || !isDisabled;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setShowKeyInput(false)}
                      className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg text-xs transition-colors
                        ${isActive(item.path) ? 'text-violet-400 bg-violet-500/10' : 'text-gray-400 hover:bg-white/5'}
                        ${!enabled ? 'pointer-events-none opacity-40' : ''}
                      `}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={() => { handleLogout(); setShowKeyInput(false); }}
                className="flex items-center justify-center gap-2 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input 
                value={keyValue}
                type="password" 
                className="input-field text-sm"
                placeholder={nostrExists ? "Key detected" : "Enter your nsec key..."}
                disabled={!!nostrExists}
                onChange={(e) => setKey(e.target.value)} 
              />
              <div className="flex gap-2">
                <Link to="/generate-key" className="btn-secondary text-center flex-1 text-sm" onClick={() => setShowKeyInput(false)}>
                  Create Key
                </Link>
                <button onClick={() => setShowKeyInput(false)} className="btn-ghost px-4 text-sm text-gray-400">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!isLoggedIn && isHomePage && (
        <Ostrich
          show={!isLoggedIn && isHomePage}
          onClose={() => {}}
          text="Nostr is the future of communication on the internet!"
          linkText="Sign up or sign in now"
          linkUrl="/generate-key"
        />
      )}
    </>
  );
};

export default NavBar;
