import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import your pages
import HomePage from './pages/HomePage';
import SnapshotsPage from './pages/SnapshotPage';

// Import your global providers and UI components
import { ThemeProvider } from './contexts/theme-context';
import { Toaster } from './components/ui/toaster';

export const App = () => {
  return (
    <ThemeProvider>
      {/* BrowserRouter works perfectly inside the Devvit webview to swap out pages */}
      <BrowserRouter basename="/game.html">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/snapshots" element={<SnapshotsPage />} />
        </Routes>
      </BrowserRouter>
      
      {/* Global toast notifications provider */}
      <Toaster />
    </ThemeProvider>
  );
};

// Mount the React app to the DOM
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);