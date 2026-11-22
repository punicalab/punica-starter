import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
// Every element of the library. An application that cares about its size
// imports the ones it uses: '@punica/components/components/button/button.js'
import '@punica/components';
import '@punica/components/tokens.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
