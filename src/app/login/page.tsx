import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main style={{ maxWidth: 360, margin: "64px auto" }}>
      <div className="card card-pad">
        <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>UGC Tracker</h1>
        <p className="muted" style={{ marginTop: 0 }}>Enter the team password to continue.</p>
        <LoginForm next={next ?? "/"} />
      </div>
    </main>
  );
}
