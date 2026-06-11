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
        <div>
          Server-side fetch with social-crawler UA &middot; bypasses browser CORS &middot; works against localhost
        </div>
        <div style={{ marginTop: 6 }}>
          Made by <a href="https://mifwar.com/?utm_source=github&utm_medium=oss&utm_campaign=opengraph-viewer" target="_blank" rel="noopener noreferrer">mifwar</a>
        </div>
      </footer>
    </div>
  );
}
