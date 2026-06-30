import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Classroom Tools',
  description: 'Interactive tools for active classrooms.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="topbar">
            <Link className="brand" href="/">
              <span className="brand-mark" />
              <span>Classroom Tools</span>
            </Link>
            <nav className="row">
              <Link className="nav-link" href="/">
                All tools
              </Link>
              <Link className="nav-link" href="/tools/vector-racer">
                Vector Racer
              </Link>
              <Link className="nav-link" href="/tools/dot-calendar">
                Dot Calendar
              </Link>
            </nav>
          </header>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
