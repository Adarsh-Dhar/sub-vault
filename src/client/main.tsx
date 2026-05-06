import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SettingsPage from './pages/SettingsPage';
import SnapshotsPage from './pages/SnapshotPage';
import HomePage from './pages/HomePage';

function App() {
  return (
    <BrowserRouter basename="/game.html">
      <Routes>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/snapshots" element={<SnapshotsPage />} />
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;