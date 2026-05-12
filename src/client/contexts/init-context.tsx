import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { InitResponse } from '../../shared/api';

type InitContextValue = {
  init: InitResponse | null;
  loading: boolean;
  error: string | null;
};

const InitContext = createContext<InitContextValue | undefined>(undefined);

export function InitProvider({ children }: { children: ReactNode }) {
  const [init, setInit] = useState<InitResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadInit = async () => {
      try {
        const response = await fetch('/api/init');

        if (!response.ok) {
          throw new Error('Failed to initialize app');
        }

        const data = (await response.json()) as InitResponse;

        if (!isActive) {
          return;
        }

        setInit(data);
        setError(null);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setInit(null);
        setError(loadError instanceof Error ? loadError.message : 'Failed to initialize app');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadInit();

    return () => {
      isActive = false;
    };
  }, []);

  return <InitContext.Provider value={{ init, loading, error }}>{children}</InitContext.Provider>;
}

export function useInit() {
  const context = useContext(InitContext);

  if (!context) {
    throw new Error('useInit must be used within an InitProvider');
  }

  return context;
}