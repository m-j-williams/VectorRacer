import type { Metadata } from 'next';
import { DotCalendar } from '@/components/DotCalendar';

export const metadata: Metadata = {
  title: 'Dot Calendar | Classroom Tools',
  description: 'Turn any date range into a simple, seven-day-wide field of dots.'
};

export default function DotCalendarPage() {
  return <DotCalendar />;
}
