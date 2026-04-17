import { Button } from '@/components/ui/button';

function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-20">
        <div className="max-w-2xl space-y-6">
          <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            playground-vite-web
          </span>
          <h1 className="text-5xl font-semibold tracking-tight text-slate-950">
            Vite consumer scaffold
          </h1>
          <p className="text-lg leading-8 text-slate-600">
            This app will validate the browser-side durable chat experience outside Next.js.
          </p>
          <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-slate-900">Planned stack</p>
            <ul className="space-y-2 text-sm leading-6 text-slate-600">
              <li>React + Vite + TypeScript</li>
              <li>Tailwind CSS + shadcn/ui</li>
              <li>`@agent-infra/durable-chat-client` as the headless runtime layer</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button>Vite consumer ready</Button>
            <Button variant="outline">Fastify proxy on /api</Button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
