import { useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { HubPage } from './pages/HubPage';
import { FeedPage } from './pages/FeedPage';
import { ProfilePage } from './pages/ProfilePage';
import { LevelUpOverlay } from './components/LevelUpOverlay';
import { ThemeProvider } from './contexts/theme-context';
import type { RankLevel } from '../shared/rank-types';

function AppContent() {
  const navigate = useNavigate();
  const [levelUpData, setLevelUpData] = useState<{ level: RankLevel; badge: string } | null>(null);

  const handleNavigate = (page: string) => {
    void navigate(`/${page}`);
  };

  const handleLevelUp = (newLevel: RankLevel) => {
    const LEVEL_BADGES: Record<RankLevel, string> = {
      0: '🔒',
      1: '✅',
      2: '🥈',
      3: '🥇',
      4: '💎',
    };

    setLevelUpData({
      level: newLevel,
      badge: LEVEL_BADGES[newLevel],
    });
  };

  return (
    <>
      {levelUpData && (
        <LevelUpOverlay
          level={levelUpData.level}
          onClose={() => setLevelUpData(null)}
        />
      )}
      <Routes>
        <Route path="/" element={<HubPage onNavigate={handleNavigate} onLevelUp={handleLevelUp} />} />
        <Route path="/feed" element={<FeedPage onNavigate={handleNavigate} />} />
        <Route path="/profile" element={<ProfilePage onNavigate={handleNavigate} />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/game.html">
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;