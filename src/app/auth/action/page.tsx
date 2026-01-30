'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { applyActionCode, checkActionCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '@/lib/firebase';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, Eye, EyeOff, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';

const ActionHandlerPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [mode, setMode] = React.useState<string | null>(null);
  const [actionCode, setActionCode] = React.useState<string | null>(null);
  const [newPassword, setNewPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [pageMessage, setPageMessage] = React.useState<string | null>(null);
  const [isSuccessPage, setIsSuccessPage] = React.useState(false);


  React.useEffect(() => {
    const modeParam = searchParams.get('mode');
    const oobCodeParam = searchParams.get('oobCode');

    if (!modeParam || !oobCodeParam) {
      setError("Geçersiz veya eksik işlem parametreleri. Lütfen e-postanızdaki linki tekrar deneyin.");
      setLoading(false);
      return;
    }

    setMode(modeParam);
    setActionCode(oobCodeParam);

    const handleAction = async () => {
      try {
        await checkActionCode(auth, oobCodeParam);
        
        switch (modeParam) {
          case 'resetPassword':
            setPageMessage("Şifre sıfırlama kodunuz doğrulandı. Lütfen yeni şifrenizi oluşturun.");
            break;
          case 'recoverEmail':
             setPageMessage("E-posta kurtarma işlemi için destek yakında eklenecektir.");
            break;
          case 'verifyEmail':
            await applyActionCode(auth, oobCodeParam);
            setIsSuccessPage(true);
            setPageMessage("E-posta adresiniz başarıyla doğrulandı! Artık giriş yapabilirsiniz.");
            toast({ title: "Başarılı!", description: "E-posta adresiniz doğrulandı." });
            break;
          default:
            setError("Desteklenmeyen işlem türü.");
        }
      } catch (err: any) {
        let friendlyMessage = "İşlem gerçekleştirilirken bir hata oluştu.";
        if (err.code === 'auth/expired-action-code') {
          friendlyMessage = "Bu linkin süresi dolmuş. Lütfen yeni bir şifre sıfırlama talebinde bulunun veya yeni bir doğrulama maili isteyin.";
        } else if (err.code === 'auth/invalid-action-code') {
          friendlyMessage = "Bu link geçersiz. Daha önce kullanılmış olabilir veya hatalı olabilir.";
        } else if (err.code === 'auth/user-disabled') {
            friendlyMessage = "Bu hesap devre dışı bırakılmış.";
        } else if (err.code === 'auth/user-not-found') {
            friendlyMessage = "Bu eylemin ilişkili olduğu kullanıcı bulunamadı. Silinmiş olabilir.";
        }
        setError(friendlyMessage);
      } finally {
        setLoading(false);
      }
    };

    handleAction();
  }, [searchParams, toast]);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!actionCode) return;

    setLoading(true);
    setError(null);

    try {
      await confirmPasswordReset(auth, actionCode, newPassword);
      toast({
        title: "Şifre Başarıyla Değiştirildi!",
        description: "Başarı sayfasına yönlendiriliyorsunuz...",
      });
      // Redirect to a dedicated success page
      setTimeout(() => {
        router.push('/auth/reset-success');
      }, 2000);
    } catch (err: any) {
      let friendlyMessage = "Şifre sıfırlanırken bir hata oluştu.";
       if (err.code === 'auth/weak-password') {
        friendlyMessage = "Şifreniz çok zayıf. Lütfen en az 6 karakterli daha güçlü bir şifre seçin.";
       } else if (err.code === 'auth/expired-action-code') {
          friendlyMessage = "Bu linkin süresi dolmuş. Lütfen yeni bir şifre sıfırlama talebinde bulunun.";
       }
      setError(friendlyMessage);
      setLoading(false);
      toast({
        variant: "destructive",
        title: "Hata",
        description: friendlyMessage,
      });
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-6">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">İşlem doğrulanıyor, lütfen bekleyin...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center p-6">
          <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <p className="text-destructive mb-4">{error}</p>
          <Button asChild>
            <Link href="/login">Giriş Sayfasına Dön</Link>
          </Button>
        </div>
      );
    }
    
    if (isSuccessPage) {
         return (
           <div className="text-center p-6">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              {pageMessage && <p className="text-foreground mb-4">{pageMessage}</p>}
              <Button asChild>
                <Link href="/login">Giriş Sayfasına Dön</Link>
              </Button>
            </div>
        );
    }

    if (mode === 'resetPassword') {
      return (
        <form onSubmit={handleResetPassword} className="space-y-6">
          {pageMessage && <p className="text-sm text-muted-foreground">{pageMessage}</p>}
          <div className="space-y-2">
            <Label htmlFor="new-password" className="flex items-center text-foreground">
              <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" /> Yeni Şifre
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute inset-y-0 right-0 flex items-center justify-center h-full px-3 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaydediliyor...</> : 'Yeni Şifreyi Kaydet'}
          </Button>
        </form>
      );
    }

    // Fallback for other modes like 'recoverEmail' which we don't fully implement yet
    return (
       <div className="text-center p-6">
          {pageMessage && <p className="text-foreground mb-4">{pageMessage}</p>}
           <Button asChild>
            <Link href="/login">Giriş Sayfasına Dön</Link>
          </Button>
        </div>
    );
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-150px)] p-4">
      <Card className="w-full max-w-md shadow-2xl border-border">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">Hesap İşlemi</CardTitle>
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
};

export default ActionHandlerPage;
