import './App.css';
import Layout from "./components/Layout";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import EditProfile from "./components/EditProfile"
import NavBar from "./components/NavBar";
import { SimplePool } from "nostr-tools";
import { useState, useEffect } from "react";
import { RELAYS } from "./utils/constants";

function App() {
  const [pool, setPool] = useState<SimplePool | null>(null);
  const [key, setKey] = useState('');
  const [nostrExists, setNostrExists] = useState(false);

  useEffect(() => {
    setNostrExists(window.nostr ? true : false);
    const _pool = new SimplePool();
    setPool(_pool);

    return () => {
      _pool.close(RELAYS);
    }
  }, []);

  return (
    <div className="h-full">
      <Router>
          <NavBar keyValue={key} setKey={setKey}></NavBar>
              <Routes>
                <Route path="/" element={<Layout />}></Route>
                <Route index element={<Home keyValue={key} pool={pool} nostrExists={nostrExists} />}></Route>
                <Route path="edit-profile" element={<EditProfile keyValue={key} pool={pool} nostrExists={nostrExists} />} />
              </Routes>
      </Router>
    </div>
  )
}

export default App;
