export default function NotFound() {
  return (
    <div className="rounded-2xl border border-border bg-card p-8">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-mute">
        That route does not exist in the paper classroom. Try Dashboard, Markets, Coach, Journal, or
        Settings.
      </p>
    </div>
  );
}
