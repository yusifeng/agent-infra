import { Navigate, matchPath, useLocation } from 'react-router-dom';

import { DurableChatConsole } from '@/features/durable-chat/durable-chat-console';
import { ReplayConsole } from '@/features/durable-chat/replay-console';
import { SharedSnapshotConsole } from '@/features/durable-chat/shared-snapshot-console';

function resolvePathParam(pathname: string, pattern: '/chat/:threadId' | '/replay/:threadId' | '/share/:publicId', key: 'threadId' | 'publicId') {
  const match = matchPath(pattern, pathname);
  const rawValue = match?.params[key];
  if (!rawValue) {
    return null;
  }

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return null;
  }
}

function App() {
  const location = useLocation();
  const chatMatch = matchPath('/chat/:threadId', location.pathname);
  const replayMatch = matchPath('/replay/:threadId', location.pathname);
  const shareMatch = matchPath('/share/:publicId', location.pathname);

  if (location.pathname === '/') {
    return <Navigate replace to="/new" />;
  }

  if (location.pathname !== '/new' && !chatMatch && !replayMatch && !shareMatch) {
    return <Navigate replace to="/new" />;
  }

  if (shareMatch) {
    return <SharedSnapshotConsole initialPublicId={resolvePathParam(location.pathname, '/share/:publicId', 'publicId')} />;
  }

  if (replayMatch) {
    return <ReplayConsole initialThreadId={resolvePathParam(location.pathname, '/replay/:threadId', 'threadId')} />;
  }

  return <DurableChatConsole initialThreadId={resolvePathParam(location.pathname, '/chat/:threadId', 'threadId')} />;
}

export default App;
