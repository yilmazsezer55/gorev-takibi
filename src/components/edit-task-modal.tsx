

'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, type FieldPath } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription as FormFieldDescription,
  FormField,
  FormItem,
  FormMessage,
  FormLabel,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import type { Task, TaskType, CityAdminValue, Status, FieldSetting, DefaultTaskFieldKey, FieldType, ProgressNoteEntry, UserProfile, StatusSetting, UiStrings, GlobalSettings, BaseLink } from '@/types';
import { TASK_TYPES, STATUS_OPTIONS } from '@/types';
import { Save, StickyNote, CalendarDays, PlusCircle, Trash2, Loader2, ChevronsUpDown, Check, Edit, X, CaseUpper, Pilcrow, Bold, Italic, Underline, Strikethrough, List, ListOrdered, Users } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { db } from '@/lib/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp, query, where, getDocs, getDoc, Timestamp, arrayUnion, updateDoc, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Label as ShadCnLabel } from '@/components/ui/label';
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from 'uuid';
import { Toggle } from '@/components/ui/toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';


const toTitleCase = (str: string): string => {
  if (!str) return "";
  return str.split(' ').map(word => {
    if (word.length === 0) return '';
    // Check if the word is an acronym (all caps) and leave it as is.
    if (word.toUpperCase() === word) {
      return word;
    }
    // Capitalize the first letter correctly (handling Turkish 'i')
    const firstChar = word.charAt(0);
    const rest = word.slice(1).toLocaleLowerCase('tr-TR');
    if (firstChar === 'i') {
      return 'İ' + rest;
    }
    return firstChar.toLocaleUpperCase('tr-TR') + rest;
  }).join(' ');
};

const renderFormattedText = (text: string | undefined) => {
    if (!text) return null;

    let processedText = text
        .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
        .replace(/_(.*?)_/g, '<em>$1</em>')
        .replace(/\+(.*?)\+/g, '<u>$1</u>')
        .replace(/~(.*?)~/g, '<del>$1</del>')
        .replace(/• /g, '<li>')
        .replace(/\n/g, '<br />');

    const lines = processedText.split('<br />');
    let htmlContent = '';
    let inList = false;

    lines.forEach(line => {
        if (line.startsWith('<li>')) {
            if (!inList) {
                htmlContent += '<ul>';
                inList = true;
            }
            htmlContent += line;
        } else {
            if (inList) {
                htmlContent += '</ul>';
                inList = false;
            }
            htmlContent += `<p>${line}</p>`;
        }
    });

    if (inList) {
        htmlContent += '</ul>';
    }

    htmlContent = htmlContent.replace(/<p><\/p>/g, '');
    htmlContent = htmlContent.replace(/<li>/g, '<li style="list-style: disc; margin-left: 20px;">');
    htmlContent = htmlContent.replace(/<ul><p>/g, '<ul>');
    htmlContent = htmlContent.replace(/<\/p><\/ul>/g, '</ul>');


    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} className="prose dark:prose-invert prose-sm max-w-none" />;
};


const createTaskFormSchema = (fields: FieldSetting[]) => {
  const schemaObject: Record<string, z.ZodTypeAny> = {};

  fields.forEach(field => {
    if (!field.visible) return;

    if (field.isCustom) {
      if (field.fieldType === 'slider') {
        schemaObject[field.key] = z.number().min(0).max(100).optional().nullable();
      } else if ((field.fieldType === 'select' || field.fieldType === 'combobox') && field.options && field.options.length > 0) {
        const enumValues = field.options as [string, ...string[]];
        if (enumValues.length > 0) {
            schemaObject[field.key] = z.string().optional().nullable().refine(
                (val) => val === null || val === '' || enumValues.includes(val),
                { message: `${field.label} için geçerli bir seçenek seçin.` }
            );
        } else {
             schemaObject[field.key] = z.string().optional().nullable();
        }
      } else {
        schemaObject[field.key] = z.string().optional().nullable();
      }
    } else {
      switch (field.key as DefaultTaskFieldKey) {
        case 'taskKey':
          schemaObject[field.key] = z.string().min(1, `${field.label} gereklidir.`);
          break;
        case 'taskType':
          if (field.options && field.options.length > 0) {
            schemaObject[field.key] = z.enum(field.options as [string, ...string[]], { required_error: `${field.label} seçilmelidir.` });
          } else {
            schemaObject[field.key] = z.enum(TASK_TYPES, { required_error: `${field.label} seçilmelidir.` });
          }
          break;
        case 'taskName':
          schemaObject[field.key] = z.string().min(1, `${field.label} gereklidir.`);
          break;
        case 'cityAdmin':
          schemaObject[field.key] = z.string().optional().nullable();
          break;
        case 'progress':
          schemaObject[field.key] = z.number().min(0).max(100);
          break;
        case 'status':
          if (field.options && field.options.length > 0) {
            schemaObject[field.key] = z.enum(field.options as [string, ...string[]], { required_error: `${field.label} seçilmelidir.` });
          } else {
            schemaObject[field.key] = z.enum(STATUS_OPTIONS, { required_error: `${field.label} seçilmelidir.` });
          }
          break;
        case 'analysisTestLink':
          schemaObject[field.key] = z.string().optional().or(z.literal(''));
          break;
        case 'progressNotes':
           schemaObject[field.key] = z.string().optional();
           break;
        default:
          schemaObject[field.key] = z.string().optional();
      }
    }
  });

  return z.object(schemaObject);
};


interface EditTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSave: (data: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'csvUpdatedAt'>, notesChanged: boolean) => void;
  allUsers: UserProfile[] | null;
  resolvedFieldConfiguration: FieldSetting[];
  resolvedStatusConfiguration: StatusSetting[];
  resolvedUiStrings: UiStrings;
}

type FormValues = z.infer<ReturnType<typeof createTaskFormSchema>>;

const isLikelyUrl = (str: string | undefined): boolean => {
    if (!str) return false;
    const s = str.toLowerCase();
    return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('www.');
};


export default function EditTaskModal({ 
  isOpen, 
  onClose, 
  task, 
  onSave, 
  allUsers, 
  resolvedFieldConfiguration,
  resolvedStatusConfiguration,
  resolvedUiStrings
}: EditTaskModalProps) {
  const { currentUser, userProfile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const notesTextareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  const [baseLinks, setBaseLinks] = React.useState<BaseLink[]>([]);
  const [cityAdminOptions, setCityAdminOptions] = React.useState<CityAdminValue[]>([]);
  const [globalSettings, setGlobalSettings] = React.useState<GlobalSettings | null>(null);

  const visibleModalFields = React.useMemo(() => {
    return resolvedFieldConfiguration.filter(f => f.visible).sort((a, b) => a.order - b.order);
  }, [resolvedFieldConfiguration]);

  const currentTaskFormSchema = React.useMemo(() => createTaskFormSchema(visibleModalFields), [visibleModalFields]);

  const form = useForm<FormValues>({
    resolver: zodResolver(currentTaskFormSchema),
  });

  const { watch, control, reset, setValue, getValues, formState: { touchedFields } } = form;

  const statusFieldConfig = visibleModalFields.find(f => f.key === 'status' && f.isDefault);
  const progressFieldConfig = visibleModalFields.find(f => f.key === 'progress' && f.isDefault);
  const cityAdminFieldConfig = visibleModalFields.find(f => f.key === 'cityAdmin' && f.isDefault);
  const taskTypeFieldConfig = visibleModalFields.find(f => f.key === 'taskType' && f.isDefault);

  const currentStatus = statusFieldConfig ? watch('status' as DefaultTaskFieldKey) : undefined;
  const currentProgress = progressFieldConfig ? watch('progress' as DefaultTaskFieldKey) : undefined;
  const currentCityAdminFieldValue = cityAdminFieldConfig ? watch('cityAdmin' as DefaultTaskFieldKey) : undefined;
  const currentTaskType = taskTypeFieldConfig ? watch('taskType' as DefaultTaskFieldKey) : undefined;

  const [isAddCityAdminDialogOpen, setIsAddCityAdminDialogOpen] = React.useState(false);
  const [newCityAdminName, setNewCityAdminName] = React.useState('');
  const [isSavingCityAdmin, setIsSavingCityAdmin] = React.useState(false);
  const [isDeletingCityAdmin, setIsDeletingCityAdmin] = React.useState(false);

  const [cityAdminToDelete, setCityAdminToDelete] = React.useState<CityAdminValue | null>(null);
  const [isDeleteCityAdminConfirmOpen, setIsDeleteCityAdminConfirmOpen] = React.useState(false);

  const [cityAdminComboboxOpen, setCityAdminComboboxOpen] = React.useState(false);
  const [selectFieldPopoverOpen, setSelectFieldPopoverOpen] = React.useState<Record<string, boolean>>({});
  
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [selectedAssignees, setSelectedAssignees] = React.useState<string[]>([]);
  const [currentTaskUserIds, setCurrentTaskUserIds] = React.useState<string[]>([]);

  const previousStatusRef = React.useRef<string | undefined>();
  
  React.useEffect(() => {
    const fetchModalData = async () => {
        try {
            const [linksSnap, cityAdminsSnap, settingsSnap] = await Promise.all([
                getDocs(query(collection(db, 'baseLinks'), orderBy('name', 'asc'))),
                getDocs(query(collection(db, 'cityAdmins'), orderBy('name', 'asc'))),
                getDoc(doc(db, 'global_settings', 'main')),
            ]);
            setBaseLinks(linksSnap.docs.map(d => ({ id: d.id, ...d.data() } as BaseLink)));
            setCityAdminOptions(cityAdminsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CityAdminValue)));
            setGlobalSettings(settingsSnap.exists() ? settingsSnap.data() as GlobalSettings : null);
        } catch (error) {
            console.error("Error fetching modal data:", error);
            toast({ variant: 'destructive', title: 'Hata', description: 'Modal için gerekli veriler yüklenemedi.' });
        }
    };
    
    if (isOpen) {
        fetchModalData();
    }
  }, [isOpen, toast]);

  const handleSelectFieldPopoverOpenChange = (fieldName: string, open: boolean) => {
    setSelectFieldPopoverOpen(prev => ({ ...prev, [fieldName]: open }));
  };

React.useEffect(() => {
    if (task && isOpen && !authLoading && currentUser) {
        const defaultValues: Record<string, any> = {};
        
        const userIds = task.id ? (task.userIds ?? []) : (task.userIds || [currentUser.uid]);
        setCurrentTaskUserIds(userIds);
        setSelectedAssignees(userIds);
        
        const getInitialValueForLink = (taskValue: string | undefined, taskBaseId: string | null | undefined): string => {
            return taskValue || '';
        };
        const notesRaw = task.progressNotes;
        let notesText: string;
        if (Array.isArray(notesRaw)) {
            notesText = notesRaw.map(n => n.content).join('\n');
        } else {
            notesText = notesRaw || '';
        }
        

        visibleModalFields.forEach(field => {
            if (field.isCustom) {
                defaultValues[field.key] = task.customFields?.[field.key] ?? (field.fieldType === 'slider' ? 0 : '');
            } else {
                switch (field.key as DefaultTaskFieldKey) {
                    case 'taskKey':
                        defaultValues[field.key] = getInitialValueForLink(task.taskKey, task.taskKeyBaseId);
                        break;
                    case 'analysisTestLink':
                        defaultValues[field.key] = getInitialValueForLink(task.analysisTestLink, task.analysisTestLinkBaseId);
                        break;
                    case 'progressNotes':
                        defaultValues[field.key] = notesText;
                        break;
                    case 'cityAdmin':
                        defaultValues[field.key] = task.cityAdmin || null;
                        break;
                    case 'taskType':
                        defaultValues[field.key] = task.taskType || (taskTypeFieldConfig?.options?.[0] || TASK_TYPES[0]);
                        break;
                    case 'status':
                        defaultValues[field.key] = task.status || (statusFieldConfig?.options?.[0] || STATUS_OPTIONS[0]);
                        break;
                    case 'progress':
                        defaultValues[field.key] = task.progress || 0;
                        break;
                    default:
                        defaultValues[field.key] = (task as any)[field.key] ?? (field.fieldType === 'slider' ? 0 : '');
                }
            }
        });
        reset(defaultValues);

        previousStatusRef.current = defaultValues.status;

        setSelectFieldPopoverOpen({});

    } else if (!isOpen) {
        const emptyDefaults: Record<string, any> = {};
        visibleModalFields.forEach(field => {
            if (field.isCustom) {
                emptyDefaults[field.key] = field.fieldType === 'slider' ? 0 : '';
            } else if (field.isDefault) {
                if (field.key === 'taskType') emptyDefaults[field.key] = (taskTypeFieldConfig?.options?.[0] || TASK_TYPES[0]);
                else if (field.key === 'status') emptyDefaults[field.key] = (statusFieldConfig?.options?.[0] || STATUS_OPTIONS[0]);
                else if (field.key === 'progress') emptyDefaults[field.key] = 0;
                else if (field.key === 'cityAdmin') emptyDefaults[field.key] = null;
                else if (field.key === 'progressNotes') emptyDefaults[field.key] = '';
                else emptyDefaults[field.key] = '';
            }
        });
        reset(emptyDefaults);
        setNewCityAdminName('');
        setIsAddCityAdminDialogOpen(false);
        setIsDeleteCityAdminConfirmOpen(false);
        setCityAdminToDelete(null);
        setSelectFieldPopoverOpen({});
        setCityAdminComboboxOpen(false);
        setIsAssignModalOpen(false);
        setSelectedAssignees([]);
        setCurrentTaskUserIds([]);
        previousStatusRef.current = undefined;
    }
}, [task, isOpen, reset, baseLinks, authLoading, visibleModalFields, taskTypeFieldConfig, statusFieldConfig, currentUser]);

  React.useEffect(() => {
    if (!statusFieldConfig || !progressFieldConfig) return;

    const completedStatus = resolvedStatusConfiguration.find(s => s.id === 'done')?.label || 'TAMAMLANDI';
    const inReviewStatus = resolvedStatusConfiguration.find(s => s.id === 'in-review')?.label || 'ONAYA SUNULDU';

    // Logic for Status -> Progress
    if (currentStatus === completedStatus) {
      if (currentProgress !== 100) setValue(progressFieldConfig.key as FieldPath<FormValues>, 100);
    } else if (currentStatus === inReviewStatus) {
      if (currentProgress !== 99) setValue(progressFieldConfig.key as FieldPath<FormValues>, 99);
    } else if (previousStatusRef.current === completedStatus && currentStatus !== completedStatus) {
      // This is the key change: if we are moving *away* from 'TAMAMLANDI'
      if (currentProgress === 100) setValue(progressFieldConfig.key as FieldPath<FormValues>, 99);
    }

    // Update the previous status ref for the next render
    previousStatusRef.current = currentStatus;

  }, [currentStatus, setValue, getValues, progressFieldConfig, statusFieldConfig, resolvedStatusConfiguration, currentProgress]);

  React.useEffect(() => {
    if (!statusFieldConfig || !progressFieldConfig || !touchedFields[progressFieldConfig.key as string]) return;

    const currentProgressValue = getValues(progressFieldConfig.key as FieldPath<FormValues>);
    const toDoStatus = resolvedStatusConfiguration.find(s => s.id === 'todo')?.label || 'YAPILACAK';
    const inProgressStatus = resolvedStatusConfiguration.find(s => s.id === 'in-progress')?.label || 'DEVAM EDİLİYOR';
    const completedStatus = resolvedStatusConfiguration.find(s => s.id === 'done')?.label || 'TAMAMLANDI';
    
    if (currentProgressValue === 100 && currentStatus !== completedStatus) {
      setValue(statusFieldConfig.key as FieldPath<FormValues>, completedStatus);
    } else if (currentProgressValue !== undefined && currentProgressValue > 0 && currentProgressValue < 100 && currentStatus === toDoStatus) {
      setValue(statusFieldConfig.key as FieldPath<FormValues>, inProgressStatus);
    }

  }, [currentProgress, setValue, getValues, statusFieldConfig, progressFieldConfig, touchedFields, resolvedStatusConfiguration, currentStatus]);

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const { value, selectionStart } = e.target;
    const prevValue = getValues('progressNotes') as string || '';

    // Handle Enter key press
    if (value.length > prevValue.length && value.substring(selectionStart - 1, selectionStart) === '\n') {
        const lineStart = value.lastIndexOf('\n', selectionStart - 2);
        const currentLine = value.substring(lineStart === -1 ? 0 : lineStart + 1, selectionStart - 1);
        if (currentLine.trim() === '•') { // User pressed enter on an empty bullet
            const newValue = value.substring(0, lineStart === -1 ? 0 : lineStart) + value.substring(selectionStart);
            setValue('progressNotes', newValue, { shouldValidate: true, shouldDirty: true });
            setTimeout(() => e.target.setSelectionRange(lineStart, lineStart), 0);
            return;
        }
    }
    
    // Process all lines to ensure they have bullets and capitalization
    const lines = value.split('\n');
    let cursorPosition = selectionStart;
    let changed = false;

    const newLines = lines.map((line, index) => {
        let newLine = line;
        // Add bullet if line has content but doesn't start with a bullet
        if (newLine.trim().length > 0 && !newLine.trim().startsWith('•')) {
            const originalLength = newLine.length;
            newLine = '• ' + newLine;
            changed = true;
            // Adjust cursor position only if it's on the current line
            if (value.substring(0, selectionStart).split('\n').length - 1 === index) {
                cursorPosition += (newLine.length - originalLength);
            }
        }
        
        // Capitalize first letter after bullet
        if (newLine.trim().startsWith('• ')) {
            const contentIndex = newLine.indexOf('• ') + 2;
            if (newLine.length > contentIndex) {
                const charAfterBullet = newLine.charAt(contentIndex);
                if (charAfterBullet !== charAfterBullet.toLocaleUpperCase('tr-TR')) {
                    newLine = newLine.substring(0, contentIndex) + charAfterBullet.toLocaleUpperCase('tr-TR') + newLine.substring(contentIndex + 1);
                    changed = true;
                }
            }
        }
        return newLine;
    });

    if (changed) {
        const finalValue = newLines.join('\n');
        setValue('progressNotes', finalValue, { shouldValidate: true, shouldDirty: true });
        setTimeout(() => e.target.setSelectionRange(cursorPosition, cursorPosition), 0);
    } else {
        setValue('progressNotes', value, { shouldValidate: true, shouldDirty: true });
    }
  };

  const onSubmitHandler = (values: FormValues) => {
    if (!currentUser || !userProfile || !task) return;

    const finalTaskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'csvUpdatedAt' | 'lastProgressNoteActorId' | 'creatorId'> & { creatorId: string, customFields: Record<string, any> } = {
      creatorId: task.creatorId || currentUser.uid,
      taskKey: '',
      taskType: (taskTypeFieldConfig?.options?.[0] || TASK_TYPES[0]) as TaskType,
      taskName: '',
      cityAdmin: '',
      progress: 0,
      status: (statusFieldConfig?.options?.[0] || STATUS_OPTIONS[0]) as Status,
      analysisTestLink: '',
      progressNotes: '',
      customFields: {},
      userIds: currentTaskUserIds, // Use the state for userIds
    };

    // Handle Progress Notes
    const notesRaw = task?.progressNotes;
    const originalNotes = Array.isArray(notesRaw) ? notesRaw.map(n => n.content).join('\n') : (notesRaw || '');
    const newNotes = values.progressNotes || '';
    let processedNotes = newNotes;
    const notesChanged = originalNotes !== newNotes;

    if (notesChanged) {
        const originalLines = originalNotes.split('\n').filter(line => line.trim() !== '');
        const newLines = newNotes.split('\n');
        const initials = `(${(userProfile.firstName?.[0] || '')}${(userProfile.lastName?.[0] || '')})`;
        const shouldAddInitials = currentTaskUserIds.length > 1;

        const updatedLines = newLines.map((line, index) => {
            const originalLine = originalLines[index];
            // If the line is new or has been changed, consider adding initials
            if (!originalLine || line !== originalLine) {
                // Avoid adding initials if they are already there or not needed
                if (shouldAddInitials && !/\s\([A-ZÇĞİÖŞÜ]{2}\)$/.test(line.trim())) {
                    return `${line.trim()} ${initials}`;
                }
            }
            return line;
        });

        // Add initials to brand new lines at the end if needed
        if (shouldAddInitials && newLines.length > originalLines.length) {
            for (let i = originalLines.length; i < newLines.length; i++) {
                 if (newLines[i].trim() !== '' && !/\s\([A-ZÇĞİÖŞÜ]{2}\)$/.test(newLines[i].trim())) {
                    updatedLines[i] = `${newLines[i].trim()} ${initials}`;
                }
            }
        }
        processedNotes = updatedLines.join('\n');
    }
    values.progressNotes = processedNotes;


    const processLinkField = (
      formInput: string | undefined,
      taskTypeForDefaults: TaskType,
      fieldType: 'taskKey' | 'analysisTestLink'
    ): { finalKey: string; baseIdToSave: string | null } => {
        let finalKey = (formInput || '').trim();
        let baseIdToSave: string | null = null;
    
        if (!finalKey) {
            return { finalKey: '', baseIdToSave: null };
        }
    
        if (baseLinks) {
            const sortedBaseLinks = [...baseLinks].sort((a, b) => b.url.length - a.url.length);
            for (const base of sortedBaseLinks) {
                if (base.url && finalKey.toLowerCase().startsWith(base.url.toLowerCase())) {
                    finalKey = finalKey.substring(base.url.length);
                    baseIdToSave = base.id;
                    return { finalKey, baseIdToSave };
                }
            }
        }
    
        if (!isLikelyUrl(finalKey)) {
            let defaultBaseIdToUse: string | null | undefined = null;
            if (fieldType === 'taskKey') {
                defaultBaseIdToUse = globalSettings?.defaultTaskKeyBaseLinkId;
            } else {
                if (taskTypeForDefaults === 'ANALİZ') {
                    defaultBaseIdToUse = globalSettings?.defaultAnalysisBaseLinkId;
                } else if (taskTypeForDefaults === 'TEST') {
                    defaultBaseIdToUse = globalSettings?.defaultTestBaseLinkId;
                }
            }
    
            if (defaultBaseIdToUse && baseLinks?.find(b => b.id === defaultBaseIdToUse)) {
                baseIdToSave = defaultBaseIdToUse;
            }
        }
    
        return { finalKey, baseIdToSave };
    };

    const taskTypeValue = values['taskType' as keyof FormValues] as TaskType;

    const { finalKey: finalTaskKey, baseIdToSave: taskKeyBaseIdToSave } = processLinkField(
      values['taskKey' as keyof FormValues] as string,
      taskTypeValue,
      'taskKey'
    );
    
    const { finalKey: finalAnalysisTestLink, baseIdToSave: analysisTestLinkBaseIdToSave } = processLinkField(
        values['analysisTestLink' as keyof FormValues] as string,
        taskTypeValue,
        'analysisTestLink'
    );


    for (const key in values) {
      const fieldConfig = visibleModalFields.find(f => f.key === key);
      if (fieldConfig) {
        if (fieldConfig.isCustom) {
          finalTaskData.customFields[key] = values[key as keyof FormValues];
        } else {
            (finalTaskData as any)[key] = values[key as keyof FormValues];
        }
      }
    }
    
    finalTaskData.taskKey = finalTaskKey;
    (finalTaskData as any).taskKeyBaseId = taskKeyBaseIdToSave;
    finalTaskData.analysisTestLink = finalAnalysisTestLink;
    (finalTaskData as any).analysisTestLinkBaseId = analysisTestLinkBaseIdToSave;
    finalTaskData.cityAdmin = finalTaskData.cityAdmin || '';
        
    onSave({
      ...finalTaskData,
      userIds: currentTaskUserIds,
    }, notesChanged);
  };

  const handleSaveNewCityAdmin = async () => {
    if (!currentUser || !newCityAdminName.trim()) {
      toast({ variant: 'destructive', title: "Hata!", description: 'Şehir/İdare adı boş olamaz.' });
      return;
    }
    if (cityAdminOptions?.some(opt => opt.name.toLowerCase() === newCityAdminName.trim().toLowerCase())) {
      toast({ variant: 'destructive', title: "Hata!", description: 'Bu Şehir/İdare adı zaten mevcut.' });
      return;
    }
    setIsSavingCityAdmin(true);
    try {
      const docRef = await addDoc(collection(db, 'cityAdmins'), {
        name: toTitleCase(newCityAdminName.trim()),
        createdAt: new Date(),
      });
      toast({ title: "Başarılı", description: 'Yeni Şehir/İdare seçeneği eklendi.' });
      if (cityAdminFieldConfig) {
        setValue(cityAdminFieldConfig.key as FieldPath<FormValues>, toTitleCase(newCityAdminName.trim()), { shouldValidate: true });
      }
      setNewCityAdminName('');
      setIsAddCityAdminDialogOpen(false);
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Hata!", description: `Seçenek eklenirken sorun: ${error.message}` });
    } finally {
      setIsSavingCityAdmin(false);
    }
  };

  const handleDeleteCityAdminTrigger = (option: CityAdminValue, event?: React.MouseEvent) => {
    event?.stopPropagation();
    event?.preventDefault();
    setCityAdminToDelete(option);
    setIsDeleteCityAdminConfirmOpen(true);
  };

  const confirmDeleteSelectedCityAdmin = async () => {
    if (!currentUser || !cityAdminToDelete) return;

    setIsDeletingCityAdmin(true);
    try {
      const tasksQuery = query(collection(db, 'tasks'), where('cityAdmin', '==', cityAdminToDelete.name));
      const tasksSnapshot = await getDocs(tasksQuery);
      if (!tasksSnapshot.empty) {
        toast({
          variant: 'destructive',
          title: "Hata!",
          description: `'${cityAdminToDelete.name}' seçeneği bazı görevlerde kullanıldığı için silinemaz. Lütfen önce ilgili görevleri güncelleyin.`
        });
        setIsDeleteCityAdminConfirmOpen(false);
        setCityAdminToDelete(null);
        setIsDeletingCityAdmin(false);
        return;
      }

      await deleteDoc(doc(db, 'cityAdmins', cityAdminToDelete.id));
      toast({ title: "Başarılı", description: `'${cityAdminToDelete.name}' seçeneği silindi.` });

      if (cityAdminFieldConfig && currentCityAdminFieldValue === cityAdminToDelete.name) {
        setValue(cityAdminFieldConfig.key as FieldPath<FormValues>, null, { shouldValidate: true });
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: "Hata!", description: `Seçenek silinirken sorun: ${error.message}` });
    } finally {
      setIsDeletingCityAdmin(false);
      setIsDeleteCityAdminConfirmOpen(false);
      setCityAdminToDelete(null);
    }
  };

  const handleLinkInputBlur = (e: React.FocusEvent<HTMLInputElement>, fieldName: FieldPath<FormValues>) => {
    const value = e.target.value.trim();
    if (baseLinks) {
        const sortedBaseLinks = [...baseLinks].sort((a, b) => b.url.length - a.url.length);
        for (const base of sortedBaseLinks) {
            if (base.url && value.toLowerCase().startsWith(base.url.toLowerCase())) {
                const newKey = value.substring(base.url.length);
                setValue(fieldName, newKey, { shouldValidate: true, shouldDirty: true });
                return;
            }
        }
    }
  };

  const getInitials = (user?: UserProfile) => {
    if (!user) return '?';
    if (user.status === 'inactive') return 'P';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };
  
  const sortedUsersForList = React.useMemo(() => {
    if (!allUsers) return [];
    // Use hideFromTaskAssignment for assignment lists
    const visibleUsers = allUsers.filter(u => !u.hideFromTaskAssignment);
    const activeUsers = visibleUsers.filter(u => (u.status || 'active') === 'active');
    const inactiveUsers = visibleUsers.filter(u => u.status === 'inactive');
    
    const sortFn = (a: UserProfile, b: UserProfile) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr');

    return [...activeUsers.sort(sortFn), ...inactiveUsers.sort(sortFn)];
  }, [allUsers]);

  const handleAssignConfirm = () => {
    setCurrentTaskUserIds(selectedAssignees);
    setIsAssignModalOpen(false);
  };


  const getFieldComponent = (fieldConfig: FieldSetting) => {
    const fieldName = fieldConfig.key;

    if (fieldConfig.isCustom) {
      switch (fieldConfig.fieldType) {
        case 'slider':
          return (
            <FormField
              key={fieldConfig.key}
              control={control}
              name={fieldName as FieldPath<FormValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-left">{fieldConfig.label} (%{String(field.value || 0)}%)</FormLabel>
                  <FormControl>
                    <Slider
                      value={[typeof field.value === 'number' ? field.value : 0]}
                      onValueChange={(value) => field.onChange(value[0])}
                      max={100}
                      step={5}
                      className="my-3"
                      aria-label={fieldConfig.label}
                    />
                  </FormControl>
                  <FormMessage className="text-left" />
                </FormItem>
              )}
            />
          );
        case 'textarea':
          return (
            <FormField
              key={fieldConfig.key}
              control={control}
              name={fieldName as FieldPath<FormValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-left">{fieldConfig.label}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={fieldConfig.label}
                      {...field}
                      value={field.value || ''}
                      className="text-left placeholder:text-left border-input focus:border-primary min-h-[100px] resize-none"
                    />
                  </FormControl>
                  <FormMessage className="text-left" />
                </FormItem>
              )}
            />
          );
        case 'select':
          return (
            <FormField
              key={fieldConfig.key}
              control={control}
              name={fieldName as FieldPath<FormValues>}
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="text-left mb-1">{fieldConfig.label}</FormLabel>
                  <Popover open={selectFieldPopoverOpen[fieldName] || false} onOpenChange={(open) => handleSelectFieldPopoverOpenChange(fieldName, open)}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={selectFieldPopoverOpen[fieldName] || false}
                          className={cn(
                            "w-full justify-between text-left border-input focus:border-primary",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                           <span className="flex-1 text-left truncate">
                            {field.value ? String(field.value) : `Seçiniz... (${fieldConfig.label})`}
                           </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder={`${fieldConfig.label} ara...`} />
                        <CommandList>
                          <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
                          <CommandGroup>
                            {(fieldConfig.options || []).map((option) => (
                              <CommandItem
                                value={option}
                                key={option}
                                onSelect={() => {
                                  setValue(fieldName as FieldPath<FormValues>, option, { shouldValidate: true });
                                  handleSelectFieldPopoverOpenChange(fieldName, false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    option === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {option}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage className="text-left" />
                </FormItem>
              )}
            />
          );
        case 'text':
        default:
          return (
            <FormField
              key={fieldConfig.key}
              control={control}
              name={fieldName as FieldPath<FormValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-left">{fieldConfig.label}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={fieldConfig.label}
                      {...field}
                      value={field.value || ''}
                      className="text-left placeholder:text-left border-input focus:border-primary"
                    />
                  </FormControl>
                  <FormMessage className="text-left" />
                </FormItem>
              )}
            />
          );
      }
    }

    switch (fieldConfig.fieldType) {
      case 'text':
        if (fieldConfig.key === 'taskKey' || fieldConfig.key === 'analysisTestLink') {
           const isAnalysisTestLink = fieldConfig.key === 'analysisTestLink';
           let label = fieldConfig.label;
           let placeholder = "URL veya anahtar girin";
           let description = resolvedUiStrings.edit_task_modal_desc_task_key;

          return (
            <FormField
              key={fieldConfig.key}
              control={control}
              name={fieldName as FieldPath<FormValues>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-left">{label}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={placeholder}
                      {...field}
                       onBlur={(e) => handleLinkInputBlur(e, fieldName as FieldPath<FormValues>)}
                       className="text-left placeholder:text-left border-input focus:border-primary"
                    />
                  </FormControl>
                  <FormFieldDescription className="text-left">
                     {description}
                  </FormFieldDescription>
                  <FormMessage className="text-left" />
                </FormItem>
              )}
            />
          );
        }
        return (
          <FormField
            key={fieldConfig.key}
            control={control}
            name={fieldName as FieldPath<FormValues>}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-left">{fieldConfig.label}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={fieldConfig.label}
                    {...field}
                    onChange={(e) => {
                        let value = e.target.value;
                        if (fieldConfig.key === 'taskName') {
                            value = toTitleCase(value);
                        } else if (fieldConfig.key === 'taskKey') {
                            value = value.toLocaleUpperCase('tr-TR');
                        }
                        field.onChange(value);
                    }}
                    value={field.value || ''}
                    className="text-left placeholder:text-left border-input focus:border-primary"
                  />
                </FormControl>
                {fieldConfig.key === 'taskKey' && <FormFieldDescription className="text-left">{resolvedUiStrings.edit_task_modal_desc_task_key}</FormFieldDescription>}
                <FormMessage className="text-left" />
              </FormItem>
            )}
          />
        );
      case 'select':
        const options = fieldConfig.options && fieldConfig.options.length > 0 ? fieldConfig.options : (fieldConfig.key === 'taskType' ? TASK_TYPES : (fieldConfig.key === 'status' ? STATUS_OPTIONS : []));
        return (
          <FormField
            key={fieldConfig.key}
            control={control}
            name={fieldName as FieldPath<FormValues>}
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="text-left mb-1">{fieldConfig.label}</FormLabel>
                <Popover open={selectFieldPopoverOpen[fieldName] || false} onOpenChange={(open) => handleSelectFieldPopoverOpenChange(fieldName, open)}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={selectFieldPopoverOpen[fieldName] || false}
                        className={cn(
                          "w-full justify-between text-left border-input focus:border-primary",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        <span className="flex-1 text-left truncate">
                         {field.value ? String(field.value) : `Seçiniz... (${fieldConfig.label})`}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder={`${fieldConfig.label} ara...`} />
                      <CommandList>
                        <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
                        <CommandGroup>
                          {options.map((opt) => (
                            <CommandItem
                              value={opt}
                              key={opt}
                              onSelect={() => {
                                setValue(fieldName as FieldPath<FormValues>, opt, { shouldValidate: true });
                                handleSelectFieldPopoverOpenChange(fieldName, false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  opt === field.value
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                                />
                              {opt}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage className="text-left" />
              </FormItem>
            )}
          />
        );
      case 'combobox': 
        return (
          <FormField
            key={fieldConfig.key}
            control={control}
            name={fieldName as FieldPath<FormValues>}
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <div className="flex items-center justify-between mb-1">
                  <FormLabel className="text-left">{fieldConfig.label}</FormLabel>
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsAddCityAdminDialogOpen(true)} className="px-2 py-1 h-auto text-xs">
                      <PlusCircle className="mr-1 h-3 w-3" /> {resolvedUiStrings.edit_task_modal_button_add_new_city_admin}
                  </Button>
                </div>
                <Popover open={cityAdminComboboxOpen} onOpenChange={setCityAdminComboboxOpen}>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={cityAdminComboboxOpen}
                        className={cn(
                          "w-full justify-between text-left border-input focus:border-primary",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={authLoading}
                      >
                        {authLoading ? (
                          "Yükleniyor..."
                        ) : (
                          <>
                            <span className="flex-1 text-left truncate">
                              {field.value
                                ? (cityAdminOptions?.find((option) => option.name === field.value)?.name || String(field.value))
                                : resolvedUiStrings.edit_task_modal_combobox_placeholder_city_admin
                              }
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </>
                        )}
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder={`${fieldConfig.label} ara...`} />
                      <CommandList className="max-h-[150px] overflow-auto">
                        <CommandEmpty>{resolvedUiStrings.edit_task_modal_combobox_empty_city_admin}</CommandEmpty>
                        <CommandGroup>
                           {(cityAdminOptions || []).map((option) => (
                            <CommandItem
                              value={option.name}
                              key={option.id}
                              onSelect={() => {
                                setValue(fieldName as FieldPath<FormValues>, option.name, { shouldValidate: true });
                                setCityAdminComboboxOpen(false);
                              }}
                              className="flex justify-between items-center group"
                            >
                              <div className="flex items-center">
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    option.name === field.value
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                                {option.name}
                              </div>
                              <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 ml-auto opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80"
                                  onClick={(e) => handleDeleteCityAdminTrigger(option, e)}
                                  aria-label={resolvedUiStrings.edit_task_modal_combobox_aria_label_delete_city_admin.replace('{name}', option.name)}
                                  disabled={isSavingCityAdmin || isDeletingCityAdmin}
                              >
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                            </CommandItem>
                          ))}
                          {!authLoading && (!cityAdminOptions || cityAdminOptions.length === 0) && (
                            <div className="p-2 text-sm text-muted-foreground text-center">Önce seçenek oluşturun.</div>
                          )}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <FormMessage className="text-left" />
              </FormItem>
            )}
          />
        );
      case 'slider':
        return (
          <FormField
            key={fieldConfig.key}
            control={control}
            name={fieldName as FieldPath<FormValues>}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-left">{resolvedUiStrings.edit_task_modal_label_progress_with_value.replace('{value}', String(field.value || 0))}</FormLabel>
                <FormControl>
                  <Slider
                    value={[typeof field.value === 'number' ? field.value : 0]}
                    onValueChange={(value) => field.onChange(value[0])}
                    max={100}
                    step={5}
                    className="my-3"
                    aria-label={resolvedUiStrings.edit_task_modal_aria_label_progress_slider}
                  />
                </FormControl>
                <FormMessage className="text-left" />
              </FormItem>
            )}
          />
        );
      case 'textarea':
        return (
           <FormField
                key={fieldConfig.key}
                control={control}
                name={fieldName as FieldPath<FormValues>}
                render={({ field }) => (
                    <FormItem>
                        <div className="flex justify-between items-center mb-1">
                            <FormLabel className="flex items-center text-left">
                                <StickyNote className="mr-2 h-4 w-4 text-muted-foreground" /> {fieldConfig.label}
                            </FormLabel>
                            {task?.updatedAt && task.updatedAt instanceof Timestamp && (
                            <TooltipProvider>
                                <Tooltip>
                                <TooltipTrigger asChild>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <CalendarDays className="h-3 w-3"/>
                                            {new Date(task.updatedAt.toDate()).toLocaleString('tr-TR')}
                                        </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{resolvedUiStrings.edit_task_modal_label_progress_notes_timestamp_tooltip.replace('{timestamp}', new Date(task.updatedAt.toDate()).toLocaleString('tr-TR'))}</p>
                                </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                            )}
                        </div>
                        <FormControl>
                          <Textarea
                            placeholder={resolvedUiStrings.edit_task_modal_placeholder_new_progress_note}
                            className="min-h-[200px] resize-none"
                            {...field}
                            ref={notesTextareaRef}
                            onChange={handleNotesChange}
                          />
                        </FormControl>
                        <FormMessage className="text-left" />
                    </FormItem>
                )}
            />
        );
      default:
        return null;
    }
  };

  const column1Fields: FieldSetting[] = [];
  const column2Fields: FieldSetting[] = [];

  visibleModalFields.forEach(fieldConfig => {
    if (fieldConfig.modalColumn === 'left') {
      column1Fields.push(fieldConfig);
    } else {
      column2Fields.push(fieldConfig);
    }
  });

  column1Fields.sort((a, b) => a.order - b.order);
  column2Fields.sort((a, b) => a.order - b.order);


  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          className="w-full max-w-lg md:max-w-2xl lg:max-w-4xl xl:max-w-6xl max-h-[90vh] overflow-y-auto p-6 bg-background shadow-lg sm:rounded-lg border-border"
        >
          <DialogHeader>
            <DialogTitle>
              {task?.id && task.id !== '' ? resolvedUiStrings.edit_task_modal_title_edit : resolvedUiStrings.edit_task_modal_title_add}
            </DialogTitle>
            <DialogDescription>
              {task?.id && task.id !== '' ? resolvedUiStrings.edit_task_modal_desc_edit : resolvedUiStrings.edit_task_modal_desc_add}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitHandler)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0">
                <div className="space-y-4">
                  {column1Fields.map(fieldConfig => (
                    <div key={fieldConfig.key} className="py-2">
                      {getFieldComponent(fieldConfig)}
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  {column2Fields.map(fieldConfig => (
                    <div key={fieldConfig.key} className="py-2">
                      {getFieldComponent(fieldConfig)}
                    </div>
                  ))}
                  <div className="py-2">
                      <FormLabel className="text-left">Atananlar</FormLabel>
                      <div className="flex items-center gap-2 mt-2">
                          <div className="flex items-center -space-x-2">
                              {currentTaskUserIds.map(uid => {
                                  const user = allUsers?.find(u => u.uid === uid);
                                  const isUserAvailable = user && user.status !== 'inactive';
                                  return (
                                      <TooltipProvider key={uid}>
                                          <Tooltip>
                                              <TooltipTrigger asChild>
                                                    <div className="relative">
                                                        <Avatar className="h-8 w-8 border-2 border-card">
                                                            <AvatarImage src={user?.photoURL} />
                                                            <AvatarFallback className={!isUserAvailable ? 'bg-muted text-muted-foreground' : ''}>
                                                                {getInitials(user)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                    </div>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                {isUserAvailable ? `${user.firstName} ${user.lastName}` : 'Kullanıcı Pasif'}
                                              </TooltipContent>
                                          </Tooltip>
                                      </TooltipProvider>
                                  )
                              })}
                               {currentTaskUserIds.length === 0 && <span className="text-xs text-muted-foreground pl-2">Atanmamış</span>}
                          </div>
                           <Button type="button" variant="outline" size="sm" onClick={() => setIsAssignModalOpen(true)}>
                              <Users className="mr-2 h-4 w-4" /> Ata / Değiştir
                          </Button>
                      </div>
                  </div>
                </div>
              </div>
              <DialogFooter className="pt-6 flex flex-col-reverse sm:flex-row justify-end gap-2">
                <Button type="button" variant="outline" onClick={onClose} className="border-input hover:bg-accent hover:text-accent-foreground">
                  İptal
                </Button>
                <Button type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Save className="mr-2 h-4 w-4" /> Kaydet
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
              <DialogTitle>Görev Ata / Değiştir</DialogTitle>
              <DialogDescription>
                Görevi kimlere atamak istersiniz?
              </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Command>
              <CommandInput placeholder="Kullanıcı ara..." />
              <CommandList className="max-h-[300px]">
                <CommandEmpty>Kullanıcı bulunamadı.</CommandEmpty>
                <CommandGroup>
                  {sortedUsersForList.map((user) => {
                        const isCreator = currentUser?.uid === task?.creatorId;
                        const isSelf = user.uid === currentUser?.uid;
                        const isAssigned = selectedAssignees.includes(user.uid);
                        
                        let isDisabled = user.status === 'inactive';
                        let canUncheck = true;

                        if (!isCreator) {
                            if(isAssigned && !isSelf) {
                                canUncheck = false;
                            }
                            if(isSelf && task && task.userIds.length <= 1) {
                                canUncheck = false;
                            }
                        }

                        return (
                        <CommandItem
                          key={user.uid}
                           onSelect={() => {
                            if (isDisabled) return;
                            if (isAssigned && !canUncheck) {
                                toast({ title: "Yetkiniz Yok", description: "Yalnızca görevi oluşturan kişi veya kullanıcının kendisi atamayı kaldırabilir." });
                                return;
                            }
                            if (isAssigned && isSelf && task && task.userIds.length <= 1) {
                                toast({ title: "İşlem Engellendi", description: "Görevin son atananı olarak kendinizi kaldıramazsınız. Görevi silmeniz gerekir." });
                                return;
                            }

                            setSelectedAssignees((prev) =>
                                prev.includes(user.uid)
                                    ? prev.filter((uid) => uid !== user.uid)
                                    : [...prev, user.uid]
                            );
                          }}
                          className={cn("flex items-center justify-between", isDisabled && "text-muted-foreground cursor-not-allowed")}
                        >
                          <span className="flex items-center gap-2">
                            {user.firstName} {user.lastName} {user.status === 'inactive' && '(Pasif)'}
                          </span>
                          <Checkbox
                            checked={selectedAssignees.includes(user.uid)}
                            disabled={isDisabled || (isAssigned && !canUncheck)}
                            aria-hidden="true"
                            tabIndex={-1}
                          />
                        </CommandItem>
                        );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSelectedAssignees(currentTaskUserIds);
              setIsAssignModalOpen(false);
            }}>İptal</Button>
            <Button onClick={handleAssignConfirm}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
    </Dialog>
    
      <Dialog open={isAddCityAdminDialogOpen} onOpenChange={setIsAddCityAdminDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resolvedUiStrings.edit_task_modal_add_city_admin_title}</DialogTitle>
            <DialogDescription>
            {resolvedUiStrings.edit_task_modal_add_city_admin_desc}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 pb-4">
              <div className="space-y-2">
              <ShadCnLabel htmlFor="new-city-admin-name">{resolvedUiStrings.edit_task_modal_add_city_admin_label}</ShadCnLabel>
              <Input
                  id="new-city-admin-name"
                  value={newCityAdminName}
                  onChange={(e) => setNewCityAdminName(e.target.value)}
                  placeholder={resolvedUiStrings.edit_task_modal_add_city_admin_placeholder}
              />
              </div>
          </div>
          <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsAddCityAdminDialogOpen(false); setNewCityAdminName(''); }}>İptal</Button>
              <Button type="button" onClick={handleSaveNewCityAdmin} disabled={isSavingCityAdmin || !newCityAdminName.trim()}>
              {isSavingCityAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Kaydet
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteCityAdminConfirmOpen} onOpenChange={setIsDeleteCityAdminConfirmOpen}>
          <DialogContent>
          <DialogHeader>
              <DialogTitle>{resolvedUiStrings.edit_task_modal_delete_city_admin_title}</DialogTitle>
              <DialogDescription>
              {resolvedUiStrings.edit_task_modal_delete_city_admin_desc.replace('{name}', cityAdminToDelete?.name || '')}
              </DialogDescription>
          </DialogHeader>
          <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDeleteCityAdminConfirmOpen(false); setCityAdminToDelete(null); }}>İptal</Button>
              <Button
              variant="destructive"
              onClick={confirmDeleteSelectedCityAdmin}
              disabled={isDeletingCityAdmin}
              >
              {isDeletingCityAdmin && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Evet, Sil
              </Button>
          </DialogFooter>
          </DialogContent>
      </Dialog>
    </>
  );
}
