
'use client';

import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth, DEFAULT_UI_STRINGS } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { UiStrings, GlobalSettings } from '@/types';
import { Save, Loader2, ArrowLeft, Languages } from 'lucide-react';
import AppHeader from '@/components/header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from '@/components/ui/form';

const uiStringsSchema = z.object({
  layout_title: z.string().min(1, "Genel Uygulama Başlığı gereklidir."),
  header_title: z.string().min(1, "Ana Sayfa Başlığı (Header) gereklidir."),
  home_addTaskButton: z.string().min(1, "Ana Sayfa 'Yeni Görev Ekle' Buton Metni gereklidir."),

  tasks_page_delete_confirm_title: z.string().min(1, "Görev Silme Onay Başlığı gereklidir."),
  tasks_page_delete_confirm_description: z.string().min(1, "Görev Silme Onay Açıklaması gereklidir."),
  tasks_page_no_tasks_in_status: z.string().min(1, "Durumda Görev Yok Mesajı gereklidir."),
  tasks_page_no_tasks_overall: z.string().min(1, "Genel Görev Yok Mesajı gereklidir."),
  tasks_page_edit_task_aria_label: z.string().min(1, "Görev Düzenle ARIA Label gereklidir."),
  tasks_page_delete_task_aria_label: z.string().min(1, "Görev Sil ARIA Label gereklidir."),
  
  edit_task_modal_title_edit: z.string().min(1, "Görev Düzenle Modal Başlığı gereklidir."),
  edit_task_modal_title_add: z.string().min(1, "Yeni Görev Modal Başlığı gereklidir."),
  edit_task_modal_desc_edit: z.string().min(1, "Görev Düzenle Modal Açıklaması gereklidir."),
  edit_task_modal_desc_add: z.string().min(1, "Yeni Görev Modal Açıklaması gereklidir."),
  edit_task_modal_desc_task_key: z.string().min(1, "Modal Açıklama - Görev Linki/Anahtarı gereklidir."),
  edit_task_modal_button_add_new_city_admin: z.string().min(1, "Modal Buton - Yeni Şehir/İdare Ekle gereklidir."),
  edit_task_modal_combobox_placeholder_city_admin: z.string().min(1, "Modal Combobox Yer Tutucu - Şehir/İdare gereklidir."),
  edit_task_modal_combobox_empty_city_admin: z.string().min(1, "Modal Combobox Boş - Şehir/İdare gereklidir."),
  edit_task_modal_combobox_aria_label_delete_city_admin: z.string().min(1, "Modal Combobox ARIA Label Sil - Şehir/İdare gereklidir."),
  edit_task_modal_label_progress_with_value: z.string().min(1, "Modal Etiketi - İlerleme (Değerli) gereklidir."),
  edit_task_modal_aria_label_progress_slider: z.string().min(1, "Modal ARIA Label - İlerleme Kaydırıcısı gereklidir."),
  edit_task_modal_label_progress_notes_timestamp_tooltip: z.string().min(1, "Modal İpucu - Zaman Damgası gereklidir."),
  edit_task_modal_placeholder_new_progress_note: z.string().min(1, "Modal Yer Tutucu - Yeni İlerleme Notu gereklidir."),
  edit_task_modal_desc_analysis_test_link_not_completed: z.string().min(1, "Modal Açıklama - Tamamlanmamış Analiz/Test Linki gereklidir."),

  edit_task_modal_add_city_admin_title: z.string().min(1, "Şehir/İdare Ekle Modal Başlığı gereklidir."),
  edit_task_modal_add_city_admin_desc: z.string().min(1, "Şehir/İdare Ekle Modal Açıklaması gereklidir."),
  edit_task_modal_add_city_admin_label: z.string().min(1, "Şehir/İdare Ekle Modal Etiketi gereklidir."),
  edit_task_modal_add_city_admin_placeholder: z.string().min(1, "Şehir/İdare Ekle Modal Yer Tutucusu gereklidir."),

  edit_task_modal_delete_city_admin_title: z.string().min(1, "Şehir/İdare Sil Onay Başlığı gereklidir."),
  edit_task_modal_delete_city_admin_desc: z.string().min(1, "Şehir/İdare Sil Onay Açıklaması gereklidir."),
});


type UiStringsFormData = z.infer<typeof uiStringsSchema>;

const createLabel = (key: string): string => {
  const prefixMap: Record<string, string> = {
    layout: "Genel Site",
    header: "Üst Menü",
    home: "Ana Sayfa",
    tasks_page: "Görevler Sayfası",
    edit_task_modal: "Görev Ekle/Düzenle Modalı",
  };

  const suffixMap: Record<string, string> = {
    title: "Başlığı",
    description: "Açıklaması",
    desc: "Açıklaması",
    button: "Buton Metni",
    label: "Etiketi",
    placeholder: "Yer Tutucu Metni",
    aria_label: "ARIA Etiketi",
    combobox: "Açılır Liste",
    slider: "Kaydırıcı",
    tooltip: "İpucu",
    with_value: "(Değerli)",
    empty: "Boş Durum Metni",
    overall: "Genel Durum Metni",
    in_status: "Durum İçi Metin",
    not_completed: "Tamamlanmamış Durum Metni",
  };

  for (const pKey in prefixMap) {
    if (key.startsWith(pKey)) {
      const remainingKey = key.substring(pKey.length + 1); 
      let baseName = remainingKey.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
      
      for (const sKey in suffixMap) {
         if (baseName.toLowerCase().includes(sKey.replace(/_/g, ' '))) { 
             baseName = baseName.replace(new RegExp(sKey.replace(/_/g, ' '), 'gi'), suffixMap[sKey]);
        }
      }
      baseName = baseName.replace(/Ui Text/g, 'UI Text');
      baseName = baseName.replace(/ City Admin/g, ' Şehir/İdare');
      baseName = baseName.replace(/ Task Key/g, ' Görev Linki/Anahtarı');
      baseName = baseName.replace(/ Task Type/g, ' Görev Tipi');
      baseName = baseName.replace(/ Task Name/g, ' Görev Adı');
      baseName = baseName.replace(/ Progress Notes/g, ' İlerleme Notları');
      baseName = baseName.replace(/ Analysis Test Link/g, ' Analiz/Test Linki');
      baseName = baseName.replace(/Add New/g, 'Yeni Ekle');
      baseName = baseName.replace(/Confirm/g, 'Onay');


      return `${prefixMap[pKey]} > ${baseName}`;
    }
  }
  return key.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};


export default function UiTextSettingsPage() {
  const { currentUser, userProfile, loading: authLoading, refreshAuthData } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoadingData, setIsLoadingData] = React.useState(true);

  const form = useForm<UiStringsFormData>({
    resolver: zodResolver(uiStringsSchema),
    defaultValues: {}, 
  });

  React.useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !userProfile) {
        router.push('/login');
        return;
    }
    if (userProfile.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Yetkisiz Erişim', description: 'Bu sayfayı görüntüleme yetkiniz yok.' });
      router.push('/');
    }
    
    setIsLoadingData(true);
    const globalSettingsDocRef = doc(db, 'global_settings', 'main');
    getDoc(globalSettingsDocRef).then((docSnap) => {
        const settings = docSnap.exists() ? docSnap.data() as GlobalSettings : null;
        form.reset({ ...settings?.uiStrings });
    }).catch(error => {
        console.error("Error fetching UI strings:", error);
        toast({ variant: 'destructive', title: 'Hata', description: 'Arayüz metinleri yüklenemedi.' });
    }).finally(() => {
        setIsLoadingData(false);
    });

  }, [currentUser, userProfile, authLoading, router, toast, form]);

  const onSubmit = async (data: UiStringsFormData) => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yetkiniz yok.' });
      return;
    }
    setIsSaving(true);
    try {
      const globalSettingsDocRef = doc(db, 'global_settings', 'main');
      
      await setDoc(globalSettingsDocRef, {
        uiStrings: data,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await refreshAuthData();
      toast({ title: 'Başarılı', description: 'Arayüz metinleri güncellendi.' });
    } catch (error: any) {
      console.error('UI strings update error:', error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Metinler güncellenirken bir sorun oluştu: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || isLoadingData || !userProfile) {
    return (
      <>
        <AppHeader />
        <div className="flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      </>
    );
  }

  const formFields = Object.keys(uiStringsSchema.shape) as Array<keyof UiStringsFormData>;

  return (
    <>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8" dir="ltr">
        <div className="max-w-3xl mx-auto">
          <Button variant="outline" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Geri
          </Button>

          <Card className="shadow-xl border-border">
            <CardHeader className="text-left">
              <CardTitle className="text-2xl font-headline text-primary flex items-center">
                <Languages className="mr-2 h-6 w-6" /> Arayüz Metin Ayarları
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Uygulama içindeki genel başlıkları, buton metinlerini ve diğer arayüz yazılarını buradan özelleştirin. Bu ayarlar tüm kullanıcılar için geçerli olacaktır.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <ScrollArea className="h-[calc(100vh-23rem)] pr-4">
                    <div className="space-y-6">
                      {formFields.map((fieldName) => (
                        <div key={fieldName} className="space-y-2">
                           <FormField
                                control={form.control}
                                name={fieldName}
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel htmlFor={fieldName} className="text-left">
                                        {createLabel(fieldName)}
                                        </FormLabel>
                                        <FormControl>
                                        <Input
                                            id={fieldName}
                                            {...field}
                                            className="text-left placeholder:text-left border-input focus:border-primary"
                                            value={field.value || ''}
                                        />
                                        </FormControl>
                                        <FormMessage className="text-left" />
                                    </FormItem>
                                )}
                               />
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="flex justify-end pt-6">
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Metinleri Kaydet
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
