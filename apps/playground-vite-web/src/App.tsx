import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { DurableChatConsole } from '@/features/durable-chat/durable-chat-console';

function ChatRoutePage({ initialThreadId }: { initialThreadId: string | null }) {
  return <DurableChatConsole initialThreadId={initialThreadId} />;
}

function ChatThreadRoutePage() {
  const params = useParams<{ threadId: string }>();
  let threadId: string | null = null;

  if (params.threadId) {
    try {
      threadId = decodeURIComponent(params.threadId);
    } catch {
      threadId = null;
    }
  }

  return <ChatRoutePage initialThreadId={threadId} />;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate replace to="/new" />} />
      <Route path="/new" element={<ChatRoutePage initialThreadId={null} />} />
      <Route path="/chat/:threadId" element={<ChatThreadRoutePage />} />
    </Routes>
  );
}

export default App;
