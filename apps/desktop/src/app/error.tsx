'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  // Raw database and network errors never reach the screen — they are logged
  // server-side and the person sees something they can act on.
  return (
    <div className="content" style={{ maxWidth: 560, margin: '80px auto' }}>
      <div className="card">
        <div className="card-body">
          <h1 style={{ marginBottom: 8 }}>That didn&apos;t load</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            Something went wrong fetching this page. Try again, and if it keeps happening,
            check that the workspace database is running.
          </p>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
        </div>
      </div>
    </div>
  );
}
