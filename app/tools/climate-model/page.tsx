import type { Metadata } from 'next';
import { ClimateModel } from '@/components/ClimateModel';

export const metadata: Metadata = {
  title: 'Earth Energy Balance | Classroom Tools',
  description: 'An interactive one-dimensional climate and greenhouse-effect model.'
};

export default function ClimateModelPage() {
  return <ClimateModel />;
}
