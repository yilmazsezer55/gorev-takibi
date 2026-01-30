'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// This page now simply redirects to the main dashboard.
export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="text-muted-foreground">Yönlendiriliyorsunuz...</p>
      </div>
    </div>
  );
}
