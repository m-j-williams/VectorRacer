import type { Metadata } from 'next';
import { SolarSystemLive } from '@/components/SolarSystemLive';

export const metadata: Metadata = {
  title: 'Solar System Now | Classroom Tools',
  description: 'A live view of the Sun, Moon, Earth, and naked-eye planets.'
};

export default function SolarSystemPage() {
  return <SolarSystemLive />;
}
