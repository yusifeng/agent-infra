import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { installChatRenderDiagnostics } from '@agent-infra/durable-chat-client';

import App from './App.tsx';
import { installApiDiagnostics } from './dev/install-api-diagnostics.ts';
import './index.css';

installApiDiagnostics();
installChatRenderDiagnostics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
