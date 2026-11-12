export function PlaceholderPage({ title }: { title: string }) {
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
