import './App.css';
import Layout from "./components/Layout";

import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import EditProfile from "./components/EditProfile"
import NavBar from "./components/NavBar";
import { useState } from "react";

function App() {
  const [key, setKey] = useState('');

  return (
    <div className="h-full">
      <Router>
          <NavBar keyValue={key} setKey={setKey}></NavBar>
              <Routes>
                <Route path="/" element={<Layout />}></Route>
                <Route index element={<Home keyValue={key} />}></Route>
                <Route path="edit-profile" element={<EditProfile />} />
              </Routes>
      </Router>
    </div>
  )
}

export default App;
