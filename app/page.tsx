import OgViewer from "./components/OgViewer";

export default function Page() {
  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>OpenGraph Viewer</h1>
          <div className="subtitle">Paste any URL — local or public — to inspect its OG/Twitter metadata.</div>
        </div>
      </header>
      <OgViewer />
      <footer className="foot">
        Server-side fetch with social-crawler UA &middot; bypasses browser CORS &middot; works against localhost
      </footer>
    </div>
  );
}
