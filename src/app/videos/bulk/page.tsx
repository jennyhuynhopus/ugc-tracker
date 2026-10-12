import { BulkStatsForm } from "@/components/BulkStatsForm";

export default function BulkStatsPage() {
  return (
    <main style={{ maxWidth: 860 }}>
      <div className="page-head">
        <div>
          <h1>Log stats in bulk</h1>
          <p>Update many videos at once, matched by URL. Each row adds a snapshot, just like an automatic poll.</p>
        </div>
      </div>
      <BulkStatsForm />
    </main>
  );
}
