export function PlaceholderPage({ title, embedded }: { title: string; embedded?: boolean }) {
  if (embedded) {
    return (
      <div className="empty-state">
        <p className="empty-title">{title} is not built yet</p>
      </div>
    );
  }
  return (
    <section className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">Not built yet.</p>
        </div>
      </div>
    </section>
  );
}
