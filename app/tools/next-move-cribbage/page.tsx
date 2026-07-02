import type { Metadata } from 'next';
import CribbageClient from '@/components/CribbageClient';

export const metadata: Metadata = {
  title: 'Next Move — Cribbage',
  description: 'A new cribbage discard decision every day.'
};

export const dynamic = 'force-dynamic';

export default function CribbagePage() {
  const now = new Date();
  const dailyKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const displayDate = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric'
  }).format(now);

  return <CribbageClient dailyKey={dailyKey} displayDate={displayDate} />;
}
