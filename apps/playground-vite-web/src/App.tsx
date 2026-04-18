import { Navigate, matchPath, useLocation } from 'react-router-dom';

import { DurableChatConsole } from '@/features/durable-chat/durable-chat-console';

function resolveThreadId(pathname: string) {
  const match = matchPath('/chat/:threadId', pathname);
  if (!match?.params.threadId) {
    return null;
  }

  try {
    return decodeURIComponent(match.params.threadId);
  } catch {
    return null;
  }
}

function App() {
  const location = useLocation();

  if (location.pathname === '/') {
    return <Navigate replace to="/new" />;
  }

  if (location.pathname !== '/new' && !matchPath('/chat/:threadId', location.pathname)) {
    return <Navigate replace to="/new" />;
  }

  return <DurableChatConsole initialThreadId={resolveThreadId(location.pathname)} />;
}

export default App;
