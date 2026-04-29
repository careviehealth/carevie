'use client';

import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';

export default function ConditionalNavbar() {
  const pathname = usePathname();

  // Hide navbar on share pages (unauthenticated QR scan view)
  if (pathname.startsWith('/app/share')) return null;

  return <Navbar />;
}