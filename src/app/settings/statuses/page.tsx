
'use client';

import * as React from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth, DEFAULT_STATUS_CONFIGURATION } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { StatusSetting, GlobalSettings } from '@/types';
import { Save, Loader2, ArrowLeft, PlusCircle, Trash2, GripVertical, SmilePlus, Palette, icons, type LucideProps, type LucideIcon } from 'lucide-react';
import AppHeader from '@/components/header';
import { Form, FormControl, FormField, FormItem, FormMessage, FormLabel } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import * as LucideIcons from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const statusSettingSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Etiket gereklidir."),
  icon: z.string().min(1, "İkon adı gereklidir."),
  color: z.string().min(1, "Renk sınıfı gereklidir."),
});

const statusesConfigurationSchema = z.object({
  statusConfiguration: z.array(statusSettingSchema),
});

type StatusesConfigurationFormData = z.infer<typeof statusesConfigurationSchema>;


const AllLucideIcons = LucideIcons as unknown as { [key: string]: LucideIcon };

const Icon = ({ name, ...props }: LucideProps & { name: string }) => {
    const LucideIconComponent = AllLucideIcons[name];
    if (!LucideIconComponent) {
        return <LucideIcons.HelpCircle {...props} />; // Fallback icon
    }
    return <LucideIconComponent {...props} />;
};

const ICON_LIST: (keyof typeof LucideIcons)[] = [
    'Zap', 'Hourglass', 'AlertTriangle', 'TestTube', 'Eye', 'CheckCircle', 'XCircle',
    'PlayCircle', 'PauseCircle', 'Rocket', 'Flag', 'Clock', 'ShieldCheck', 'ThumbsUp',
    'ThumbsDown', 'Award', 'Book', 'Box', 'Briefcase', 'Calendar', 'Camera', 'ClipboardCheck',
    'Code', 'Coffee', 'Database', 'File', 'Filter', 'Folder', 'GitBranch', 'Globe',
    'Heart', 'Home', 'Image', 'Inbox', 'Key', 'Lightbulb', 'Link', 'Lock', 'Mail', 'MapPin',
    'MessageSquare', 'Mic', 'Paperclip', 'PenSquare', 'Phone', 'PieChart', 'Pin', 'Printer',
    'Save', 'Search', 'Send', 'Settings', 'Share2', 'ShoppingBag', 'SmilePlus', 'Star',
    'Tag', 'Target', 'Tool', 'Trash2', 'TrendingUp', 'User', 'Users', 'Video', 'Wallet', 'Wrench'
];

const COLOR_CLASSES = [
  'text-slate-500', 'text-gray-500', 'text-zinc-500', 'text-neutral-500', 'text-stone-500',
  'text-red-500', 'text-orange-500', 'text-amber-500', 'text-yellow-500', 'text-lime-500',
  'text-green-500', 'text-emerald-500', 'text-teal-500', 'text-cyan-500', 'text-sky-500',
  'text-blue-500', 'text-indigo-500', 'text-violet-500', 'text-purple-500', 'text-fuchsia-500',
  'text-pink-500', 'text-rose-500'
];

const BG_COLOR_CLASSES = [
  'bg-slate-500', 'bg-gray-500', 'bg-zinc-500', 'bg-neutral-500', 'bg-stone-500',
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500',
  'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
  'bg-pink-500', 'bg-rose-500'
];

const IconPicker = ({ value, onChange }: { value: string; onChange: (iconName: string) => void }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                    <Icon name={value} className="mr-2 h-4 w-4" />
                    {value}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-auto">
                <ScrollArea className="h-64">
                    <div className="grid grid-cols-6 gap-2">
                        {ICON_LIST.map((iconName) => (
                            <Button
                                key={iconName}
                                variant="ghost"
                                size="icon"
                                className={cn("h-10 w-10", value === iconName && "bg-accent")}
                                onClick={() => {
                                    onChange(iconName);
                                    setIsOpen(false);
                                }}
                            >
                                <Icon name={iconName} className="h-5 w-5" />
                            </Button>
                        ))}
                    </div>
                </ScrollArea>
            </PopoverContent>
        </Popover>
    );
};

const ColorPicker = ({ value, onChange }: { value: string; onChange: (colorClass: string) => void }) => {
    const [isOpen, setIsOpen] = React.useState(false);

    const getBgClass = (textClass: string) => {
        const colorName = textClass.split('-')[1];
        const colorShade = textClass.split('-')[2];
        return `bg-${colorName}-${colorShade}`;
    }

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                     <div className={cn("w-4 h-4 rounded-full mr-2", getBgClass(value))}></div>
                    <span className={value}>{value.split('-')[1]}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="p-2 w-auto">
                 <div className="grid grid-cols-6 gap-2">
                    {COLOR_CLASSES.map((colorClass) => (
                        <Button
                            key={colorClass}
                            variant="outline"
                            size="icon"
                            className={cn("h-10 w-10 border-2", value === colorClass ? 'border-ring' : 'border-transparent')}
                            onClick={() => {
                                onChange(colorClass);
                                setIsOpen(false);
                            }}
                        >
                            <div className={cn('w-6 h-6 rounded-full', getBgClass(colorClass))} />
                        </Button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default function StatusSettingsPage() {
  const { currentUser, userProfile, loading: authLoading, refreshAuthData } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [statusToRemove, setStatusToRemove] = React.useState<{ index: number; label: string } | null>(null);

  const form = useForm<StatusesConfigurationFormData>({
    resolver: zodResolver(statusesConfigurationSchema),
    defaultValues: {
      statusConfiguration: [],
    },
  });

  const { control, handleSubmit, reset } = form;
  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "statusConfiguration",
    keyName: "fieldId",
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
      return;
    }

    if (currentUser && userProfile.role === 'admin') {
      setIsLoadingData(true);
      const globalSettingsDocRef = doc(db, 'global_settings', 'main');
      getDoc(globalSettingsDocRef).then((docSnap) => {
        const settings = docSnap.exists() ? docSnap.data() as GlobalSettings : null;
        const config = settings?.statusConfiguration && settings.statusConfiguration.length > 0
          ? settings.statusConfiguration
          : DEFAULT_STATUS_CONFIGURATION;
        reset({ statusConfiguration: config });
      }).catch(error => {
        console.error("Error fetching status configuration:", error);
        toast({ variant: 'destructive', title: 'Hata', description: 'Durum ayarları yüklenemedi.' });
        reset({ statusConfiguration: DEFAULT_STATUS_CONFIGURATION });
      }).finally(() => {
        setIsLoadingData(false);
      });
    }
  }, [currentUser, userProfile, authLoading, router, toast, reset]);

  const onAddNewStatus = () => {
    const newId = `custom_${Date.now()}`;
    const defaultStatus: StatusSetting = {
      id: newId,
      label: 'Yeni Durum',
      icon: 'SmilePlus',
      color: 'text-gray-500',
    };
    append(defaultStatus);
  };
  
  const handleRemoveStatusTrigger = (index: number) => {
    if (fields.length <= 1) {
        toast({
            variant: 'destructive',
            title: 'Silme Başarısız',
            description: 'Sistemde en az bir görev durumu kalmalıdır.'
        });
        return;
    }
    const statusLabel = fields[index].label;
    setStatusToRemove({ index, label: statusLabel });
  };
  
  const confirmRemoveStatus = () => {
      if (statusToRemove !== null) {
        remove(statusToRemove.index);
        toast({
            title: 'Durum Kaldırıldı',
            description: `"${statusToRemove.label}" durumu yapılandırmadan kaldırıldı. Değişiklikleri kaydetmeyi unutmayın.`
        });
        setStatusToRemove(null);
      }
  };

  const onSubmit = async (data: StatusesConfigurationFormData) => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yetkiniz yok.' });
      return;
    }

    if (data.statusConfiguration.length < 1) {
      toast({ variant: 'destructive', title: 'Hata!', description: 'En az bir görev durumu tanımlanmalıdır.' });
      return;
    }

    setIsSaving(true);
    try {
      const globalSettingsDocRef = doc(db, 'global_settings', 'main');

      const labels = new Set();
      for (const status of data.statusConfiguration) {
          if (labels.has(status.label.toLowerCase())) {
              toast({ variant: 'destructive', title: 'Hata!', description: `"${status.label}" durumu birden fazla kez kullanılamaz.` });
              setIsSaving(false);
              return;
          }
          labels.add(status.label.toLowerCase());
      }

      await setDoc(globalSettingsDocRef, {
        statusConfiguration: data.statusConfiguration,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      await refreshAuthData();
      toast({ title: 'Başarılı', description: 'Görev durumları yapılandırması güncellendi.' });
    } catch (error: any) {
      console.error('Status configuration update error:', error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Yapılandırma güncellenirken bir sorun oluştu: ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("drag-index", index.toString());
  };

  const onDrop = (e: React.DragEvent, dropIndex: number) => {
    const dragIndex = parseInt(e.dataTransfer.getData("drag-index"), 10);
    move(dragIndex, dropIndex);
  };

  if (authLoading || isLoadingData || !userProfile) {
    return (
      <>
        <AppHeader />
        <main className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-background">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </main>
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8" dir="ltr">
        <div className="max-w-4xl mx-auto">
          <Button variant="outline" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Geri
          </Button>

          <Card className="shadow-xl border-border">
            <CardHeader className="text-left">
              <CardTitle className="text-2xl font-headline text-primary">Görev Durumları Yönetimi</CardTitle>
              <CardDescription className="text-muted-foreground">
                Uygulamadaki görev durumlarını buradan yönetin. Sürükleyip bırakarak sıralarını değiştirebilir, ikonlarını ve renklerini görsel olarak seçebilirsiniz.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    {fields.map((fieldItem, index) => (
                      <div
                        key={fieldItem.fieldId}
                        className="flex items-center gap-4 p-4 border border-border rounded-md bg-card/50"
                        draggable
                        onDragStart={(e) => onDragStart(e, index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDrop(e, index)}
                      >
                        <div className="cursor-grab text-muted-foreground">
                          <GripVertical className="h-5 w-5" />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 flex-grow">
                          <FormField
                            control={control}
                            name={`statusConfiguration.${index}.label`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Etiket</FormLabel>
                                <FormControl>
                                  <Input placeholder="Örn: Yapılacak" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                           <FormField
                            control={control}
                            name={`statusConfiguration.${index}.icon`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>İkon</FormLabel>
                                <FormControl>
                                   <IconPicker value={field.value} onChange={field.onChange} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                           <FormField
                            control={control}
                            name={`statusConfiguration.${index}.color`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Renk</FormLabel>
                                <FormControl>
                                  <ColorPicker value={field.value} onChange={field.onChange} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveStatusTrigger(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center mt-6">
                    <Button type="button" variant="outline" onClick={onAddNewStatus}>
                      <PlusCircle className="mr-2 h-4 w-4" /> Yeni Durum Ekle
                    </Button>
                    <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Durumları Kaydet
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
        <Dialog open={!!statusToRemove} onOpenChange={(open) => !open && setStatusToRemove(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Durumu Silme Onayı</DialogTitle>
                    <DialogDescription>
                        "{statusToRemove?.label}" durumunu silmek istediğinizden emin misiniz? Bu durumdaki mevcut görevler, kaydedildikten sonra ilk sıradaki duruma atanacaktır.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setStatusToRemove(null)}>İptal</Button>
                    <Button variant="destructive" onClick={confirmRemoveStatus}>Evet, Sil</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      </main>
    </>
  );
}

    