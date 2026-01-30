'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function ResetSuccessPage() {
  const router = useRouter();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/login');
    }, 5000); // 5 saniye sonra yönlendir

    return () => clearTimeout(timer); // component unmount olduğunda timer'ı temizle
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-150px)] p-4">
      <Card className="w-full max-w-md shadow-2xl border-border">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">Başarılı!</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center p-6">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-6" />
            <p className="text-lg text-foreground mb-2">Şifreniz başarıyla değiştirildi.</p>
            <p className="text-sm text-muted-foreground mb-8">
              5 saniye içinde giriş sayfasına yönlendirileceksiniz...
            </p>
            <Button asChild size="lg" className="w-full">
              <Link href="/login">Giriş Sayfasına Dön</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
