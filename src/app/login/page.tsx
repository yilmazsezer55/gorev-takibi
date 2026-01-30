
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Mail, KeyRound, LogIn, Eye, EyeOff, AlertTriangle, Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: 'Giriş Başarılı!', description: 'Yönlendiriliyorsunuz...' });
      router.push('/');
    } catch (err: any) {
      let friendlyMessage = "Giriş yapılamadı. Olası nedenler: E-posta/şifre hatası veya sistem limitlerinin aşılması. Sorun devam ederse lütfen yönetici ile iletişime geçin.";
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        friendlyMessage = "E-posta veya şifre hatalı. Lütfen bilgilerinizi kontrol edin.";
      }
      setError(friendlyMessage);
      toast({ variant: 'destructive', title: 'Giriş Hatası', description: friendlyMessage });
    } finally {
      setLoading(false);
    }
  };
  
  const handlePasswordReset = async () => {
      if (!email) {
          toast({
              variant: 'destructive',
              title: 'E-posta Eksik',
              description: 'Şifre sıfırlama linki göndermek için lütfen e-posta adresinizi girin.'
          });
          return;
      }
      setLoading(true);
      
      try {
          await sendPasswordResetEmail(auth, email);
          toast({
              title: 'Sıfırlama Linki Gönderildi',
              description: 'Lütfen şifrenizi sıfırlamak için e-posta kutunuzu kontrol edin.'
          });
      } catch (err: any) {
          console.error("Password Reset Error:", err);
          let friendlyMessage = "Şifre sıfırlama linki gönderilirken bir hata oluştu.";
           if (err.code === 'auth/user-not-found') {
              friendlyMessage = "Bu e-posta adresine kayıtlı bir kullanıcı bulunamadı.";
           } else if (err.code === 'auth/invalid-email') {
              friendlyMessage = "Lütfen geçerli bir e-posta adresi girin.";
           }
          setError(friendlyMessage);
          toast({ variant: 'destructive', title: 'Hata', description: friendlyMessage });
      } finally {
          setLoading(false);
      }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted p-4" dir="ltr">
      <Card className="w-full max-w-xl shadow-2xl border-border">
        <CardHeader className="text-left">
          <CardTitle className="text-3xl font-headline text-primary">Giriş Yap</CardTitle>
          <CardDescription className="text-muted-foreground">Hesabınıza erişmek için giriş yapın.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center text-foreground">
                <Mail className="mr-2 h-4 w-4 text-muted-foreground" /> E-posta
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="ornek@eposta.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="flex items-center text-foreground">
                    <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" /> Şifre
                </Label>
                 <Button type="button" variant="link" className="text-xs h-auto p-0 text-primary" onClick={handlePasswordReset} disabled={loading}>
                    Şifremi Unuttum
                </Button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute inset-y-0 right-0 flex items-center justify-center h-full px-3 text-muted-foreground hover:text-foreground"
                  onClick={togglePasswordVisibility}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={(checked) => setRememberMe(Boolean(checked))} />
                <Label htmlFor="remember-me" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Beni Hatırla (Oturumu açık tut)
                </Label>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Giriş Yapılıyor...</> : (
                <>
                  <LogIn className="mr-2 h-4 w-4" /> Giriş Yap
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm pt-6">
           <p className="text-muted-foreground">
            Hesabınız yok mu?{' '}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Kayıt Ol
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;
