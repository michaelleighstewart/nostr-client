import './App.css';
import Layout from "./components/Layout";
import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import Home from "./components/Home";
import EditProfile from "./components/EditProfile";
import Profile from "./components/Profile";
import GenerateKey from "./components/GenerateKey";
import PeopleToFollow from "./components/PeopleToFollow";
import Followers from "./components/Followers";
import Following from "./components/Following";
import Notifications from "./components/Notifications";
import Messages from "./components/Messages";
import Conversation from "./components/Conversation";
import Note from "./components/Note";
import Search from "./components/Search";
import NavBar from "./components/NavBar";
import BYOAlgorithm from "./components/BYOAlgorithm";
import SocialGraph from './components/SocialGraph';
import { getPublicKey, SimplePool } from "nostr-tools";
import { useState, useEffect, useMemo, useCallback } from "react";

import { RELAYS } from "./utils/constants";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Loading from './components/Loading';
import { bech32Decoder, validatePrivateKey } from './utils/helperFunctions';
import { API_URLS } from './utils/apiConstants';
import PodcastRequests from './components/PodcastRequests';
//import DefaultHelmet from "./components/DefaultHelmet";

function App() {
  const pool = useMemo(() => new SimplePool(), []);
  const [key, setKey] = useState('');
  const [nostrExists, setNostrExists] = useState<boolean | null>(null);

  const getNostrPublicKey = useCallback(async () => {
    try {
      return await (window as any).nostr.getPublicKey();
    } catch (error) {
      return "";
    }
  }, []);

  const handleSetKey = useCallback(async (value: string) => {
    const isValid = validatePrivateKey(value);
    if (isValid) {
      localStorage.setItem('privateKey', value);
      // Get npub from the private key
      let pubkey = ''
      if (nostrExists) {
        pubkey = await (window as any).nostr.getPublicKey();
      } else {
        const skDecoded = bech32Decoder('nsec', value);
        pubkey = getPublicKey(skDecoded);;
      }
      // Call the batch-processor endpoint
      fetch(`${API_URLS.API_URL}batch-processor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: "trending_topics_processor",
          params: {
            npub: pubkey
          }
        }),
      }).catch(error => console.error('Error calling batch-processor:', error));
    }
    setKey(value);
  }, []);

  useEffect(() => {
    const checkNostrAvailability = () => {
      if ((window as any).nostr) {
        setNostrExists(true);
        clearInterval(nostrCheckInterval);
      }
      else {
        setNostrExists(false);
      }
    };

    const nostrCheckInterval = setInterval(checkNostrAvailability, 100);

    return () => {
      clearInterval(nostrCheckInterval);
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      const storedPrivateKey = localStorage.getItem('privateKey');
      if (storedPrivateKey) {
        setKey(storedPrivateKey);
      }
      else {
        if (nostrExists) {
          const pk = await getNostrPublicKey();
          setKey(pk);
        }
      }
    };

    //const _pool = new SimplePool();
    //setPool(_pool);
    initialize();
    return () => {
      if (pool) {
        pool.close(RELAYS);
      }
    };
  }, [nostrExists]);

  const isLoggedIn = useMemo(() => nostrExists || !!key, [nostrExists, key]);

  function AppContent() {
    const location = useLocation();
    const isHomePage = location.pathname === '/';

    if (!pool) return (<Loading vCentered={false}></Loading>)
    if (nostrExists === null) return (<Loading vCentered={false}></Loading>)

      return (
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-hidden overflow-y-hidden">
          <div className={`relative ${!isLoggedIn && isHomePage ? 'z-50' : ''}`}>
            <NavBar keyValue={key} setKey={handleSetKey} nostrExists={nostrExists} pool={pool} isLoggedIn={isLoggedIn} />
          </div>
          <div className={`${!isLoggedIn ? 'pointer-events-none' : ''}`}>
            <Routes>
              <Route path="/" element={<Layout />}></Route>
              <Route index element={<Home keyValue={key} pool={pool} nostrExists={nostrExists} />}></Route>
              <Route path="edit-profile" element={<EditProfile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="profile/:npub" element={<Profile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="profile" element={<Profile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="profile/:npub/following" element={<Following pool={pool} />} />
              <Route path="notifications" element={<Notifications keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="social-graph" element={<SocialGraph keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="/podcasts" element={<PodcastRequests keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="messages" element={<Messages keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="generate-key" element={<GenerateKey isLoggedIn={isLoggedIn} setKeyValue={handleSetKey} keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="people-to-follow" element={<PeopleToFollow keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="profile/:npub/followers" element={<Followers keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              <Route path="profile/:npub/following" element={<Following pool={pool} />} />
              <Route path="conversation/:id" element={<Conversation pool={pool} nostrExists={nostrExists} keyValue={key} />} />
              <Route path="note/:id" element={<Note pool={pool} nostrExists={nostrExists} keyValue={key} />} />
              <Route path="search" element={<Search pool={pool} nostrExists={nostrExists} keyValue={key} />} />
              <Route path="byo-algorithm" element={<BYOAlgorithm keyValue={key} pool={pool} nostrExists={nostrExists} />} />
            </Routes>
          </div>
        </div>
      );
    }

  return (
    <div className="h-full overflow-y-hidden">
      <Router>
        <AppContent />
      </Router>
      <ToastContainer 
        position="bottom-right"
        autoClose={3000}
        hideProgressBar
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  )
}

export default App;