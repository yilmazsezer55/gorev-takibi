
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Mail, KeyRound, UserPlus, User as UserIcon, Users, Eye, EyeOff } from 'lucide-react';
import { GENDER_OPTIONS, type Gender, type UserProfile } from '@/types'; 
import { useAuth } from '@/contexts/auth-context'; 

const SignupPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  
  const handleSignup = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!firstName || !lastName || !gender) {
      setError("Lütfen tüm alanları doldurun (Ad, Soyad, Cinsiyet).");
      toast({ variant: 'destructive', title: 'Kayıt Hatası', description: "Lütfen tüm alanları doldurun (Ad, Soyad, Cinsiyet)." });
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      toast({ variant: 'destructive', title: 'Kayıt Hatası', description: "Şifreler eşleşmiyor." });
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: `${firstName} ${lastName}`,
      });

      const userProfileData: Omit<UserProfile, 'createdAt' | 'updatedAt'> & { createdAt: any, updatedAt: any } = { 
        uid: user.uid,
        email: user.email,
        firstName,
        lastName,
        gender,
        role: 'user', // Default role for new users
        status: 'active', // Default status for new users
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', user.uid), userProfileData);

      toast({ title: 'Kayıt Başarılı!', description: 'Giriş sayfasına yönlendiriliyorsunuz...' });
      router.push('/login');
    } catch (err: any) {
      setError(err.message);
      toast({ variant: 'destructive', title: 'Kayıt Hatası', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background to-muted p-4" dir="ltr">
      <Card className="w-full max-w-lg shadow-2xl border-border">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-headline text-primary">Hesap Oluştur</CardTitle>
          <CardDescription className="text-muted-foreground">Yeni bir hesap oluşturarak başlayın.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="flex items-center text-foreground">
                  <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" /> Ad
                </Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="Adınız"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="flex items-center text-foreground">
                  <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" /> Soyad
                </Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Soyadınız"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-signup" className="flex items-center text-foreground">
                <Mail className="mr-2 h-4 w-4 text-muted-foreground" /> E-posta
              </Label>
              <Input
                id="email-signup"
                type="email"
                placeholder="ornek@eposta.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary"
              />
            </div>
             <div className="space-y-2">
              <Label htmlFor="gender" className="flex items-center text-foreground">
                <Users className="mr-2 h-4 w-4 text-muted-foreground" /> Cinsiyet
              </Label>
              <Select value={gender} onValueChange={(value) => setGender(value as Gender)} required>
                <SelectTrigger id="gender" className="w-full bg-card text-foreground border-input focus:border-primary">
                  <SelectValue placeholder="Cinsiyetinizi seçin" />
                </SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password-signup" className="flex items-center text-foreground">
                <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" /> Şifre
              </Label>
              <div className="relative">
                <Input
                  id="password-signup"
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
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="flex items-center text-foreground">
                <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" /> Şifreyi Onayla
              </Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary pr-10"
                />
                 <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute inset-y-0 right-0 flex items-center justify-center h-full px-3 text-muted-foreground hover:text-foreground"
                  onClick={toggleConfirmPasswordVisibility}
                  aria-label={showConfirmPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={loading}>
              {loading ? 'Kayıt Olunuyor...' : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" /> Kayıt Ol
                </>
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center text-sm pt-6">
          <p className="text-muted-foreground">
            Zaten bir hesabınız var mı?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Giriş Yap
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SignupPage;

    