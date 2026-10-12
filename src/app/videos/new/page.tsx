import Link from "next/link";
import { AddVideoForm } from "@/components/AddVideoForm";
import { listCreators } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function NewVideoPage() {
  const creators = await listCreators();
  return (
    <main style={{ maxWidth: 640 }}>
      <div className="page-head">
        <div>
          <h1>Add video</h1>
          <p>Start at any stage. Once it's posted, we poll its stats automatically.</p>
        </div>
      </div>
      <div className="card card-pad">
        {creators.length === 0 ? (
          <div className="empty">
            <h3>Add a creator first</h3>
            <p>
              Videos belong to a creator.{" "}
              <Link className="link" href="/creators">
                Add a creator
              </Link>
            </p>
          </div>
        ) : (
          <AddVideoForm creators={creators.map((c) => ({ id: c.id, name: c.name, rateUsd: c.rateUsd }))} />
        )}
      </div>
    </main>
  );
}
