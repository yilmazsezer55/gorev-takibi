
'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, query, orderBy, getDocs, writeBatch } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { CityAdminValue, Task } from '@/types';
import { PlusCircle, Trash2, Loader2, ArrowLeft, Landmark, RefreshCw } from 'lucide-react';
import AppHeader from '@/components/header';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from '@/components/ui/separator';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const cityAdminSchema = z.object({
  name: z.string().min(1, "Şehir/İdare adı gereklidir.").max(100, "Şehir/İdare adı en fazla 100 karakter olabilir."),
});

type CityAdminFormData = z.infer<typeof cityAdminSchema>;

export default function CityAdminSettingsPage() {
  const { currentUser, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [cityAdminOptions, setCityAdminOptions] = React.useState<CityAdminValue[]>([]);
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [isSyncingFromTasks, setIsSyncingFromTasks] = React.useState(false);
  const [optionToDeleteId, setOptionToDeleteId] = React.useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CityAdminFormData>({
    resolver: zodResolver(cityAdminSchema),
    defaultValues: {
      name: '',
    },
  });
  
  const fetchCityAdmins = React.useCallback(async () => {
    setIsLoadingData(true);
    try {
        const cityAdminsQuery = query(collection(db, 'cityAdmins'), orderBy('name', 'asc'));
        const querySnapshot = await getDocs(cityAdminsQuery);
        const options = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CityAdminValue));
        setCityAdminOptions(options);
    } catch (error) {
        console.error("Error fetching city admin options:", error);
        toast({ variant: 'destructive', title: 'Hata', description: 'Şehir/İdare seçenekleri alınamadı.' });
    } finally {
        setIsLoadingData(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !userProfile) {
        router.push('/login');
        return;
    }
    if (userProfile.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Yetkisiz Erişim', description: 'Bu sayfayı görüntüleme yetkiniz yok.' });
      router.push('/');
      return;
    }
    if(currentUser && userProfile.role === 'admin') {
      fetchCityAdmins();
    }
  }, [currentUser, userProfile, authLoading, router, toast, fetchCityAdmins]);

  const handleSyncFromTasks = async () => {
    setIsSyncingFromTasks(true);
    try {
        const tasksCollectionRef = collection(db, 'tasks');
        const tasksSnapshot = await getDocs(tasksCollectionRef);
        const existingTasks = tasksSnapshot.docs.map(doc => doc.data() as Task);

        const uniqueCityAdmins = new Set<string>(
            existingTasks
                .map(task => task.cityAdmin)
                .filter((city): city is string => !!city && city.trim() !== '')
                .map(city => city.trim())
        );

        if (uniqueCityAdmins.size === 0) {
            toast({ title: 'Bilgi', description: 'Mevcut görevlerde senkronize edilecek Şehir/İdare adı bulunamadı.' });
            setIsSyncingFromTasks(false);
            return;
        }

        const existingOptions = new Set((cityAdminOptions || []).map(opt => opt.name.toLowerCase()));
        const batch = writeBatch(db);
        let newEntriesCount = 0;
        const newEntriesData: any[] = [];

        uniqueCityAdmins.forEach(cityName => {
            if (!existingOptions.has(cityName.toLowerCase())) {
                const newDocRef = doc(collection(db, 'cityAdmins'));
                const data = {
                    name: cityName,
                    createdAt: serverTimestamp(),
                };
                batch.set(newDocRef, data);
                newEntriesData.push(data);
                newEntriesCount++;
            }
        });

        if (newEntriesCount > 0) {
            await batch.commit().catch(async (serverError) => {
              const permissionError = new FirestorePermissionError({
                  path: `batch write (cityAdmins)`,
                  operation: 'write',
                  requestResourceData: newEntriesData
              });
              errorEmitter.emit('permission-error', permissionError);
              throw serverError;
            });
            await fetchCityAdmins();
            toast({ title: 'Başarılı!', description: `${newEntriesCount} yeni Şehir/İdare seçeneği görevlerden eklendi.` });
        } else {
            toast({ title: 'Güncel', description: 'Tüm Şehir/İdare seçenekleri zaten listenizde mevcut.' });
        }

    } catch (error: any) {
        console.error("Error syncing city admins from tasks:", error);
        if (!(error instanceof FirestorePermissionError)) {
          toast({ variant: 'destructive', title: 'Hata!', description: `Senkronizasyon sırasında bir sorun oluştu: ${error.message}` });
        }
    } finally {
        setIsSyncingFromTasks(false);
    }
  };


  const onAddNewOptionSubmit = async (data: CityAdminFormData) => {
    setIsSaving(true);
    try {
      if (cityAdminOptions.some(opt => opt.name.toLowerCase() === data.name.toLowerCase())) {
        toast({ variant: 'destructive', title: 'Hata!', description: 'Bu Şehir/İdare adı zaten mevcut.' });
        setIsSaving(false);
        return;
      }
      
      const newData = {
        name: data.name,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'cityAdmins'), newData).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: 'cityAdmins',
            operation: 'create',
            requestResourceData: newData
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });

      toast({ title: 'Başarılı', description: 'Yeni Şehir/İdare seçeneği eklendi.' });
      reset();
      await fetchCityAdmins();
    } catch (error: any) {
      console.error("Error adding city/admin option:", error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({ variant: 'destructive', title: 'Hata!', description: `Şehir/İdare seçeneği eklenirken bir sorun oluştu: ${error.message}` });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTrigger = (optionId: string) => {
    setOptionToDeleteId(optionId);
    setIsConfirmDialogOpen(true);
  };

  const confirmDeleteOption = async () => {
    if (!optionToDeleteId) {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Silinecek seçenek bulunamadı.' });
      setIsConfirmDialogOpen(false);
      return;
    }
    setIsSaving(true); 
    try {
      await deleteDoc(doc(db, 'cityAdmins', optionToDeleteId)).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: `cityAdmins/${optionToDeleteId}`,
            operation: 'delete'
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });

      toast({ title: 'Başarılı', description: 'Şehir/İdare seçeneği silindi.' });
      await fetchCityAdmins();
    } catch (error: any) {
      console.error("Error deleting city/admin option:", error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({ variant: 'destructive', title: 'Hata!', description: `Şehir/İdare seçeneği silinirken bir sorun oluştu: ${error.message}` });
      }
    } finally {
      setIsSaving(false);
      setIsConfirmDialogOpen(false);
      setOptionToDeleteId(null);
    }
  };

  if (authLoading || isLoadingData) {
    return (
        <>
            <AppHeader />
            <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8" dir="ltr">
        <div className="max-w-2xl mx-auto">
          <Button variant="outline" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Geri
          </Button>
          
          <Card className="shadow-xl border-border">
              <CardHeader className="text-left">
              <CardTitle className="text-2xl font-headline text-primary flex items-center">
                  <Landmark className="mr-2 h-6 w-6" /> Şehir/İdare Seçenekleri Yönetimi
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                  Görevler için kullanılabilir Şehir/İdare seçeneklerini buradan ekleyebilir veya silebilirsiniz. Bu ayarlar tüm kullanıcılar için geçerli olacaktır.
              </CardDescription>
              </CardHeader>
              <CardContent>
              <form onSubmit={handleSubmit(onAddNewOptionSubmit)} className="space-y-6">
                  <div className="space-y-2">
                  <Label htmlFor="name" className="text-left">Yeni Şehir/İdare Adı</Label>
                  <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                      <Input id="name" placeholder="Örn: İstanbul Büyükşehir Belediyesi" {...field} className="text-left placeholder:text-left border-input focus:border-primary" />
                      )}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                  <Button type="submit" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                      Yeni Seçenek Ekle
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleSyncFromTasks} className="w-full sm:w-auto" disabled={isSyncingFromTasks}>
                      {isSyncingFromTasks ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Varolan Görevlerden Senkronize Et
                  </Button>
                  </div>
              </form>

              <Separator className="my-8" />

              <div className="mt-8">
                  <h3 className="text-lg font-medium text-foreground mb-4 text-left">Tanımlı Şehir/İdare Seçenekleri</h3>
                  {cityAdminOptions.length > 0 ? (
                  <ul className="space-y-3">
                      {cityAdminOptions.map((option) => (
                      <li key={option.id} className="flex items-center justify-between p-3 bg-card border border-input rounded-md">
                          <p className="font-medium text-foreground text-left">{option.name}</p>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTrigger(option.id)} aria-label={`Sil ${option.name}`} disabled={isSaving}>
                          <Trash2 className="h-5 w-5 text-destructive hover:text-destructive/80" />
                          </Button>
                      </li>
                      ))}
                  </ul>
                  ) : (
                  <p className="text-muted-foreground text-left">Henüz tanımlanmış Şehir/İdare seçeneği bulunmamaktadır.</p>
                  )}
              </div>
              </CardContent>
          </Card>
        </div>
        <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Silme Onayı</DialogTitle>
              <DialogDescription>
                Bu Şehir/İdare seçeneğini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz. Bu seçeneği kullanan mevcut görevler etkilenmeyecektir (isimleri olduğu gibi kalacaktır), ancak yeni görevlerde bu seçenek listelenmeyecektir.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setOptionToDeleteId(null); setIsConfirmDialogOpen(false); }}>İptal</Button>
              <Button variant="destructive" onClick={confirmDeleteOption}>
                Evet, Sil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}

    