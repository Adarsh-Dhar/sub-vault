import './index.css';
import { requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen } from 'lucide-react';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-6 bg-background px-4">
      
      {/* App Icon / Logo */}
      <div className="flex items-center justify-center w-24 h-24 bg-primary text-primary-foreground rounded-2xl shadow-xl mb-2">
        <BookOpen className="w-12 h-12" />
      </div>

      {/* App Title & Description */}
      <div className="flex flex-col items-center gap-3">
        <h1 className="text-4xl font-extrabold text-foreground tracking-tight text-center">
          Community Quiz
        </h1>
        <p className="text-base text-center text-muted-foreground max-w-70">
          Test your knowledge of our community guidelines and join the conversation.
        </p>
      </div>

      {/* Launch Button */}
      <div className="flex items-center justify-center mt-6 w-full max-w-62.5">
        {/* 
          This button opens the quiz in expanded mode 
        */}
        <button
          className="flex items-center justify-center w-full h-12 text-base font-semibold rounded-full bg-primary text-primary-foreground shadow-md transition-transform active:scale-95 hover:bg-primary/90"
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Start Quiz
        </button>
      </div>
      
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);