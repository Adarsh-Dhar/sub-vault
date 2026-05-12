import { BrowserRouter, Routes, Route } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage';
import QuizPage from './pages/QuizPage';
import { ThemeProvider } from './contexts/theme-context';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/game.html">
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/quiz" element={<QuizPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;