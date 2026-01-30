'use client';

import { useAuth } from '@/contexts/auth-context';
import { auth, db } from '@/lib/firebase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { LogOut, Settings, ChevronDown, User as UserIcon, Users, Monitor, Sun, Moon, TestTube2, User, Briefcase } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from 'next-themes';
import type { Timestamp } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import type { UserLastSeen, GlobalSettings, UiStrings, UserProfile } from '@/types';
import { useEffect, useState, useMemo } from 'react';
import { DEFAULT_UI_STRINGS } from '@/contexts/auth-context';


const AppHeader = () => {
  const { currentUser, userProfile, handleLogout, globalSettings } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const resolvedUiStrings = useMemo(() => {
    return { ...DEFAULT_UI_STRINGS, ...(globalSettings?.uiStrings || {}) };
  }, [globalSettings]);

  const isOnline = useMemo(() => {
    if (!userProfile || !userProfile.lastSeen) return false;
    const lastSeen = (userProfile.lastSeen as Timestamp).toDate();
    const now = new Date();
    // Consider online if last seen within the last 2 minutes
    return (now.getTime() - lastSeen.getTime()) < 2 * 60 * 1000;
  }, [userProfile]);


  const doLogout = async () => {
    try {
      await handleLogout();
      toast({ title: 'Çıkış Başarılı', description: 'Giriş sayfasına yönlendiriliyorsunuz.' });
      router.push('/login');
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Çıkış Hatası', description: error.message });
    }
  };

  const getInitials = () => {
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName[0]}${userProfile.lastName[0]}`.toUpperCase();
    }
    if (userProfile?.firstName) {
      return userProfile.firstName[0].toUpperCase();
    }
    if (currentUser?.email) {
      return currentUser.email[0].toUpperCase();
    }
    return <UserIcon className="h-5 w-5" />;
  };

  const getPageTitle = () => {
    if (pathname === '/dashboard') {
      return resolvedUiStrings?.header_title || 'Görevlerim';
    }
    if (pathname.startsWith('/dashboard/team')) {
      return 'Takım Görevleri';
    }
     if (pathname.startsWith('/test-case')) {
      return 'Test Senaryosu Detayları';
    }
    if (pathname.startsWith('/settings')) {
      return 'Ayarlar';
    }
    return resolvedUiStrings?.layout_title || 'Görev Yönetici'; 
  };
  
  const navLinks = [
    { href: '/dashboard', label: resolvedUiStrings.header_title, icon: UserIcon },
    (userProfile?.role === 'admin' || userProfile?.canViewTeamTasks) && { href: '/dashboard/team', label: 'Takım Görevleri', icon: Users },
    { href: '/settings', label: 'Profil Ayarları', icon: Settings },
  ].filter(Boolean) as { href: string; label: string; icon: React.ElementType }[];

  return (
    <header className="bg-card text-card-foreground shadow-md sticky top-0 z-50 px-4 sm:px-6 lg:px-8 py-4 print:hidden" dir="ltr">
      <div className="flex w-full justify-between items-center">
        <div className="text-xl font-headline text-primary">
          {getPageTitle()}
        </div>
        {currentUser && (
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 p-1 h-auto rounded-full focus-visible:ring-1 focus-visible:ring-ring">
                  <div className="relative">
                    <Avatar className="h-8 w-8 border border-border">
                       <AvatarImage src={userProfile?.photoURL || undefined} alt="Profil Resmi" />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs flex items-center justify-center">
                        {getInitials()}
                      </AvatarFallback>
                    </Avatar>
                     <div className={cn(
                        "absolute bottom-0 right-0 block h-2 w-2 rounded-full ring-2 ring-card",
                        isOnline ? "bg-green-500" : "bg-gray-400"
                     )} />
                  </div>
                  <span className="text-sm font-medium text-foreground hidden md:inline">
                    {userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : currentUser.email}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {userProfile ? `${userProfile.firstName} ${userProfile.lastName}` : 'Kullanıcı'}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {currentUser.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {navLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild className={cn(pathname === link.href && "bg-accent")}>
                    <Link href={link.href} className="flex items-center cursor-pointer">
                      <link.icon className="mr-2 h-4 w-4" />
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 mr-2" />
                        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 mr-2" />
                        <span>Temayı Değiştir</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={() => setTheme('light')}>
                            <Sun className="mr-2 h-4 w-4" />
                            Aydınlık
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('dark')}>
                            <Moon className="mr-2 h-4 w-4" />
                            Karanlık
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setTheme('system')}>
                            <Monitor className="mr-2 h-4 w-4" />
                            Sistem
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doLogout} className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Çıkış Yap
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
};

export default AppHeader;
