import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vector Racer',
  description: 'A classroom vector racing game for physics instruction.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark" />
              <span>Vector Racer</span>
            </Link>
            <nav className="row">
              <Link className="button secondary" href="/instructor">
                Instructor
              </Link>
            </nav>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
