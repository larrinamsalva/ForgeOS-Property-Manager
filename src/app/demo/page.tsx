import type { Metadata } from 'next';
import { GuestDemo } from '@/components/guest-demo';
import './demo.css';
import './planner.css';

export const metadata: Metadata = {
  title: 'Try ForgeOS · Free Guest Demo',
  description: 'Explore a fictional RV park in ForgeOS without signing up or sharing an email address.',
};

export default function DemoPage() {
  return <GuestDemo />;
}
