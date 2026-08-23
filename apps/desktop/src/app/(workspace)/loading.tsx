export default function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <div className="skeleton" style={{ height: 30, width: 260 }} />
      <div className="grid grid-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card stat">
            <div className="skeleton" style={{ width: 90 }} />
            <div className="skeleton" style={{ height: 30, width: 60, marginTop: 12 }} />
          </div>
        ))}
      </div>
      <div className="card"><div className="card-body stack">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" />)}
      </div></div>
    </div>
  );
}
