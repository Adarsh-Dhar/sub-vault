import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import pages
import WelcomePage from './pages/WelcomePage';
import QuizPage from './pages/QuizPage';

// Import global providers and UI components
import { InitProvider } from './contexts/init-context';
import { ThemeProvider } from './contexts/theme-context';
import { Toaster } from './components/ui/toaster';

export const App = () => {
  return (
    <InitProvider>
      <ThemeProvider>
        {/* BrowserRouter works perfectly inside the Devvit webview to swap out pages */}
        <BrowserRouter basename="/game.html">
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/quiz" element={<QuizPage />} />
          </Routes>
        </BrowserRouter>

        {/* Global toast notifications provider */}
        <Toaster />
      </ThemeProvider>
    </InitProvider>
  );
};

// Mount the React app to the DOM
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);