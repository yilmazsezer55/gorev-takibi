
'use client';

import * as React from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useAuth, DEFAULT_FIELD_CONFIGURATION, DEFAULT_STATUS_MAPPINGS, DEFAULT_STATUS_CONFIGURATION } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label as ShadcnLabel } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import type { FieldSetting, FieldType, UiStrings, Status, StatusSetting, GlobalSettings } from '@/types';
import { STATUS_OPTIONS } from '@/types';
import { Save, Loader2, ArrowLeft, LayoutList, GripVertical, PlusCircle, Trash2 } from 'lucide-react';
import AppHeader from '@/components/header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

const fieldSettingSchema = z.object({
  key: z.string(),
  label: z.string().min(1, "Etiket gereklidir."),
  visible: z.boolean(),
  order: z.number(),
  isDefault: z.boolean(),
  isCustom: z.boolean().optional(),
  fieldType: z.enum(['text', 'select', 'slider', 'textarea', 'combobox', 'datetime']),
  options: z.string().optional(),
  modalColumn: z.enum(['left', 'right']).optional(),
  csvHeader: z.string().optional(),
  width: z.string().optional(),
});

const fieldsConfigurationSchema = z.object({
  fieldConfiguration: z.array(fieldSettingSchema),
  newCustomFieldLabel: z.string().optional(),
  newCustomFieldType: z.enum(['text', 'select', 'slider', 'textarea', '']).optional(),
  newCustomFieldOptions: z.string().optional(),
  newCustomFieldModalColumn: z.enum(['left', 'right']).optional(),
  newCustomFieldCsvHeader: z.string().optional(),
});

type FieldsConfigurationFormData = z.infer<typeof fieldsConfigurationSchema>;

const FIELD_TYPE_OPTIONS: { value: Exclude<FieldType, 'combobox' | 'datetime'>; label: string, description?: string }[] = [
  { value: 'text', label: 'Metin' },
  { value: 'textarea', label: 'Çok Satırlı Metin' },
  { value: 'slider', label: 'Sayı Kaydırıcısı (0-100)' },
  { value: 'select', label: 'Seçim Kutusu' },
];

export default function FieldSettingsPage() {
  const { currentUser, userProfile, loading: authLoading, refreshAuthData } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSavingFields, setIsSavingFields] = React.useState(false);
  const [isSavingMappings, setIsSavingMappings] = React.useState(false);
  const [isLoadingData, setIsLoadingData] = React.useState(true);
  const [globalSettings, setGlobalSettings] = React.useState<GlobalSettings | null>(null);
  
  const [statusMappings, setStatusMappings] = React.useState<[string, string][]>([]);

  const resolvedFieldConfiguration = React.useMemo(() => globalSettings?.fieldConfiguration || DEFAULT_FIELD_CONFIGURATION, [globalSettings]);
  const resolvedStatusConfiguration = React.useMemo(() => globalSettings?.statusConfiguration || DEFAULT_STATUS_CONFIGURATION, [globalSettings]);
  const resolvedStatusMappings = React.useMemo(() => globalSettings?.statusMappings || DEFAULT_STATUS_MAPPINGS, [globalSettings]);


  const fieldsForm = useForm<FieldsConfigurationFormData>({
    resolver: zodResolver(fieldsConfigurationSchema),
  });

  const { control: fieldsControl, handleSubmit: handleFieldsSubmit, reset: resetFieldsForm, watch: watchFieldsForm, setValue: setFieldsValue, getValues: getFieldsValues } = fieldsForm;
  const { fields, append, remove, move } = useFieldArray({
    control: fieldsControl,
    name: "fieldConfiguration",
    keyName: "fieldId",
  });

  const watchedNewFieldType = watchFieldsForm("newCustomFieldType");
  
  React.useEffect(() => {
    if (authLoading) return;
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Yetkisiz Erişim', description: 'Bu sayfayı görüntüleme yetkiniz yok.' });
      router.push('/');
      return;
    }

    setIsLoadingData(true);
    const settingsDocRef = doc(db, 'global_settings', 'main');
    getDoc(settingsDocRef).then(docSnap => {
        const settings = docSnap.exists() ? docSnap.data() as GlobalSettings : null;
        setGlobalSettings(settings);

        const fieldConfig = settings?.fieldConfiguration || DEFAULT_FIELD_CONFIGURATION;
        const initialFieldConfig = fieldConfig.map(field => ({
            ...field,
            options: Array.isArray(field.options) ? field.options.join('\n') : (field.options || ''),
            width: field.width || '',
        })).sort((a, b) => a.order - b.order);
        
        resetFieldsForm({
            fieldConfiguration: initialFieldConfig,
            newCustomFieldLabel: '',
            newCustomFieldType: 'text',
            newCustomFieldOptions: '',
            newCustomFieldModalColumn: 'right',
            newCustomFieldCsvHeader: '',
        });

        const statusMaps = settings?.statusMappings || DEFAULT_STATUS_MAPPINGS;
        setStatusMappings(Object.entries(statusMaps));

    }).catch(error => {
        console.error("Error fetching settings:", error);
        toast({ variant: 'destructive', title: 'Hata', description: 'Ayarlar yüklenemedi.' });
    }).finally(() => {
        setIsLoadingData(false);
    });

  }, [currentUser, userProfile, authLoading, router, toast, resetFieldsForm]);


  const handleAddNewCustomField = () => {
    const newLabel = getFieldsValues("newCustomFieldLabel")?.trim();
    const newFieldType = getFieldsValues("newCustomFieldType");
    const newOptionsString = getFieldsValues("newCustomFieldOptions");
    const newModalColumn = getFieldsValues("newCustomFieldModalColumn") || 'right';
    const newCsvHeader = getFieldsValues("newCustomFieldCsvHeader")?.trim();

    if (!newLabel) {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yeni alan etiketi boş olamaz.' });
      return;
    }
    if (!newFieldType || newFieldType === '') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yeni alan tipi seçilmelidir.' });
      return;
    }
    const newKey = `custom_${newLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_${Date.now()}`;
    if (fields.some(field => field.key === newKey || field.label === newLabel)) {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Bu etiket veya anahtar zaten mevcut.' });
      return;
    }
    if (newFieldType === 'select' && (!newOptionsString || newOptionsString.trim() === '')) {
        toast({ variant: 'destructive', title: 'Hata!', description: 'Seçim kutusu için en az bir seçenek girilmelidir.' });
        return;
    }
    append({
      key: newKey,
      label: newLabel,
      visible: true,
      order: fields.length,
      isDefault: false,
      isCustom: true,
      fieldType: newFieldType as FieldType,
      options: newOptionsString || '',
      modalColumn: newModalColumn,
      csvHeader: newCsvHeader || '',
      width: 'auto',
    });
    setFieldsValue("newCustomFieldLabel", "");
    setFieldsValue("newCustomFieldType", "text");
    setFieldsValue("newCustomFieldOptions", "");
    setFieldsValue("newCustomFieldModalColumn", "right");
    setFieldsValue("newCustomFieldCsvHeader", "");
    toast({ title: 'Başarılı', description: `"${newLabel}" alanı eklendi. Kaydetmeyi unutmayın.` });
  };

  const handleRemoveCustomField = (index: number) => {
    const fieldToRemove = fields[index];
    if (fieldToRemove && fieldToRemove.isCustom) {
      remove(index);
      toast({ title: 'Alan Kaldırıldı', description: `"${fieldToRemove.label}" alanı yapılandırmadan kaldırıldı. Değişiklikleri kaydetmeyi unutmayın.` });
    } else {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Varsayılan alanlar kaldırılamaz.' });
    }
  };


  const onFieldsSubmit = async (data: FieldsConfigurationFormData) => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yetkiniz yok.' });
      return;
    }
    setIsSavingFields(true);
    try {
      const globalSettingsDocRef = doc(db, 'global_settings', 'main');

      const finalConfiguration = data.fieldConfiguration.map((field, index) => {
        let optionsArray: string[] = [];
        if ((field.fieldType === 'select' || field.fieldType === 'combobox') && typeof field.options === 'string' && field.options.trim() !== '') {
            optionsArray = field.options.split(/[\n,]+/).map(opt => opt.trim()).filter(Boolean);
        }
        const defaultFieldSettings = DEFAULT_FIELD_CONFIGURATION.find(df => df.key === field.key);
        const calculatedModalColumn = field.modalColumn ||
                                   (field.isCustom ? 'right' :
                                   (defaultFieldSettings?.modalColumn ||
                                   (field.key === 'progressNotes' || field.key === 'analysisTestLink' ? 'right' : 'left')));
        return {
          key: field.key,
          label: field.label,
          visible: field.visible,
          order: index,
          isDefault: field.isDefault,
          isCustom: field.isCustom,
          fieldType: field.fieldType,
          options: optionsArray,
          modalColumn: calculatedModalColumn,
          csvHeader: field.csvHeader || '',
          width: field.width || '',
        };
      });

      const settingsUpdatePayload = {
        fieldConfiguration: finalConfiguration,
        updatedAt: serverTimestamp(),
      };
      
      await setDoc(globalSettingsDocRef, settingsUpdatePayload, { merge: true });
      await refreshAuthData();
      toast({ title: 'Başarılı', description: 'Alan yapılandırması güncellendi.' });
    } catch (error: any) {
      console.error('Field configuration update error:', error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Yapılandırma güncellenirken bir sorun oluştu: ${error.message}` });
    } finally {
      setIsSavingFields(false);
    }
  };
  
  const handleMappingChange = (index: number, type: 'key' | 'value', value: string) => {
    const newMappings = [...statusMappings];
    if (type === 'key') {
      newMappings[index][0] = value;
    } else {
      newMappings[index][1] = value as string;
    }
    setStatusMappings(newMappings);
  };

  const handleAddMapping = () => {
    const firstStatusOption = resolvedStatusConfiguration[0]?.label || 'YAPILACAK';
    setStatusMappings([...statusMappings, ['', firstStatusOption]]);
  };

  const handleRemoveMapping = (index: number) => {
    const newMappings = statusMappings.filter((_, i) => i !== index);
    setStatusMappings(newMappings);
  };

  const onSaveMappings = async () => {
    if (!currentUser || userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Yetkiniz yok.' });
      return;
    }

    const uniqueKeys = new Set<string>();
    for (const [key] of statusMappings) {
        if(key.trim().toLowerCase() === "") {
            toast({ variant: 'destructive', title: 'Hata!', description: 'CSV Durum Adı boş olamaz.' });
            return;
        }
        if (uniqueKeys.has(key.trim().toLowerCase())) {
            toast({ variant: 'destructive', title: 'Hata!', description: `CSV Durum Adı '${key}' birden fazla kez kullanılamaz.` });
            return;
        }
        uniqueKeys.add(key.trim().toLowerCase());
    }

    setIsSavingMappings(true);
    try {
        const mappingsToSave: Record<string, string> = {};
        statusMappings.forEach(([key, value]) => {
            mappingsToSave[key.trim().toLowerCase()] = value;
        });

        const globalSettingsDocRef = doc(db, 'global_settings', 'main');
        await setDoc(globalSettingsDocRef, {
            statusMappings: mappingsToSave
        }, { merge: true });

        await refreshAuthData();
        toast({ title: 'Başarılı', description: 'Durum eşleştirmeleri güncellendi.' });
    } catch (error: any) {
        console.error('Status mappings update error:', error);
        toast({ variant: 'destructive', title: 'Hata!', description: `Eşleştirmeler güncellenirken bir sorun oluştu: ${error.message}` });
    } finally {
      setIsSavingMappings(false);
    }
  };


  if (authLoading || isLoadingData || !currentUser || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }
  
  const statusOptions = resolvedStatusConfiguration.map(s => s.label);

  return (
    <>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8" dir="ltr">
        <div className="max-w-6xl mx-auto">
          <Button variant="outline" onClick={() => router.back()} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Geri
          </Button>

          <Card className="shadow-xl border-border">
            <CardHeader className="text-left">
              <CardTitle className="text-2xl font-headline text-primary flex items-center">
                <LayoutList className="mr-2 h-6 w-6" /> Alan Yapılandırması ve CSV Eşleştirme
              </CardTitle>
            </CardHeader>
            <Form {...fieldsForm}>
                <form onSubmit={handleFieldsSubmit(onFieldsSubmit)} className="space-y-6">
                    <CardContent>
                        <CardDescription className="text-muted-foreground mb-6 text-left">
                            Görevler sayfasında ve görev ekleme/düzenleme formunda gösterilecek alanları, etiketlerini, sıralarını ve CSV eşleştirmelerini yönetin. Bu ayarlar tüm kullanıcılar için geçerli olacaktır.
                        </CardDescription>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1 space-y-6">
                                <div className="space-y-4 p-4 border border-dashed border-border rounded-md sticky top-24">
                                    <h4 className="text-lg font-medium text-foreground">Yeni Özel Alan Ekle</h4>
                                    <div className="grid grid-cols-1 gap-4">
                                        <FormField
                                            control={fieldsControl}
                                            name="newCustomFieldLabel"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel htmlFor="newCustomFieldLabel">Yeni Alan Etiketi</FormLabel>
                                                <FormControl>
                                                <Input
                                                    id="newCustomFieldLabel"
                                                    placeholder="Örn: Departman Adı"
                                                    {...field}
                                                    value={field.value || ''}
                                                    className="text-left placeholder:text-left border-input focus:border-primary"
                                                />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={fieldsControl}
                                            name="newCustomFieldCsvHeader"
                                            render={({ field }) => (
                                            <FormItem>
                                                <FormLabel htmlFor="newCustomFieldCsvHeader">CSV Sütun Başlığı (İsteğe bağlı)</FormLabel>
                                                <FormControl>
                                                <Input
                                                    id="newCustomFieldCsvHeader"
                                                    placeholder="Örn: Departmanlar"
                                                    {...field}
                                                    value={field.value || ''}
                                                    className="text-left placeholder:text-left border-input focus:border-primary"
                                                />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                    </div>
                                    <FormField
                                        control={fieldsControl}
                                        name="newCustomFieldType"
                                        render={({ field }) => (
                                        <FormItem>
                                            <FormLabel htmlFor="newCustomFieldType">Alan Tipi</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value} >
                                            <FormControl>
                                                <SelectTrigger id="newCustomFieldType" className="w-full text-left border-input focus:border-primary">
                                                <SelectValue placeholder="Alan tipini seçin" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {FIELD_TYPE_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label} {option.description && <span className="text-xs text-muted-foreground ml-1">{option.description}</span>}
                                                </SelectItem>
                                                ))}
                                            </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                        )}
                                    />
                                    {watchedNewFieldType === 'select' && (
                                    <FormField
                                        control={fieldsControl}
                                        name="newCustomFieldOptions"
                                        render={({ field }) => (
                                            <FormItem>
                                            <FormLabel htmlFor="newCustomFieldOptions">Seçenekler (Her biri yeni satırda veya virgülle ayrılmış)</FormLabel>
                                            <FormControl>
                                                <Textarea
                                                id="newCustomFieldOptions"
                                                placeholder="Seçenek 1
Seçenek 2
Seçenek 3,Seçenek4"
                                                {...field}
                                                value={field.value || ''}
                                                className="min-h-[80px]"
                                                />
                                            </FormControl>
                                            <p className="text-xs text-muted-foreground">Her seçeneği yeni bir satıra yazın veya virgülle ayırın.</p>
                                            <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    )}
                                    <FormField
                                            control={fieldsControl}
                                            name="newCustomFieldModalColumn"
                                            render={({ field }) => (
                                            <FormItem className="space-y-2">
                                                <FormLabel>Modal Sütunu (Görev Ekle/Düzenle)</FormLabel>
                                                <FormControl>
                                                <RadioGroup
                                                    onValueChange={field.onChange}
                                                    value={field.value || 'right'}
                                                    className="flex space-x-4"
                                                >
                                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                        <RadioGroupItem value="left" id="newModalColumnLeft" />
                                                    </FormControl>
                                                    <ShadcnLabel htmlFor="newModalColumnLeft" className="font-normal">Sol</ShadcnLabel>
                                                    </FormItem>
                                                    <FormItem className="flex items-center space-x-2 space-y-0">
                                                    <FormControl>
                                                        <RadioGroupItem value="right" id="newModalColumnRight" />
                                                    </FormControl>
                                                    <ShadcnLabel htmlFor="newModalColumnRight" className="font-normal">Sağ</ShadcnLabel>
                                                    </FormItem>
                                                </RadioGroup>
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                            )}
                                        />
                                    <Button type="button" variant="outline" onClick={handleAddNewCustomField} className="w-full">
                                    <PlusCircle className="mr-2 h-4 w-4" /> Yeni Alanı Listeye Ekle
                                    </Button>
                                </div>
                            </div>
                            <div className="lg:col-span-2">
                                <h4 className="text-lg font-medium text-foreground mb-4">Mevcut Alanlar</h4>
                                <ScrollArea className="h-[calc(100vh-30rem)] pr-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                    {fields.map((fieldItem, index) => (
                                        <div key={fieldItem.fieldId} className="flex items-start gap-3 mb-4 p-4 border border-border rounded-md bg-card/50">
                                        <div className="flex flex-col gap-1 items-center pt-8 cursor-grab">
                                            <GripVertical className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div className="flex-grow space-y-3">
                                            <FormField
                                            control={fieldsControl}
                                            name={`fieldConfiguration.${index}.label`}
                                            render={({ field }) => (
                                                <FormItem>
                                                <div className='flex justify-between items-center'>
                                                    <FormLabel htmlFor={`fieldConfiguration.${index}.label`} className="text-left text-base font-semibold">
                                                    {fieldItem.isCustom ? field.value : DEFAULT_FIELD_CONFIGURATION.find(f => f.key === fieldItem.key)?.label || field.value}
                                                    </FormLabel>
                                                    <div className="flex items-center space-x-2">
                                                        <ShadcnLabel htmlFor={`fieldConfiguration.${index}.visible`} className="text-xs">Göster</ShadcnLabel>
                                                        <FormField
                                                            control={fieldsControl}
                                                            name={`fieldConfiguration.${index}.visible`}
                                                            render={({ field: switchField }) => (
                                                            <FormItem>
                                                                <FormControl>
                                                                <Switch
                                                                    id={`fieldConfiguration.${index}.visible`}
                                                                    checked={switchField.value}
                                                                    onCheckedChange={switchField.onChange}
                                                                    disabled={fieldItem.isDefault && (fieldItem.key === 'taskName' || fieldItem.key === 'status' || fieldItem.key === 'csvUpdatedAt')}
                                                                />
                                                                </FormControl>
                                                            </FormItem>
                                                            )}
                                                        />
                                                    </div>
                                                </div>
                                                <FormControl>
                                                    <Input
                                                    id={`fieldConfiguration.${index}.label`}
                                                    {...field}
                                                    value={field.value || ''}
                                                    className="text-left placeholder:text-left border-input focus:border-primary mt-1"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                            />
                                            <FormField
                                            control={fieldsControl}
                                            name={`fieldConfiguration.${index}.csvHeader`}
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel htmlFor={`fieldConfiguration.${index}.csvHeader`} className="text-left text-sm font-medium">CSV Sütun Başlığı</FormLabel>
                                                <FormControl>
                                                    <Input
                                                    id={`fieldConfiguration.${index}.csvHeader`}
                                                    {...field}
                                                    value={field.value || ''}
                                                    className="text-left placeholder:text-left border-input focus:border-primary mt-1"
                                                    placeholder="CSV'deki tam sütun adı"
                                                    disabled={fieldItem.isDefault && fieldItem.key === 'csvUpdatedAt'}
                                                    />
                                                </FormControl>
                                                {fieldItem.isDefault && fieldItem.key === 'csvUpdatedAt' && <p className="text-xs text-muted-foreground">Bu alan için CSV başlığı 'Güncellendi' olarak sabitlenmiştir.</p> }
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                            />
                                            <FormField
                                            control={fieldsControl}
                                            name={`fieldConfiguration.${index}.width`}
                                            render={({ field }) => (
                                                <FormItem>
                                                <FormLabel htmlFor={`fieldConfiguration.${index}.width`} className="text-left text-sm font-medium">Sütun Genişliği (örn: w-[250px])</FormLabel>
                                                <FormControl>
                                                    <Input
                                                    id={`fieldConfiguration.${index}.width`}
                                                    {...field}
                                                    value={field.value || ''}
                                                    className="text-left placeholder:text-left border-input focus:border-primary mt-1 font-mono text-xs"
                                                    placeholder="örn: w-[250px] veya min-w-[20rem]"
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                </FormItem>
                                            )}
                                            />
                                            {(fieldItem.fieldType === 'select' || (fieldItem.isDefault && fieldItem.fieldType === 'combobox' && fieldItem.key !== 'cityAdmin') ) && (
                                            <FormField
                                                control={fieldsControl}
                                                name={`fieldConfiguration.${index}.options`}
                                                render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel htmlFor={`fieldConfiguration.${index}.options`} className="text-left text-sm">Seçenekler</FormLabel>
                                                    <FormControl>
                                                    <Textarea
                                                        id={`fieldConfiguration.${index}.options`}
                                                        placeholder="Seçenek 1
Seçenek 2,Seçenek3"
                                                        {...field}
                                                        value={field.value || ''}
                                                        className="min-h-[80px] mt-1"
                                                        disabled={fieldItem.isDefault && (fieldItem.key === 'cityAdmin' || fieldItem.key === 'status')}
                                                    />
                                                    </FormControl>
                                                    {!(fieldItem.isDefault && (fieldItem.key === 'cityAdmin' || fieldItem.key === 'status')) && <p className="text-xs text-muted-foreground">Her seçeneği yeni bir satıra yazın veya virgülle ayırın.</p> }
                                                    {fieldItem.isDefault && (fieldItem.key === 'cityAdmin') && <p className="text-xs text-muted-foreground">Şehir/İdare seçenekleri ayrı bir ayar sayfasından yönetilir.</p> }
                                                    {fieldItem.isDefault && (fieldItem.key === 'status') && <p className="text-xs text-muted-foreground">Görev Durumları ayrı bir ayar sayfasından yönetilir.</p> }
                                                    <FormMessage />
                                                </FormItem>
                                                )}
                                            />
                                            )}
                                        </div>
                                        {fieldItem.isCustom && (
                                            <div className="pt-1">
                                            <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive/80 h-8 w-8" onClick={() => handleRemoveCustomField(index)}>
                                                <Trash2 className="h-4 w-4" />
                                                <span className="sr-only">Bu Özel Alanı Kaldır</span>
                                            </Button>
                                            </div>
                                        )}
                                        </div>
                                    ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </CardContent>
                    <div className="flex justify-end p-6 pt-0">
                        <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSavingFields}>
                        {isSavingFields ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Alan Yapılandırmasını Kaydet
                        </Button>
                    </div>
                </form>
              </Form>
              
              <Separator className="my-6" />

              <div className="px-6 pb-6">
                  <h3 className="text-xl font-headline text-primary mb-2">CSV Durum Eşleştirme</h3>
                  <p className="text-muted-foreground mb-6">CSV dosyanızdaki durum adlarını, uygulamadaki durumlara nasıl çevireceğinizi buradan yönetin. Buradaki ayarlar, varsayılan eşleştirmeleri geçersiz kılar.</p>
                  <div className="space-y-4">
                      {statusMappings.map(([key, value], index) => (
                          <div key={index} className="flex items-center gap-4">
                              <Input 
                                  placeholder="CSV'deki Durum Adı" 
                                  value={key}
                                  onChange={(e) => handleMappingChange(index, 'key', e.target.value)}
                                  className="font-mono text-sm"
                              />
                              <Select value={value} onValueChange={(val) => handleMappingChange(index, 'value', val)}>
                                  <SelectTrigger className="w-[250px]">
                                      <SelectValue placeholder="Uygulama Durumu Seçin" />
                                  </SelectTrigger>
                                  <SelectContent>
                                      {statusOptions.map(opt => (
                                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                  </SelectContent>
                              </Select>
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveMapping(index)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                          </div>
                      ))}
                  </div>
                  <div className="flex justify-between items-center mt-6">
                      <Button variant="outline" onClick={handleAddMapping}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Yeni Eşleştirme Ekle
                      </Button>
                      <Button onClick={onSaveMappings} disabled={isSavingMappings}>
                          {isSavingMappings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Eşleştirmeleri Kaydet
                      </Button>
                  </div>
              </div>
          </Card>
        </div>
      </main>
    </>
  );
}

    