import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="content" style={{ maxWidth: 560, margin: '80px auto' }}>
      <div className="card">
        <div className="card-body">
          <h1 style={{ marginBottom: 8 }}>We couldn&apos;t find that</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            The record may have been archived, or it belongs to another workspace.
          </p>
          <Link className="btn btn-primary" href="/dashboard">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
