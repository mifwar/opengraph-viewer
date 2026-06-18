import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metadata Inspector",
  description: "Inspect Open Graph, JSON-LD, and Rich Results metadata for any URL — including localhost",
};

const themeBootstrap = `(function(){try{var s=localStorage.getItem('ogv-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var t=s||(m?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
