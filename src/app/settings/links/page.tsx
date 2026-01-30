
'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, orderBy, updateDoc, setDoc, getDocs, query, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { BaseLink, GlobalSettings } from '@/types';
import { PlusCircle, Trash2, Save, Loader2, ArrowLeft, Link as LinkIcon, Settings2 } from 'lucide-react';
import AppHeader from '@/components/header';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from '@/components/ui/separator';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

const baseLinkSchema = z.object({
  name: z.string().min(1, "Link adı gereklidir.").max(50, "Link adı en fazla 50 karakter olabilir."),
  url: z.string().url("Geçerli bir URL girin.").min(1, "URL gereklidir.").refine(val => val.endsWith('/'), {
    message: "URL '/' karakteri ile bitmelidir (örn: https://example.com/browse/).",
  }),
});

type BaseLinkFormData = z.infer<typeof baseLinkSchema>;

export default function LinkSettingsPage() {
  const { currentUser, userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = React.useState(false);
  const [linkToDeleteId, setLinkToDeleteId] = React.useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);

  const [baseLinks, setBaseLinks] = React.useState<BaseLink[]>([]);
  const [globalSettings, setGlobalSettings] = React.useState<GlobalSettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);


  const [selectedDefaultTaskKeyId, setSelectedDefaultTaskKeyId] = React.useState<string | null>(null);
  const [selectedDefaultAnalysisId, setSelectedDefaultAnalysisId] = React.useState<string | null>(null);
  const [selectedDefaultTestId, setSelectedDefaultTestId] = React.useState<string | null>(null);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<BaseLinkFormData>({
    resolver: zodResolver(baseLinkSchema),
    defaultValues: {
      name: '',
      url: '',
    },
  });
  
  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const linksQuery = query(collection(db, 'baseLinks'), orderBy('name', 'asc'));
      const linksSnapshot = await getDocs(linksQuery);
      const linksData = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BaseLink));
      setBaseLinks(linksData);

      const settingsSnap = await getDoc(doc(db, 'global_settings', 'main'));
      const settingsData = settingsSnap.exists() ? settingsSnap.data() as GlobalSettings : null;
      setGlobalSettings(settingsData);
      
      setSelectedDefaultTaskKeyId(settingsData?.defaultTaskKeyBaseLinkId || null);
      setSelectedDefaultAnalysisId(settingsData?.defaultAnalysisBaseLinkId || null);
      setSelectedDefaultTestId(settingsData?.defaultTestBaseLinkId || null);

    } catch (error) {
      console.error("Error fetching page data:", error);
      toast({ variant: 'destructive', title: 'Hata', description: 'Sayfa verileri yüklenemedi.' });
    } finally {
      setIsLoading(false);
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
    if (currentUser && userProfile.role === 'admin') {
        fetchData();
    }
  }, [currentUser, userProfile, authLoading, router, toast, fetchData]);

  const onAddNewBaseLinkSubmit = async (data: BaseLinkFormData) => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: "Hata!", description: 'Yetkiniz yok.' });
      return;
    }
    setIsSaving(true);
    try {
      const newData = {
        ...data,
        createdAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'baseLinks'), newData).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: 'baseLinks',
            operation: 'create',
            requestResourceData: newData
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });

      toast({ title: "Başarılı", description: 'Yeni baz link eklendi.' });
      reset();
      await fetchData();
    } catch (error: any) {
      console.error("Error adding base link:", error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({ variant: 'destructive', title: "Hata!", description: `Baz link eklenirken bir sorun oluştu: ${error.message || 'Firebase Firestore güvenlik kurallarınızı kontrol edin.'}` });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTrigger = (linkId: string) => {
    setLinkToDeleteId(linkId);
    setIsConfirmDialogOpen(true);
  };

  const confirmDeleteBaseLink = async () => {
    if (!currentUser || !linkToDeleteId || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: "Hata!", description: 'Kullanıcı veya silinecek link bulunamadı veya yetkiniz yok.' });
      setIsConfirmDialogOpen(false);
      setLinkToDeleteId(null);
      return;
    }

    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'baseLinks', linkToDeleteId)).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: `baseLinks/${linkToDeleteId}`,
            operation: 'delete'
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });
      
      const settingsUpdate: any = {};
      let defaultsChanged = false;

      if (globalSettings?.defaultTaskKeyBaseLinkId === linkToDeleteId) {
        settingsUpdate.defaultTaskKeyBaseLinkId = null;
        setSelectedDefaultTaskKeyId(null);
        defaultsChanged = true;
      }
      if (globalSettings?.defaultAnalysisBaseLinkId === linkToDeleteId) {
        settingsUpdate.defaultAnalysisBaseLinkId = null;
        setSelectedDefaultAnalysisId(null);
        defaultsChanged = true;
      }
      if (globalSettings?.defaultTestBaseLinkId === linkToDeleteId) {
        settingsUpdate.defaultTestBaseLinkId = null;
        setSelectedDefaultTestId(null);
        defaultsChanged = true;
      }

      if (defaultsChanged) {
          const globalSettingsDocRef = doc(db, 'global_settings', 'main');
          await updateDoc(globalSettingsDocRef, { ...settingsUpdate, updatedAt: serverTimestamp() }).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: 'global_settings/main',
                operation: 'update',
                requestResourceData: settingsUpdate
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
          });
      }

      toast({ title: "Başarılı", description: 'Baz link silindi.' });
      await fetchData();
    } catch (error: any) {
      console.error("Error deleting base link:", error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({ variant: 'destructive', title: "Hata!", description: `Baz link silinirken bir sorun oluştu: ${error.message}` });
      }
    } finally {
      setIsSaving(false);
      setIsConfirmDialogOpen(false);
      setLinkToDeleteId(null);
    }
  };

  const handleSaveDefaultBaseLinks = async () => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: "Hata!", description: 'Yetkiniz yok.' });
      return;
    }
    setIsSavingDefaults(true);
    try {
      const globalSettingsDocRef = doc(db, 'global_settings', 'main');
      const settingsUpdate = {
        defaultTaskKeyBaseLinkId: selectedDefaultTaskKeyId,
        defaultAnalysisBaseLinkId: selectedDefaultAnalysisId,
        defaultTestBaseLinkId: selectedDefaultTestId,
        updatedAt: serverTimestamp(),
      };
      await setDoc(globalSettingsDocRef, settingsUpdate, { merge: true }).catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: 'global_settings/main',
            operation: 'update',
            requestResourceData: settingsUpdate
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });

      toast({ title: "Başarılı", description: 'Varsayılan baz link tercihleri güncellendi.' });
      await fetchData();
    } catch (error: any) {
      console.error("Error saving default base links:", error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({ variant: 'destructive', title: "Hata!", description: `Varsayılanlar kaydedilirken bir sorun oluştu: ${error.message}` });
      }
    } finally {
      setIsSavingDefaults(false);
    }
  };


  if (authLoading || isLoading) {
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
                  <LinkIcon className="mr-2 h-6 w-6" /> Baz Link Ayarları
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                  Sık kullandığınız linkler için baz URL'ler tanımlayın. Bu ayarlar tüm kullanıcılar için geçerli olacaktır.
              </CardDescription>
              </CardHeader>
              <CardContent>
              <form onSubmit={handleSubmit(onAddNewBaseLinkSubmit)} className="space-y-6">
                  <div className="space-y-2">
                  <Label htmlFor="name" className="text-left">Link Adı (Örn: Jira Projesi)</Label>
                  <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                      <Input id="name" placeholder="Jira Projesi" {...field} className="text-left placeholder:text-left border-input focus:border-primary" />
                      )}
                  />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                  <Label htmlFor="url" className="text-left">Baz URL (Örn: https://jira.example.com/browse/)</Label>
                  <Controller
                      name="url"
                      control={control}
                      render={({ field }) => (
                      <Input id="url" type="url" placeholder="https://jira.example.com/browse/" {...field} className="text-left placeholder:text-left border-input focus:border-primary" />
                      )}
                  />
                  {errors.url && <p className="text-sm text-destructive">{errors.url.message}</p>}
                  <p className="text-xs text-muted-foreground pt-1">URL sonunda / (taksim) karakteri olmalıdır.</p>
                  </div>
                  <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlusCircle className="mr-2 h-4 w-4" />}
                  Yeni Baz Link Ekle
                  </Button>
              </form>

              <Separator className="my-8" />

              <div>
                  <h3 className="text-xl font-headline text-primary mb-1 flex items-center">
                      <Settings2 className="mr-2 h-5 w-5" /> Varsayılan Baz Link Ayarları
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                  Sadece anahtar (örn: CMS-123) girdiğinizde kullanılacak varsayılan baz linkleri seçin.
                  </p>
                  <div className="space-y-6">
                      <div className="space-y-2">
                          <Label htmlFor="defaultTaskKeyLink" className="text-left">Varsayılan Görev Linki (Genel/Jira)</Label>
                          <Select
                              value={selectedDefaultTaskKeyId || 'none'}
                              onValueChange={(value) => setSelectedDefaultTaskKeyId(value === 'none' ? null : value)}
                              disabled={isLoading || baseLinks.length === 0}
                          >
                              <SelectTrigger id="defaultTaskKeyLink" className="border-input focus:border-primary">
                                  <SelectValue placeholder="'Görev Linki' alanı için varsayılanı seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="none">Yok (Varsayılan Yok)</SelectItem>
                                  {baseLinks?.map(link => (
                                      <SelectItem key={link.id} value={link.id}>{link.name} ({link.url})</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground pt-1 text-left">"Görev Linki / Anahtarı" alanına sadece anahtar girildiğinde kullanılır.</p>
                          {(baseLinks.length === 0) && !isLoading && <p className="text-xs text-muted-foreground pt-1">Önce bir baz link eklemelisiniz.</p>}
                      </div>

                      <div className="space-y-2">
                          <Label htmlFor="defaultAnalysisLink" className="text-left">ANALİZ Tipi için Varsayılan Link</Label>
                          <Select
                              value={selectedDefaultAnalysisId || 'none'}
                              onValueChange={(value) => setSelectedDefaultAnalysisId(value === 'none' ? null : value)}
                              disabled={isLoading || baseLinks.length === 0}
                          >
                              <SelectTrigger id="defaultAnalysisLink" className="border-input focus:border-primary">
                                  <SelectValue placeholder="'ANALİZ' tipi için varsayılanı seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="none">Yok (Varsayılan Yok)</SelectItem>
                                  {baseLinks?.map(link => (
                                      <SelectItem key={link.id} value={link.id}>{link.name} ({link.url})</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground pt-1 text-left">"Analiz/Test Linki" alanı için, görev tipi "ANALİZ" ise kullanılır.</p>
                          {(baseLinks.length === 0) && !isLoading && <p className="text-xs text-muted-foreground pt-1">Önce bir baz link eklemelisiniz.</p>}
                      </div>

                      <div className="space-y-2">
                          <Label htmlFor="defaultTestLink" className="text-left">TEST Tipi için Varsayılan Link</Label>
                          <Select
                              value={selectedDefaultTestId || 'none'}
                              onValueChange={(value) => setSelectedDefaultTestId(value === 'none' ? null : value)}
                              disabled={isLoading || baseLinks.length === 0}
                          >
                              <SelectTrigger id="defaultTestLink" className="border-input focus:border-primary">
                                  <SelectValue placeholder="'TEST' tipi için varsayılanı seçin" />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectItem value="none">Yok (Varsayılan Yok)</SelectItem>
                                  {baseLinks?.map(link => (
                                      <SelectItem key={link.id} value={link.id}>{link.name} ({link.url})</SelectItem>
                                  ))}
                              </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground pt-1 text-left">"Analiz/Test Linki" alanı için, görev tipi "TEST" ise kullanılır.</p>
                          {(baseLinks.length === 0) && !isLoading && <p className="text-xs text-muted-foreground pt-1">Önce bir baz link eklemelisiniz.</p>}
                      </div>
                      <Button onClick={handleSaveDefaultBaseLinks} className="w-full" disabled={isSavingDefaults || isLoading}>
                          {isSavingDefaults ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Varsayılanları Kaydet
                      </Button>
                  </div>
              </div>


              <Separator className="my-8" />

              <div className="mt-8">
                  <h3 className="text-lg font-medium text-foreground mb-4 text-left">Tanımlı Baz Linkler</h3>
                  {baseLinks && baseLinks.length > 0 ? (
                  <ul className="space-y-3">
                      {baseLinks.map((link) => (
                      <li key={link.id} className="flex items-center justify-between p-3 bg-card border border-input rounded-md">
                          <div className="text-left">
                          <p className="font-medium text-foreground">{link.name}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-xs sm:max-w-sm md:max-w-md" title={link.url}>{link.url}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteTrigger(link.id)} aria-label={`Sil ${link.name}`} disabled={isSaving}>
                          <Trash2 className="h-5 w-5 text-destructive hover:text-destructive/80" />
                          </Button>
                      </li>
                      ))}
                  </ul>
                  ) : (
                  <p className="text-muted-foreground text-left">Henüz tanımlanmış baz link bulunmamaktadır.</p>
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
                Bu baz linki silmek istediğinizden emin misiniz? Bu işlem geri alınamaz. Eğer bu link varsayılan olarak atanmışsa, ilgili varsayılan ayarı da kaldırılacaktır.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setLinkToDeleteId(null); setIsConfirmDialogOpen(false); }}>İptal</Button>
              <Button variant="destructive" onClick={confirmDeleteBaseLink}>
                Evet, Sil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </>
  );
}

    