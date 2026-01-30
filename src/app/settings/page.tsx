

'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db, auth } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc, collection, getDocs, updateDoc, writeBatch, query, where, Timestamp, deleteDoc, arrayUnion } from 'firebase/firestore';
import { updateProfile as updateAuthProfile, updateEmail, EmailAuthProvider, reauthenticateWithCredential, deleteUser, updatePassword } from 'firebase/auth';
import Link from 'next/link';
import { testJiraConnection } from '@/app/actions/testJiraConnection';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import PurgePreviewModal from '@/components/purge-preview-modal';
import type { Task } from '@/types';


import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { GENDER_OPTIONS, type UserProfile, type Gender, type UserRole, type UserStatus, GlobalSettings } from '@/types';
import { User as UserIcon, Users, Mail, Save, Loader2, ArrowLeft, Link as LinkIconLucide, Landmark, LayoutList, ShieldCheck, KeyRound, FileSpreadsheet, ListTodo, AlertTriangle, CheckCircle, Eye, EyeOff, Languages, Trash2, TestTube2, Image as ImageIcon, Briefcase, EyeIcon } from 'lucide-react';
import AppHeader from '@/components/header';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { Checkbox } from '@/components/ui/checkbox';
import { useTaskStore } from '@/contexts/task-store';


const profileFormSchema = z.object({
  firstName: z.string().min(1, "Ad gereklidir."),
  lastName: z.string().min(1, "Soyad gereklidir."),
  email: z.string().email("Geçerli bir e-posta adresi girin.").min(1, "E-posta gereklidir."),
  gender: z.enum(GENDER_OPTIONS, { required_error: "Cinsiyet seçilmelidir." }),
  photoURL: z.string().url("Geçerli bir URL girin.").optional().or(z.literal('')),
});

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, "Mevcut şifre gereklidir."),
    newPassword: z.string().min(6, "Yeni şifre en az 6 karakter olmalıdır."),
    confirmPassword: z.string().min(6, "Onay şifresi en az 6 karakter olmalıdır."),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Yeni şifreler eşleşmiyor.",
    path: ["confirmPassword"],
});


type ProfileFormData = z.infer<typeof profileFormSchema>;
type PasswordFormData = z.infer<typeof passwordFormSchema>;


const jiraSettingsSchema = z.object({
  jiraJqlQuery: z.string().optional(),
});
type JiraSettingsFormData = z.infer<typeof jiraSettingsSchema>;

const globalSettingsSchema = z.object({
    internalTestCasesEnabled: z.boolean().optional(),
    defaultDashboardDateRange: z.string().optional(),
    jiraCsvSyncEnabled: z.boolean().optional(),
});
type GlobalSettingsFormData = z.infer<typeof globalSettingsSchema>;

type PurgePeriod = '1m' | '2m' | '3m' | '6m' | '1y';

function SettingsPageContent() {
  const { currentUser, userProfile, loading: authLoading, refreshAuthData } = useAuth();
  const { removeTasks } = useTaskStore();
  const router = useRouter();
  const { toast } = useToast();

  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [allUsers, setAllUsers] = React.useState<UserProfile[] | null>(null);
  const [globalSettings, setGlobalSettings] = React.useState<GlobalSettings | null>(null);

  const [isSaving, setIsSaving] = React.useState(false);
  const [isSavingPassword, setIsSavingPassword] = React.useState(false);
  const [isSavingJql, setIsSavingJql] = React.useState(false);
  const [isSavingGlobal, setIsSavingGlobal] = React.useState(false);
  const [adminClickCount, setAdminClickCount] = React.useState(0);
  const [userToDelete, setUserToDelete] = React.useState<UserProfile | null>(null);
  
  const [isCheckingPurge, setIsCheckingPurge] = React.useState(false);
  const [isUserDeleteConfirmOpen, setIsUserDeleteConfirmOpen] = React.useState(false);
  const [purgePeriod, setPurgePeriod] = React.useState<PurgePeriod>('1y');
  
  const [tasksToPurge, setTasksToPurge] = React.useState<Task[]>([]);
  const [isPurgePreviewModalOpen, setIsPurgePreviewModalOpen] = React.useState(false);
  
  const [pathname, setPathname] = React.useState('');

  const { control, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      gender: GENDER_OPTIONS[0],
      photoURL: '',
    },
  });
  
  const { 
      control: passwordControl, 
      handleSubmit: handlePasswordSubmit, 
      reset: resetPasswordForm,
      formState: { errors: passwordErrors }
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    }
  });

  const { 
    control: jiraControl, 
    handleSubmit: handleJiraSubmit, 
    reset: resetJiraForm,
    formState: { errors: jiraErrors } 
  } = useForm<JiraSettingsFormData>({
    resolver: zodResolver(jiraSettingsSchema),
    defaultValues: {
      jiraJqlQuery: 'assignee = currentUser() ORDER BY updated DESC',
    }
  });
  
  const {
    control: globalControl,
    handleSubmit: handleGlobalSubmit,
    reset: resetGlobalForm,
  } = useForm<GlobalSettingsFormData>({
    resolver: zodResolver(globalSettingsSchema),
    defaultValues: {
      internalTestCasesEnabled: false,
      defaultDashboardDateRange: '7',
      jiraCsvSyncEnabled: true,
    },
  });

  const watchedPhotoURL = watch('photoURL');


  React.useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
        if (pathname !== '/login' && pathname !== '/signup') router.push('/login');
        return;
    }

    const fetchData = async () => {
        setIsLoadingData(true);
        try {
            const [usersSnap, settingsSnap] = await Promise.all([
                getDocs(collection(db, 'users')),
                getDoc(doc(db, 'global_settings', 'main')),
            ]);
            
            setAllUsers(usersSnap.docs.map(d => d.data() as UserProfile));
            
            const settingsData = settingsSnap.exists() ? settingsSnap.data() as GlobalSettings : null;
            setGlobalSettings(settingsData);
            
            // Reset forms with fetched data
            reset({
                firstName: userProfile?.firstName || '',
                lastName: userProfile?.lastName || '',
                email: userProfile?.email || currentUser?.email || '',
                gender: userProfile?.gender as Gender || GENDER_OPTIONS[0],
                photoURL: userProfile?.photoURL || '',
            });
            if (settingsData) {
                resetJiraForm({
                    jiraJqlQuery: settingsData.jiraJqlQuery || 'assignee = currentUser() ORDER BY updated DESC',
                });
                resetGlobalForm({
                    internalTestCasesEnabled: settingsData.internalTestCasesEnabled || false,
                    defaultDashboardDateRange: settingsData.defaultDashboardDateRange || '7',
                    jiraCsvSyncEnabled: settingsData.jiraCsvSyncEnabled === undefined ? true : settingsData.jiraCsvSyncEnabled,
                });
            }

        } catch (error) {
            console.error("Error fetching settings page data:", error);
            toast({ variant: 'destructive', title: 'Hata', description: 'Ayarlar sayfası verileri yüklenemedi.' });
        } finally {
            setIsLoadingData(false);
        }
    };
    
    if(currentUser) {
        fetchData();
    }

  }, [currentUser, userProfile, authLoading, router, toast, reset, resetJiraForm, resetGlobalForm, pathname]);


  const onSubmit = async (data: ProfileFormData) => {
    if (!currentUser || !auth.currentUser) {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Kullanıcı bulunamadı.' });
      return;
    }

    setIsSaving(true);
    try {
      if (data.email !== auth.currentUser.email) {
        const currentPassword = prompt("E-posta adresinizi değiştirmek için lütfen mevcut şifrenizi girin:");
        if (currentPassword === null) {
            toast({
                variant: 'default',
                title: 'E-posta Değişikliği İptal Edildi',
                description: 'Mevcut şifre girilmediği için e-posta güncelleme işlemi iptal edildi.'
            });
            setIsSaving(false);
            return;
        } else if (currentPassword === "") {
             toast({
                variant: 'destructive',
                title: 'E-posta Güncelleme Başarısız',
                description: 'Mevcut şifre boş bırakılamaz. E-posta güncelleme işlemi yapılamadı.'
            });
            setIsSaving(false);
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(auth.currentUser.email!, currentPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);
            await updateEmail(auth.currentUser, data.email);
            toast({ title: 'E-posta Güncellendi', description: 'Giriş e-postanız başarıyla güncellendi.' });
        } catch (error: any) {
            console.error('Firebase Auth e-posta güncelleme hatası:', error);
            toast({
                variant: 'destructive',
                title: 'Auth E-posta Güncelleme Hatası',
                description: `Giriş e-postanız güncellenemedi. Şifrenizi kontrol edin veya daha sonra tekrar deneyin. Hata: ${error.code === 'auth/wrong-password' ? 'Mevcut şifreniz yanlış.' : error.message}`
            });
            setIsSaving(false);
            return;
        }
      }

      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      const profileDataToSave: Partial<UserProfile> = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        gender: data.gender as Gender,
        photoURL: data.photoURL,
        updatedAt: serverTimestamp(),
      };
      
      if (!userDocSnap.exists()) {
        profileDataToSave.uid = currentUser.uid;
        profileDataToSave.role = 'user';
        profileDataToSave.status = 'active';
        profileDataToSave.createdAt = serverTimestamp();
      }

      await setDoc(userDocRef, profileDataToSave, { merge: true });

      if (auth.currentUser) {
        await updateAuthProfile(auth.currentUser, {
           displayName: `${data.firstName} ${data.lastName}`,
           photoURL: data.photoURL,
        });
      }

      await refreshAuthData();
      toast({ title: 'Başarılı', description: 'Profiliniz güncellendi.' });
    } catch (error: any) {
      console.error('Profil güncelleme genel hata:', error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Profil güncellenirken bir sorun oluştu: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const onPasswordChangeSubmit = async (data: PasswordFormData) => {
    if (!currentUser || !auth.currentUser?.email) {
      toast({ variant: 'destructive', title: 'Hata', description: 'İşlem için kullanıcı oturumu bulunamadı.' });
      return;
    }
    setIsSavingPassword(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, data.currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, data.newPassword);
      toast({ title: 'Başarılı', description: 'Şifreniz başarıyla güncellendi.' });
      resetPasswordForm();
    } catch (error: any) {
      console.error("Şifre değiştirme hatası:", error);
      let errorMessage = 'Şifre güncellenirken bir hata oluştu.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'Mevcut şifreniz yanlış. Lütfen kontrol edip tekrar deneyin.';
      }
      toast({ variant: 'destructive', title: 'Hata', description: errorMessage });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const onSaveJqlQuery = async (data: JiraSettingsFormData) => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yetkiniz yok.' });
      return;
    }
    setIsSavingJql(true);
    try {
        const globalSettingsDocRef = doc(db, 'global_settings', 'main');
        await setDoc(globalSettingsDocRef, {
            jiraJqlQuery: data.jiraJqlQuery,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        
        await refreshAuthData();
        toast({ title: 'Başarılı', description: 'Jira JQL sorgusu kaydedildi.' });

    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Hata!', description: `JQL sorgusu güncellenirken bir sorun oluştu: ${error.message}` });
    } finally {
        setIsSavingJql(false);
    }
  };
  
  const onSaveGlobalSettings = async (data: GlobalSettingsFormData) => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yetkiniz yok.' });
      return;
    }
    setIsSavingGlobal(true);
    try {
        const globalSettingsDocRef = doc(db, 'global_settings', 'main');
        await setDoc(globalSettingsDocRef, {
            internalTestCasesEnabled: data.internalTestCasesEnabled,
            defaultDashboardDateRange: data.defaultDashboardDateRange,
            jiraCsvSyncEnabled: data.jiraCsvSyncEnabled,
            updatedAt: serverTimestamp(),
        }, { merge: true });
        setGlobalSettings(prev => ({ ...(prev as GlobalSettings), internalTestCasesEnabled: data.internalTestCasesEnabled, defaultDashboardDateRange: data.defaultDashboardDateRange, jiraCsvSyncEnabled: data.jiraCsvSyncEnabled }));
        toast({ title: 'Başarılı', description: 'Genel ayarlar kaydedildi.' });
    } catch (error: any) {
      console.error("Error saving global settings:", error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Genel ayarlar kaydedilirken bir sorun oluştu: ${error.message}` });
    } finally {
      setIsSavingGlobal(false);
    }
  };

  const handleAdminClick = async () => {
    if (userProfile?.role === 'admin') return;

    const newCount = adminClickCount + 1;
    setAdminClickCount(newCount);

    if (newCount >= 10) {
      if (!currentUser) return;
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userDocRef, { role: 'admin' });
        toast({ title: 'Tebrikler!', description: 'Yönetici oldunuz. Sayfa yenileniyor.' });
        await refreshAuthData();
        setAdminClickCount(0);
      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Hata', description: `Yönetici rolü atanırken bir sorun oluştu: ${error.message}` });
      }
    } else if (newCount > 5) {
        toast({
            title: `Yönetici olmaya ${10 - newCount} adım kaldı...`
        });
    }
  };

  const handleUserPropertyChange = async (targetUserId: string, property: keyof UserProfile, value: any) => {
    if (currentUser?.uid === targetUserId && (property === 'role' || property === 'status')) {
        toast({ variant: 'destructive', title: 'Hata', description: 'Kendi rolünüzü veya durumunuzu değiştiremezsiniz.' });
        return;
    }
    try {
        const userDocRef = doc(db, 'users', targetUserId);
        await updateDoc(userDocRef, { [property]: value });
        setAllUsers(prevUsers => prevUsers!.map(u => u.uid === targetUserId ? {...u, [property]: value} : u));
        toast({ title: 'Başarılı', description: `Kullanıcı özelliği güncellendi.` });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Hata', description: `Özellik güncellenirken bir hata oluştu: ${error.message}` });
    }
  };
  
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
        const userDocRef = doc(db, 'users', userToDelete.uid);
        await deleteDoc(userDocRef);
        setAllUsers(prev => prev!.filter(u => u.uid !== userToDelete.uid));
        toast({ title: 'Kullanıcı Silindi', description: `${userToDelete.firstName} ${userToDelete.lastName} kullanıcısının profil verileri silindi. Firebase Auth kaydını silmek için Firebase konsolunu kullanın.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Hata', description: `Kullanıcı silinirken bir hata oluştu: ${error.message}` });
    } finally {
        setUserToDelete(null);
        setIsUserDeleteConfirmOpen(false);
    }
  };

  const createPurgeQuery = (period: PurgePeriod) => {
    const now = new Date();
    let cutoffDate = new Date();
    switch(period) {
        case '1m':
            cutoffDate.setMonth(now.getMonth() - 1);
            break;
        case '2m':
            cutoffDate.setMonth(now.getMonth() - 2);
            break;
        case '3m':
            cutoffDate.setMonth(now.getMonth() - 3);
            break;
        case '6m':
            cutoffDate.setMonth(now.getMonth() - 6);
            break;
        case '1y':
        default:
            cutoffDate.setFullYear(now.getFullYear() - 1);
            break;
    }
    const cutoffTimestamp = Timestamp.fromDate(cutoffDate);
    
    const completedStatus = globalSettings?.statusConfiguration?.find(s => s.id === 'done')?.label || 'TAMAMLANDI';
    const cancelledStatus = globalSettings?.statusConfiguration?.find(s => s.id === 'cancelled')?.label || 'İPTAL EDİLDİ';

    const tasksRef = collection(db, "tasks");
    return query(
        tasksRef, 
        where("status", "in", [completedStatus, cancelledStatus]), 
        where("updatedAt", "<=", cutoffTimestamp)
    );
  };
  
  const handleCheckPurgeableTasks = async () => {
    setIsCheckingPurge(true);
    setTasksToPurge([]);
    try {
        const q = createPurgeQuery(purgePeriod);
        const querySnapshot = await getDocs(q);
        const fetchedTasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        
        setTasksToPurge(fetchedTasks);

        if (fetchedTasks.length === 0) {
            toast({ title: 'İşlem Gerekmiyor', description: 'Seçilen periyotta silinecek kriterlere uyan eski görev bulunamadı.' });
        } else {
             setIsPurgePreviewModalOpen(true);
        }

    } catch (error: any) {
        console.error("Error checking for purgeable tasks:", error);
        toast({ variant: 'destructive', title: 'Hata!', description: `Silinecek görevler kontrol edilirken bir hata oluştu: ${error.message}` });
    } finally {
        setIsCheckingPurge(false);
    }
  };


  const handlePurgeOldTasks = async (tasksToDelete: Task[]) => {
    if (tasksToDelete.length === 0) {
        toast({ title: 'İşlem Gerekmiyor', description: 'Silinecek görev seçilmedi.' });
        setIsPurgePreviewModalOpen(false);
        return;
    }

    try {
      const batch = writeBatch(db);
      const userTaskKeysMap: { [userId: string]: string[] } = {};

      tasksToDelete.forEach((task) => {
        if (task.userIds && Array.isArray(task.userIds)) {
            task.userIds.forEach((userId: string) => {
                if (task.taskKey) {
                    if (!userTaskKeysMap[userId]) {
                        userTaskKeysMap[userId] = [];
                    }
                    userTaskKeysMap[userId].push(task.taskKey);
                }
            });
        }
        batch.delete(doc(db, 'tasks', task.id));
      });

      for (const userId in userTaskKeysMap) {
        if (userTaskKeysMap.hasOwnProperty(userId)) {
          const userDocRef = doc(db, 'users', userId);
          batch.update(userDocRef, {
            deletedTaskKeys: arrayUnion(...userTaskKeysMap[userId])
          });
        }
      }
      
      await batch.commit().catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
              path: 'batch write (purge old tasks)',
              operation: 'write',
          });
          errorEmitter.emit('permission-error', permissionError);
          throw serverError;
      });

      toast({ title: 'Başarılı!', description: `${tasksToDelete.length} adet eski görev başarıyla silindi ve kullanıcı profillerine işlendi.` });
      
      const taskIdsToDelete = tasksToDelete.map(t => t.id);
      await removeTasks(taskIdsToDelete);
      
      setIsPurgePreviewModalOpen(false);
      setTasksToPurge([]);

    } catch (error: any) {
      console.error("Error purging old tasks:", error);
       if (!(error instanceof FirestorePermissionError)) {
            toast({ variant: 'destructive', title: 'Hata!', description: `Eski görevler silinirken bir sorun oluştu: ${error.message}` });
       }
    }
  };


  const getInitials = () => {
    if (userProfile?.firstName && userProfile?.lastName) {
      return `${userProfile.firstName[0]}${userProfile.lastName[0]}`.toUpperCase();
    }
    if (userProfile?.firstName) {
      return userProfile.firstName[0].toUpperCase();
    }
    return <UserIcon className="h-12 w-12" />;
  };

  const sortedUsers = React.useMemo(() => {
    if (!allUsers) return [];
    return [...allUsers].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr'));
  }, [allUsers]);

  if (isLoadingData || authLoading || !currentUser) {
    return (
      <>
        <AppHeader />
        <div className="flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8" dir="ltr">
        <Card className="w-full max-w-6xl mx-auto shadow-xl border-border">
          <CardHeader className="text-left">
            <CardTitle className="text-2xl font-headline text-primary cursor-pointer" onClick={handleAdminClick} title="Yönetici olmak için 10 kez tıklayın">Profil Ayarları</CardTitle>
            <CardDescription className="text-muted-foreground">Kişisel bilgilerinizi ve tercihlerinizi buradan yönetin.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 flex flex-col items-center pt-4">
                        <Avatar className="h-24 w-24 border-2 border-primary/50">
                            <AvatarImage src={watchedPhotoURL || userProfile?.photoURL || undefined} alt="Profil Resmi" />
                            <AvatarFallback className="text-3xl bg-muted">
                               {getInitials()}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                    <div className="md:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                        <Label htmlFor="firstName-settings" className="flex items-center text-foreground text-left">
                            <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" /> Ad
                        </Label>
                        <Controller
                            name="firstName"
                            control={control}
                            render={({ field }) => (
                            <Input id="firstName-settings" placeholder="Adınız" {...field} className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary text-left placeholder:text-left" />
                            )}
                        />
                        {errors.firstName && <p className="text-sm text-destructive text-left">{errors.firstName.message}</p>}
                        </div>
                        <div className="space-y-2">
                        <Label htmlFor="lastName-settings" className="flex items-center text-foreground text-left">
                            <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" /> Soyad
                        </Label>
                        <Controller
                            name="lastName"
                            control={control}
                            render={({ field }) => (
                            <Input id="lastName-settings" placeholder="Soyadınız" {...field} className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary text-left placeholder:text-left" />
                            )}
                        />
                        {errors.lastName && <p className="text-sm text-destructive text-left">{errors.lastName.message}</p>}
                        </div>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="gender-settings" className="flex items-center text-foreground text-left">
                        <Users className="mr-2 h-4 w-4 text-muted-foreground" /> Cinsiyet
                        </Label>
                        <Controller
                        name="gender"
                        control={control}
                        render={({ field }) => (
                            <Select onValueChange={field.onChange} value={field.value as string} >
                            <SelectTrigger id="gender-settings" className="w-full bg-card text-foreground border-input focus:border-primary">
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
                        )}
                        />
                        {errors.gender && <p className="text-sm text-destructive text-left">{errors.gender.message}</p>}
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="photoURL-settings" className="flex items-center text-foreground text-left">
                            <ImageIcon className="mr-2 h-4 w-4 text-muted-foreground" /> Profil Resmi URL'si
                        </Label>
                        <Controller
                            name="photoURL"
                            control={control}
                            render={({ field }) => (
                                <Input id="photoURL-settings" placeholder="https://example.com/resim.jpg" {...field} value={field.value || ''} className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary text-left placeholder:text-left" />
                            )}
                        />
                        {errors.photoURL && <p className="text-sm text-destructive text-left">{errors.photoURL.message}</p>}
                    </div>
                    </div>
                </div>

              <div className="space-y-2">
                <Label htmlFor="email-settings" className="flex items-center text-foreground text-left">
                  <Mail className="mr-2 h-4 w-4 text-muted-foreground" /> E-posta
                </Label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="email-settings"
                      type="email"
                      placeholder="ornek@eposta.com"
                      {...field}
                      className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary text-left placeholder:text-left"
                    />
                  )}
                />
                {errors.email && <p className="text-sm text-destructive text-left">{errors.email.message}</p>}
                 <p className="text-xs text-muted-foreground pt-1 text-left">Not: E-posta değişikliği, giriş kimlik bilgilerinizi (Firebase Authentication) güncellemeyi dener. Bu işlem için mevcut şifreniz istenecektir.</p>
              </div>

              <div className="flex flex-col sm:flex-row-reverse gap-2 pt-4 justify-end">
                <Button type="submit" className="sm:flex-initial bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Kaydediliyor...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" /> Değişiklikleri Kaydet
                    </>
                  )}
                </Button>
              </div>
            </form>

            <Separator className="my-8" />
             
            <form onSubmit={handlePasswordSubmit(onPasswordChangeSubmit)} className="space-y-6">
                <h3 className="text-xl font-headline text-primary flex items-center">
                    <KeyRound className="mr-2 h-5 w-5" /> Şifre Değiştir
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Mevcut Şifre</Label>
                        <Controller
                            name="currentPassword"
                            control={passwordControl}
                            render={({ field }) => <Input id="currentPassword" type="password" {...field} />}
                        />
                        {passwordErrors.currentPassword && <p className="text-sm text-destructive">{passwordErrors.currentPassword.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">Yeni Şifre</Label>
                        <Controller
                            name="newPassword"
                            control={passwordControl}
                            render={({ field }) => <Input id="newPassword" type="password" {...field} />}
                        />
                        {passwordErrors.newPassword && <p className="text-sm text-destructive">{passwordErrors.newPassword.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Yeni Şifreyi Onayla</Label>
                        <Controller
                            name="confirmPassword"
                            control={passwordControl}
                            render={({ field }) => <Input id="confirmPassword" type="password" {...field} />}
                        />
                        {passwordErrors.confirmPassword && <p className="text-sm text-destructive">{passwordErrors.confirmPassword.message}</p>}
                    </div>
                </div>
                 <div className="flex justify-end">
                    <Button type="submit" disabled={isSavingPassword}>
                        {isSavingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Şifreyi Değiştir
                    </Button>
                </div>
            </form>
            
            {userProfile?.role === 'admin' && (
                <>
                    <Separator className="my-8" />
                    <div className="space-y-8">
                         <div className="space-y-4">
                            <h3 className="text-xl font-headline text-primary flex items-center">
                                <Users className="mr-2 h-5 w-5" /> Kullanıcı Yönetimi
                            </h3>
                            {isLoadingData ? (
                                <div className="flex justify-center items-center p-4">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                                        <tr>
                                            <th scope="col" className="px-6 py-3">Kullanıcı</th>
                                            <th scope="col" className="px-6 py-3">Rol</th>
                                            <th scope="col" className="px-6 py-3">Durum</th>
                                            <th scope="col" className="px-6 py-3">Takım Görevleri</th>
                                            <th scope="col" className="px-6 py-3">Panelde Gizle</th>
                                            <th scope="col" className="px-6 py-3">Atamada Gizle</th>
                                            <th scope="col" className="px-6 py-3 text-right">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedUsers.map(user => (
                                            <tr key={user.uid} className="border-b">
                                                <td className="px-6 py-4 font-medium whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <div className="relative">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={user.photoURL || undefined} alt={`${user.firstName} ${user.lastName}`} />
                                                                <AvatarFallback>{user.firstName?.[0]}{user.lastName?.[0]}</AvatarFallback>
                                                            </Avatar>
                                                        </div>
                                                        <div>
                                                            <div>{user.firstName} {user.lastName}</div>
                                                            <div className="text-xs text-muted-foreground">{user.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Select
                                                        value={user.role}
                                                        onValueChange={(value) => handleUserPropertyChange(user.uid, 'role', value as UserRole)}
                                                        disabled={currentUser?.uid === user.uid}
                                                    >
                                                        <SelectTrigger className="w-28 h-8 text-xs">
                                                            <SelectValue/>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="admin">Yönetici</SelectItem>
                                                            <SelectItem value="user">Kullanıcı</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Select
                                                        value={user.status || 'active'}
                                                        onValueChange={(value) => handleUserPropertyChange(user.uid, 'status', value as UserStatus)}
                                                        disabled={currentUser?.uid === user.uid}
                                                    >
                                                        <SelectTrigger className="w-28 h-8 text-xs">
                                                            <SelectValue/>
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="active">Aktif</SelectItem>
                                                            <SelectItem value="inactive">Pasif</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Switch
                                                        checked={user.role === 'admin' || user.canViewTeamTasks}
                                                        onCheckedChange={(checked) => handleUserPropertyChange(user.uid, 'canViewTeamTasks', checked)}
                                                        disabled={user.role === 'admin' || currentUser?.uid === user.uid}
                                                        aria-label="Takım görevlerini görme yetkisi"
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Switch
                                                        checked={!!user.hideFromDashboard}
                                                        onCheckedChange={(checked) => handleUserPropertyChange(user.uid, 'hideFromDashboard', checked)}
                                                        disabled={currentUser?.uid === user.uid}
                                                        aria-label="Kullanıcıyı panel filtresinden gizle"
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                     <Switch
                                                        checked={!!user.hideFromTaskAssignment}
                                                        onCheckedChange={(checked) => handleUserPropertyChange(user.uid, 'hideFromTaskAssignment', checked)}
                                                        disabled={currentUser?.uid === user.uid}
                                                        aria-label="Kullanıcıyı görev atama listelerinden gizle"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive/80"
                                                        onClick={() => {setUserToDelete(user); setIsUserDeleteConfirmOpen(true);}}
                                                        disabled={currentUser?.uid === user.uid}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-8">
                            <div className="space-y-4">
                                <h3 className="text-xl font-headline text-primary flex items-center">
                                    <ShieldCheck className="mr-2 h-5 w-5" /> Yönetim Paneli
                                </h3>
                                <div className="space-y-4">
                                    <Link href="/settings/links" passHref>
                                        <Button variant="outline" className="w-full">
                                            <LinkIconLucide className="mr-2 h-4 w-4" /> Baz Link Ayarları
                                        </Button>
                                    </Link>
                                    <Link href="/settings/city-admin" passHref>
                                        <Button variant="outline" className="w-full">
                                            <Landmark className="mr-2 h-4 w-4" /> Şehir/İdare Seçenekleri
                                        </Button>
                                    </Link>
                                     <Link href="/settings/statuses" passHref>
                                        <Button variant="outline" className="w-full">
                                            <ListTodo className="mr-2 h-4 w-4" /> Görev Durumları
                                        </Button>
                                    </Link>
                                    <Link href="/settings/fields" passHref>
                                        <Button variant="outline" className="w-full">
                                            <LayoutList className="mr-2 h-4 w-4" /> Alan Yapılandırması ve CSV Eşleştirme
                                        </Button>
                                    </Link>
                                     <Link href="/settings/ui-text" passHref>
                                        <Button variant="outline" className="w-full">
                                            <Languages className="mr-2 h-4 w-4" /> Arayüz Metin Ayarları
                                        </Button>
                                    </Link>
                                    <form onSubmit={handleGlobalSubmit(onSaveGlobalSettings)} className="space-y-4 pt-4 border-t">
                                        <div className="flex items-center space-x-2">
                                            <Controller
                                                name="internalTestCasesEnabled"
                                                control={globalControl}
                                                render={({ field }) => (
                                                    <Switch
                                                        id="internalTestCasesEnabled"
                                                        checked={field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Label htmlFor="internalTestCasesEnabled" className="flex items-center text-foreground text-left">
                                                <TestTube2 className="mr-2 h-4 w-4 text-muted-foreground" />
                                                Uygulama İçi Test Senaryosu Özelliğini Aktif Et
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Controller
                                                name="jiraCsvSyncEnabled"
                                                control={globalControl}
                                                render={({ field }) => (
                                                    <Switch
                                                        id="jiraCsvSyncEnabled"
                                                        checked={field.value === undefined ? true : field.value}
                                                        onCheckedChange={field.onChange}
                                                    />
                                                )}
                                            />
                                            <Label htmlFor="jiraCsvSyncEnabled" className="flex items-center text-foreground text-left">
                                                <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                                                "Jira/CSV ile Güncelle" Butonunu Göster
                                            </Label>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="defaultDashboardDateRange" className="text-left">Takım Paneli Varsayılan Tarih Filtresi</Label>
                                            <Controller
                                                name="defaultDashboardDateRange"
                                                control={globalControl}
                                                render={({ field }) => (
                                                    <Select onValueChange={field.onChange} value={field.value}>
                                                        <SelectTrigger id="defaultDashboardDateRange">
                                                            <SelectValue placeholder="Varsayılan tarih aralığını seçin" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="7">Son 1 Hafta</SelectItem>
                                                            <SelectItem value="14">Son 2 Hafta</SelectItem>
                                                            <SelectItem value="30">Son 1 Ay</SelectItem>
                                                            <SelectItem value="all">Tüm Zamanlar</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                            />
                                        </div>
                                         <Button type="submit" className="w-full" disabled={isSavingGlobal}>
                                            {isSavingGlobal ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                            Genel Ayarları Kaydet
                                        </Button>
                                    </form>
                                     <div className="pt-4 border-t">
                                        <h4 className="text-lg font-semibold text-destructive mb-2">Tehlikeli Bölge</h4>
                                        <div className="space-y-4 rounded-lg border border-destructive/50 p-4">
                                            <Label htmlFor="purge-period">Silinecek Görevlerin Zaman Aralığı</Label>
                                            <div className="flex gap-2">
                                                <Select value={purgePeriod} onValueChange={(value) => {setPurgePeriod(value as PurgePeriod);}}>
                                                    <SelectTrigger id="purge-period">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1m">1 Aydan Eski</SelectItem>
                                                        <SelectItem value="2m">2 Aydan Eski</SelectItem>
                                                        <SelectItem value="3m">3 Aydan Eski</SelectItem>
                                                        <SelectItem value="6m">6 Aydan Eski</SelectItem>
                                                        <SelectItem value="1y">1 Yıldan Eski</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <Button variant="outline" onClick={handleCheckPurgeableTasks} disabled={isCheckingPurge}>
                                                  {isCheckingPurge && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                  Kontrol Et
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">Bu işlem, seçilen periyottan daha eski ve "Tamamlandı" veya "İptal Edildi" durumundaki tüm görevleri kalıcı olarak silmeden önce size bir önizleme sunar.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <h3 className="text-xl font-headline text-primary flex items-center">
                                    <KeyRound className="mr-2 h-5 w-5" /> Jira Entegrasyonu
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    "Jira'da Aç" butonunun doğru çalışması için Jira projenizin JQL sorgusunu buraya girin. 
                                    Sunucu tarafı senkronizasyon özellikleri şu an için devre dışıdır.
                                </p>

                                <form onSubmit={handleJiraSubmit(onSaveJqlQuery)} className="space-y-6 pt-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="jiraJqlQuery" className="flex items-center text-foreground text-left">
                                            Jira JQL Sorgusu ("Jira'da Aç" butonu için)
                                        </Label>
                                        <Controller
                                            name="jiraJqlQuery"
                                            control={jiraControl}
                                            render={({ field }) => (
                                            <Textarea
                                                id="jiraJqlQuery"
                                                placeholder='assignee = currentUser() ORDER BY updated DESC'
                                                {...field}
                                                className="bg-card text-foreground placeholder:text-muted-foreground border-input focus:border-primary text-left placeholder:text-left font-mono text-xs min-h-[80px]"
                                                disabled={userProfile?.role !== 'admin'}
                                            />
                                            )}
                                        />
                                        {jiraErrors.jiraJqlQuery && <p className="text-sm text-destructive text-left">{jiraErrors.jiraJqlQuery.message}</p>}
                                    </div>
                                    {userProfile?.role === 'admin' && (
                                        <div className="flex justify-end items-center gap-2">
                                            <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSavingJql}>
                                                {isSavingJql ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                                JQL Sorgusunu Kaydet
                                            </Button>
                                        </div>
                                    )}
                                </form>
                            </div>
                        </div>
                    </div>
                </>
            )}
          </CardContent>
        </Card>

        {userToDelete && (
            <Dialog open={isUserDeleteConfirmOpen} onOpenChange={setIsUserDeleteConfirmOpen}>
                <DialogContent>
                    <DialogHeader>
                    <DialogTitle>Kullanıcıyı Silme Onayı</DialogTitle>
                    <DialogDescription>
                        "{userToDelete.firstName} {userToDelete.lastName}" kullanıcısını silmek istediğinizden emin misiniz? Bu işlem kullanıcının profilini veritabanından kalıcı olarak kaldırır ve geri alınamaz.
                    </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsUserDeleteConfirmOpen(false)}>İptal</Button>
                      <Button onClick={handleDeleteUser} variant="destructive">Evet, Sil</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )}
        
        {isPurgePreviewModalOpen && (
            <PurgePreviewModal
                isOpen={isPurgePreviewModalOpen}
                onClose={() => setIsPurgePreviewModalOpen(false)}
                tasksToPurge={tasksToPurge}
                onConfirmPurge={handlePurgeOldTasks}
                allUsers={allUsers || []}
            />
        )}

      </main>
    </>
  );
}

const SettingsPage = React.memo(SettingsPageContent);
export default SettingsPage;
