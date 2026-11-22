import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
// Every element of the library. An application that cares about its size
// imports the ones it uses: '@punica/components/components/button/button.js'
import '@punica/components';
import '@punica/components/tokens.css';
import './styles.css';
import { queryClient } from './api/queries';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
