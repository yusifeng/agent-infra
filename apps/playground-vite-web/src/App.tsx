import { Navigate, matchPath, useLocation } from 'react-router-dom';

import { DurableChatConsole } from '@/features/durable-chat/durable-chat-console';
import { ReplayConsole } from '@/features/durable-chat/replay-console';

function resolveThreadId(pathname: string, pattern: '/chat/:threadId' | '/replay/:threadId') {
  const match = matchPath(pattern, pathname);
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
  const chatMatch = matchPath('/chat/:threadId', location.pathname);
  const replayMatch = matchPath('/replay/:threadId', location.pathname);

  if (location.pathname === '/') {
    return <Navigate replace to="/new" />;
  }

  if (location.pathname !== '/new' && !chatMatch && !replayMatch) {
    return <Navigate replace to="/new" />;
  }

  if (replayMatch) {
    return <ReplayConsole initialThreadId={resolveThreadId(location.pathname, '/replay/:threadId')} />;
  }

  return <DurableChatConsole initialThreadId={resolveThreadId(location.pathname, '/chat/:threadId')} />;
}

export default App;
