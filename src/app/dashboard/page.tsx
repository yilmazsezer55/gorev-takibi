

'use client';

import * as React from 'react';
import { Edit2, PlusCircle, Loader2, Link as LinkIcon, CalendarDays, Users, RefreshCw, UploadCloud, ExternalLink, Trash2, Columns, ArrowUp, ArrowDown, ArrowUpDown, ChevronDown, CheckCheck, Info, TestTube2, Printer, ClipboardCheck, FileDown, User as UserIconFromAuth, Briefcase } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import EditTaskModal from '@/components/edit-task-modal';
import ImportPreviewModal from '@/components/import-preview-modal';
import type { Task, Status, TaskType, FieldSetting, ProcessedRow, StatusSetting, UserProfile, ProgressNoteEntry, BaseLink, CityAdminValue, UiStrings, GlobalSettings } from '@/types';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, arrayUnion, writeBatch, setDoc, getDoc, collectionGroup, arrayRemove, Timestamp, orderBy } from 'firebase/firestore';
import { useRouter, usePathname } from 'next/navigation';
import AppHeader from '@/components/header';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from '@/components/ui/card';
import { syncJiraStatus } from '@/app/actions/syncJiraStatus';
import { syncAllJiraTasks } from '@/app/actions/syncAllJiraTasks';
import Papa from 'papaparse';
import ScrollToTopButton from '@/components/scroll-to-top-button';
import * as XLSX from 'xlsx';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useTaskStore } from '@/contexts/task-store';
import { idb } from '@/lib/idb';


const AllLucideIcons = LucideIcons as unknown as { [key: string]: React.ElementType };

const StatusIcon = ({ status, statusConfig }: { status: string, statusConfig: StatusSetting | undefined }) => {
    if (!statusConfig) {
        return <LucideIcons.HelpCircle className="h-4 w-4 text-gray-500" aria-label={status} />;
    }
    const IconComponent = AllLucideIcons[statusConfig.icon];
    if (!IconComponent) {
        return <LucideIcons.HelpCircle className="h-4 w-4 text-gray-500" aria-label={status} />;
    }
    return <IconComponent className={`h-4 w-4 ${statusConfig.color}`} aria-label={status} />;
};


const isLikelyUrl = (str: string | undefined): boolean => {
  if (!str) return false;
  const s = str.toLowerCase();
  return s.startsWith('http://') || s.startsWith('https://') || s.startsWith('www.');
};

const ensureProtocol = (url: string): string => {
  if (!url) return '#';
  if (url.startsWith('www.')) {
    return `https://${url}`;
  }
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return '#'; 
};

const TASKS_TO_SHOW_INITIALLY = 5;

const getLatestTimestamp = (task: Task): number => {
    const convertToMillis = (ts: any): number => {
        if (ts instanceof Timestamp) {
            return ts.toMillis();
        }
        if (ts && typeof ts === 'object' && 'seconds' in ts) {
             return new Timestamp(ts.seconds, ts.nanoseconds).toMillis();
        }
        return 0;
    }
    const updatedAtMillis = convertToMillis(task.updatedAt);
    const createdAtMillis = convertToMillis(task.createdAt);
    
    return Math.max(updatedAtMillis, createdAtMillis);
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


function MyTasksPageContent() {
  const { currentUser, userProfile, globalSettings, resolvedFieldConfiguration, resolvedStatusConfiguration, resolvedStatusMappings, resolvedUiStrings, allUsers: allUsersFromAuth, refreshAuthData } = useAuth();
  const { tasks, isLoading, loadMyTasks, removeTasks } = useTaskStore();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  
  const [allUsers, setAllUsers] = React.useState<UserProfile[] | null>(allUsersFromAuth);
  const [baseLinks, setBaseLinks] = React.useState<BaseLink[] | null>(null);
  const [cityAdminOptions, setCityAdminOptions] = React.useState<CityAdminValue[] | null>(null);


  const [taskToDelete, setTaskToDelete] = React.useState<Task | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = React.useState(false);
  const [syncingTaskId, setSyncingTaskId] = React.useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = React.useState(false);
  const [csvFile, setCsvFile] = React.useState<File | null>(null);


  const [isAdjustingWidths, setIsAdjustingWidths] = React.useState(false);
  const [isSavingWidths, setIsSavingWidths] = React.useState(false);
  
  const [expandedStatuses, setExpandedStatuses] = React.useState<Record<string, boolean>>({});

  const [taskToAssign, setTaskToAssign] = React.useState<Task | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [selectedAssignees, setSelectedAssignees] = React.useState<string[]>([]);
  
  const fetchData = React.useCallback(async (force = false) => {
    if (!currentUser) return;
    await loadMyTasks(currentUser.uid, force);
  }, [currentUser, loadMyTasks]);

  React.useEffect(() => {
    if (currentUser) {
        fetchData();
    }
  }, [currentUser, fetchData]);

  React.useEffect(() => {
    setAllUsers(allUsersFromAuth);
  }, [allUsersFromAuth]);

  // This effect remains to fetch non-task related data.
  React.useEffect(() => {
    if (!currentUser) return;
    const fetchOtherData = async () => {
        try {
            const [linksSnap, cityAdminsSnap] = await Promise.all([
                getDocs(query(collection(db, 'baseLinks'), orderBy('name', 'asc'))),
                getDocs(query(collection(db, 'cityAdmins'), orderBy('name', 'asc'))),
            ]);
            setBaseLinks(linksSnap.docs.map(d => ({ id: d.id, ...d.data() } as BaseLink)));
            setCityAdminOptions(cityAdminsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CityAdminValue)));
        } catch (error) {
            console.error("Error fetching links/cityAdmins:", error);
            toast({ variant: "destructive", title: "Hata!", description: "Ek veriler yüklenemedi." });
        }
    };
    fetchOtherData();
  }, [currentUser, toast]);


  const visibleTableFields = React.useMemo(() => {
    return resolvedFieldConfiguration.filter(f => f.visible).sort((a,b) => a.order - b.order);
  }, [resolvedFieldConfiguration]);
  
  const statusOptions = React.useMemo(() => resolvedStatusConfiguration.map(s => s.label), [resolvedStatusConfiguration]);


  const [columnWidths, setColumnWidths] = React.useState<Record<string, number | string>>({});
  const resizingRef = React.useRef<{
    fieldKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const tableRef = React.useRef<HTMLTableElement>(null);
  
  React.useEffect(() => {
    const initialWidths: Record<string, string> = {};
    visibleTableFields.forEach(field => {
        if(field.width) {
            initialWidths[field.key] = field.width;
        }
    });
    setColumnWidths(initialWidths);
  }, [visibleTableFields]);

  const handleMouseDown = React.useCallback((e: React.MouseEvent<HTMLDivElement>, fieldKey: string) => {
    e.preventDefault();
    const th = e.currentTarget.closest('th');
    if (!th) return;

    resizingRef.current = {
      fieldKey,
      startX: e.clientX,
      startWidth: th.offsetWidth,
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { fieldKey, startX, startWidth } = resizingRef.current;
    const newWidth = startWidth + (e.clientX - startX);
    if (newWidth > 75) { // Minimum width
      setColumnWidths(prev => ({ ...prev, [fieldKey]: newWidth }));
    }
  }, []);

  const handleMouseUp = React.useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const tasksByTaskKeyMap = React.useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach(task => {
      if (task.taskKey) {
        map.set(task.taskKey, task);
      }
    });
    return map;
  }, [tasks]);


  const handleEdit = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleAddNewTask = () => {
    if (!currentUser) {
        toast({ variant: "destructive", title: "Hata!", description: "Yeni görev eklemek için giriş yapmalısınız." });
        router.push('/login');
        return;
    }
    
    const taskTypeField = resolvedFieldConfiguration.find(f => f.key === 'taskType');
    const firstStatusOption = resolvedStatusConfiguration[0]?.label || 'YAPILACAK';

    const defaultTaskValues: Partial<Task> & { customFields: Record<string, any> } = {
      creatorId: currentUser.uid,
      userIds: [currentUser.uid],
      progress: 0,
      status: firstStatusOption,
      taskType: taskTypeField?.options?.[0] || 'ANALİZ',
      history: [],
      progressNotes: '',
      createdAt: serverTimestamp() as Timestamp, 
      updatedAt: serverTimestamp() as Timestamp,
      customFields: {},
    };

    resolvedFieldConfiguration.forEach(field => {
      if (field.isDefault) {
        switch (field.key) {
            case 'taskKey': defaultTaskValues.taskKey = ''; break;
            case 'taskName': defaultTaskValues.taskName = ''; break;
            case 'cityAdmin': defaultTaskValues.cityAdmin = cityAdminOptions && cityAdminOptions.length > 0 ? cityAdminOptions[0].name : ''; break;
            case 'analysisTestLink': defaultTaskValues.analysisTestLink = ''; break;
        }
      } else if (field.isCustom) {
        defaultTaskValues.customFields[field.key] = '';
      }
    });


    setSelectedTask(defaultTaskValues as Task);
    setIsModalOpen(true);
  };


  const handleCloseModal = () => {
    setSelectedTask(null);
    setIsModalOpen(false);
  };

  const handleSaveTask = async (updatedTaskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'history' | 'csvUpdatedAt'>, notesChanged: boolean) => {
    if (!currentUser || !userProfile || !selectedTask) { 
      toast({ variant: "destructive", title: "Hata!", description: "İşlem yapmak için giriş yapmalısınız veya profil bilgileri yüklenemedi." });
      return;
    }

    const { ...dataFromForm } = selectedTask ? { ...selectedTask, ...updatedTaskData } : updatedTaskData;
    
    const dataToSave: Record<string, any> = { ...dataFromForm };
    if (notesChanged) {
        dataToSave.lastProgressNoteActorId = currentUser.uid;
    }

    const batch = writeBatch(db);
    
    try {
      if (selectedTask && selectedTask.id && selectedTask.id !== '') { 
        const taskDocRef = doc(db, 'tasks', selectedTask.id);
        
        batch.update(taskDocRef, {
          ...dataToSave,
          updatedAt: serverTimestamp(),
          history: arrayUnion({
              action: 'updated',
              details: `Görev ${userProfile.firstName} tarafından güncellendi.`,
              timestamp: new Date(),
              actorId: currentUser.uid,
          }),
        });
        toast({ title: "Başarılı", description: "Görev güncellendi." });
      } else { 
        const newDocRef = doc(collection(db, 'tasks'));
        batch.set(newDocRef, {
          ...dataToSave,
          creatorId: currentUser.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          history: [{
            action: 'created',
            details: `Görev ${userProfile.firstName} tarafından oluşturuldu.`,
            timestamp: new Date(),
            actorId: currentUser.uid,
          }],
        });
        toast({ title: "Başarılı", description: "Yeni görev eklendi." });
      }
      
      await batch.commit().catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
              path: `batch write (tasks)`,
              operation: 'write',
              requestResourceData: { taskData: dataToSave },
          });
          errorEmitter.emit('permission-error', permissionError);
          // Rethrow to be caught by outer catch block
          throw serverError;
      });

      handleCloseModal();
      await fetchData();
    } catch (error) {
      console.error("Error saving task: ", error);
      // Avoid showing generic toast if a specific permission error was emitted
      if (!(error instanceof FirestorePermissionError)) {
          toast({ variant: "destructive", title: "Hata!", description: "Görev kaydedilirken bir sorun oluştu." });
      }
    }
  };

  const handleDeleteTask = async (task: Task) => {
    if (!currentUser || !userProfile) {
        toast({ variant: "destructive", title: "Hata!", description: "İşlem yapmak için giriş yapmalısınız." });
        return;
    }

    const latestTaskDoc = await getDoc(doc(db, 'tasks', task.id));
    if (!latestTaskDoc.exists()) {
        toast({ variant: "destructive", title: "Hata!", description: "Görev zaten silinmiş veya bulunamadı." });
        await removeTasks([task.id]);
        return;
    }

    const latestTaskData = latestTaskDoc.data();
    const canDelete = latestTaskData.creatorId === currentUser.uid || (latestTaskData.userIds && latestTaskData.userIds.includes(currentUser.uid));

    if (!canDelete) {
        toast({
            variant: "destructive",
            title: "Yetki Hatası",
            description: "Bu görevi silme yetkiniz yok. Yalnızca görevi oluşturan veya göreve atanmış kullanıcılar silebilir.",
        });
        return;
    }
    
    setTaskToDelete(task);
    setIsDeleteConfirmOpen(true);
  };


  const confirmDeleteTask = async () => {
    if (!currentUser || !taskToDelete || !userProfile) {
        toast({ variant: "destructive", title: "Hata!", description: "Kullanıcı veya silinecek görev bulunamadı."});
        setIsDeleteConfirmOpen(false);
        setTaskToDelete(null);
        return;
    }
    
    try {
        const taskDocRef = doc(db, 'tasks', taskToDelete.id);
        await deleteDoc(taskDocRef).catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: `tasks/${taskToDelete.id}`,
                operation: 'delete'
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

        toast({ title: "Başarılı", description: "Görev silindi."});
        await removeTasks([taskToDelete.id]);
        
        if(taskToDelete.taskKey) {
            const userDocRef = doc(db, "users", currentUser.uid);
            await updateDoc(userDocRef, {
                deletedTaskKeys: arrayUnion(taskToDelete.taskKey)
            }).catch(e => console.warn("Silinen görev anahtarı kullanıcı profiline eklenemedi:", e));
        }

    } catch (error) {
        console.error("Error deleting task: ", error);
        if (!(error instanceof FirestorePermissionError)) {
          toast({ variant: "destructive", title: "Hata!", description: "Görev silinirken bir sorun oluştu."});
        }
    } finally {
        setIsDeleteConfirmOpen(false);
        setTaskToDelete(null);
    }
  };
  
  const handleDeleteAllTasks = async () => {
    if (!currentUser) {
      toast({ variant: "destructive", title: "Hata!", description: "İşlem yapmak için giriş yapmalısınız." });
      return;
    }
    
    const tasksToDeleteIds: string[] = [];
    const taskKeysToDelete: string[] = [];
    const batch = writeBatch(db);

    try {
        const tasksCollectionRef = collection(db, 'tasks');
        const q = query(tasksCollectionRef, where('userIds', 'array-contains', currentUser.uid));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            toast({ title: "Bilgi", description: "Silinecek göreviniz bulunmuyor." });
            setIsDeleteAllConfirmOpen(false);
            return;
        }

        for (const docSnapshot of querySnapshot.docs) {
            tasksToDeleteIds.push(docSnapshot.id);
            const taskData = docSnapshot.data();
            if (taskData.taskKey) {
                taskKeysToDelete.push(taskData.taskKey);
            }
            batch.delete(docSnapshot.ref);
        }

        await batch.commit().catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: `batch delete (multiple tasks)`,
                operation: 'write',
            });
            errorEmitter.emit('permission-error', permissionError);
            throw serverError;
        });

    } catch (error: any) {
        console.error("Error deleting all tasks: ", error);
        if (!(error instanceof FirestorePermissionError)) {
            toast({ variant: "destructive", title: "Hata!", description: "Görevler silinirken bir sorun oluştu." });
        }
    }

    try {
        if (taskKeysToDelete.length > 0) {
            const userDocRef = doc(db, 'users', currentUser.uid);
            await updateDoc(userDocRef, { deletedTaskKeys: arrayUnion(...taskKeysToDelete) });
        }
        toast({ title: "Başarılı", description: "Tüm görevleriniz silindi." });
        await removeTasks(tasksToDeleteIds);
    } catch(e) {
        console.error("Error updating user's deletedTaskKeys:", e);
        toast({ variant: "destructive", title: "Hata!", description: "Görevler silindi ancak silinen anahtarlar profiline işlenemedi." });
    } finally {
        setIsDeleteAllConfirmOpen(false);
    }
  };


  const handleAssignClick = (task: Task) => {
    if (!allUsers) return;
    setTaskToAssign(task);
    setSelectedAssignees(task.userIds);
    setIsAssignModalOpen(true);
  };
  
  const handleAssignTask = async () => {
    if (!taskToAssign || !currentUser || !userProfile || !allUsers) return;
  
    const batch = writeBatch(db);
    const taskDocRef = doc(db, 'tasks', taskToAssign.id);
  
    const previousAssigneesText = taskToAssign.userIds.map(uid => allUsers.find(u => u.uid === uid)?.firstName || uid).join(', ');
    const newAssigneesText = selectedAssignees.map(uid => allUsers.find(u => u.uid === uid)?.firstName || uid).join(', ');
    const userRemovedSelf = taskToAssign.userIds.includes(currentUser.uid) && !selectedAssignees.includes(currentUser.uid);

    try {
      batch.update(taskDocRef, {
        userIds: selectedAssignees,
        history: arrayUnion({
          action: 'assignment_changed',
          details: `Atananlar güncellendi. Önceki: ${previousAssigneesText || 'Yok'}. Yeni: ${newAssigneesText || 'Yok'}.`,
          timestamp: new Date(),
          actorId: currentUser.uid,
        }),
        updatedAt: serverTimestamp(),
      });
  
      await batch.commit().catch(async (serverError) => {
        const permissionError = new FirestorePermissionError({
            path: `tasks/${taskToAssign.id}`,
            operation: 'update',
            requestResourceData: { userIds: selectedAssignees },
        });
        errorEmitter.emit('permission-error', permissionError);
        throw serverError;
      });

      toast({ title: 'Başarılı', description: 'Görev ataması güncellendi.' });
      setIsAssignModalOpen(false);
      setTaskToAssign(null);
      
      if (userRemovedSelf) {
        await removeTasks([taskToAssign.id]);
      } else {
        await fetchData();
      }
    } catch (error: any) {
      console.error("Error updating task assignees:", error);
      if (!(error instanceof FirestorePermissionError)) {
        toast({ 
          variant: 'destructive', 
          title: 'Atama Hatası', 
          description: `Görev ataması güncellenemedi. Hata: ${error.message}` 
        });
      }
    }
  };

  const tasksByStatus = React.useMemo(() => {
    const sortedTasks = [...tasks].sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a));
    const grouped: { [key: string]: Task[] } = {};
    for (const status of statusOptions) {
        grouped[status] = [];
    }
    for (const task of sortedTasks) {
      if (task.status && grouped[task.status]) {
         grouped[task.status]!.push(task);
      } else {
        const defaultStatus = statusOptions[1] || 'DEVAM EDİLİYOR';
        if (!grouped[defaultStatus]) grouped[defaultStatus] = []; 
        grouped[defaultStatus]!.push(task);
      }
    }
    return grouped;
  }, [tasks, statusOptions]);

  const summaryData = React.useMemo(() => {
    return statusOptions.map(status => {
        const tasksInStatus = tasksByStatus[status] || [];
        return {
            status,
            total: tasksInStatus.length,
            config: resolvedStatusConfiguration.find(s => s.label === status)
        };
    }).filter(s => s.total > 0);
  }, [tasksByStatus, statusOptions, resolvedStatusConfiguration]);


  const handleSyncClick = async (task: Task) => {
    if (!currentUser || !userProfile || !task.taskKey) return;
    setSyncingTaskId(task.id);
    try {
      const result = await syncJiraStatus(task.id, task.taskKey, currentUser.uid);
      if (result.success) {
        toast({ title: 'Başarılı!', description: result.message });
        await fetchData(true); // Re-fetch data after sync
      } else {
        toast({ variant: 'destructive', title: 'Senkronizasyon Hatası', description: result.message });
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'Hata', description: 'Beklenmedik bir hata oluştu.' });
    } finally {
      setSyncingTaskId(null);
    }
  };

  const handleFullSync = async () => {
    if (!currentUser || !userProfile || !globalSettings) {
        toast({
            variant: 'destructive',
            title: 'Hata',
            description: 'Kullanıcı profili veya genel ayarlar yüklenemedi. Lütfen tekrar deneyin.'
        });
        return;
    }

    setIsSyncingAll(true);
    
    try {
        const jiraResult = await syncAllJiraTasks({
            jiraApiUrlBase: globalSettings.jiraApiUrlBase || '',
            jiraApiUser: globalSettings.jiraApiUser || '',
            jiraApiPassword: globalSettings.jiraApiPassword || '',
        });

        if (!jiraResult.success || !jiraResult.issues) {
            toast({ variant: 'destructive', title: 'Jira Senkronizasyon Hatası', description: jiraResult.message });
            setIsSyncingAll(false);
            return;
        }
        
        const jiraIssues = jiraResult.issues;
        const defaultStatus = resolvedStatusConfiguration.find(s => s.id === 'todo')?.label || 'YAPILACAK';


        if (jiraIssues.length === 0) {
            toast({ title: 'Bilgi', description: 'Jira\'da size atanmış aktif bir görev bulunmuyor.' });
            setIsSyncingAll(false);
            return;
        }

        const tasksCollectionRef = collection(db, 'tasks');
        const q = query(tasksCollectionRef, where('userIds', 'array-contains', currentUser.uid));
        const querySnapshot = await getDocs(q);
        const existingTasksMap = new Map(querySnapshot.docs.map(doc => [doc.data().taskKey, { id: doc.id, ...doc.data() } as Task]));

        const batch = writeBatch(db);
        let newTasksCount = 0;
        let updatedTasksCount = 0;

        for (const issue of jiraIssues) {
            const taskKey = issue.key;
            const jiraStatusName = issue.fields.status.name;
            const appStatus = resolvedStatusMappings[jiraStatusName.toLowerCase()] || defaultStatus;
            const taskName = issue.fields.summary;
            
            const existingTask = existingTasksMap.get(taskKey);
            const completedStatus = resolvedStatusConfiguration.find(s => s.id === 'done')?.label || 'TAMAMLANDI';


            if (existingTask) {
                if (existingTask.status !== appStatus || existingTask.taskName !== taskName) {
                    const taskDocRef = doc(db, 'tasks', existingTask.id);
                    batch.update(taskDocRef, {
                        status: appStatus,
                        taskName: taskName,
                        updatedAt: serverTimestamp()
                    });
                    updatedTasksCount++;
                }
            } else {
                const newTaskDocRef = doc(collection(db, 'tasks'));
                const newTaskData: Omit<Task, 'id' | 'creatorId'> = {
                    taskKey: taskKey,
                    taskName: taskName,
                    status: appStatus,
                    userIds: [currentUser.uid],
                    progress: appStatus === completedStatus ? 100 : 0,
                    taskType: 'ANALİZ', // Default value
                    cityAdmin: '',
                    progressNotes: '',
                    createdAt: serverTimestamp() as Timestamp,
                    updatedAt: serverTimestamp() as Timestamp,
                    history: [{
                        action: 'created_from_jira',
                        details: `Görev, Jira'dan senkronizasyon ile oluşturuldu.`,
                        timestamp: new Date(),
                        actorId: currentUser.uid,
                    }],
                };
                batch.set(newTaskDocRef, { ...newTaskData, creatorId: currentUser.uid });
                newTasksCount++;
            }
        }
        
        await batch.commit().catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
              path: `batch write (full sync)`,
              operation: 'write',
          });
          errorEmitter.emit('permission-error', permissionError);
          throw serverError;
        });
        
        await fetchData(true);

        let message = '';
        if (newTasksCount > 0) message += `${newTasksCount} yeni görev eklendi. `;
        if (updatedTasksCount > 0) message += `${updatedTasksCount} görev güncellendi.`;
        if (message === '') {
          message = 'Tüm görevleriniz Jira ile güncel.';
        }
        
        toast({ title: 'Senkronizasyon Başarılı!', description: message });

    } catch (e: any) {
        console.error("Full sync error:", e);
         if (!(e instanceof FirestorePermissionError)) {
            toast({ variant: 'destructive', title: 'Hata', description: `Beklenmedik bir hata oluştu: ${e.message}` });
         }
    } finally {
        setIsSyncingAll(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) {
      return;
    }
    setCsvFile(file);
    setIsPreviewModalOpen(true);
  };


  const handleConfirmImport = async (rowsToImport: ProcessedRow[]) => {
    if (!currentUser || !userProfile) return;
    setIsPreviewModalOpen(false);

    const selectedRows = rowsToImport.filter(row => row._isSelected);
    if (selectedRows.length === 0) {
        toast({ title: 'İşlem Gerekmiyor', description: 'Seçilen görevlerde içe aktarılacak bir değişiklik bulunamadı.' });
        return;
    }

    const batch = writeBatch(db);

    let newTasksCount = 0;
    let updatedTasksCount = 0;
    let revivedTasksCount = 0;

    const userDocRef = doc(db, "users", currentUser.uid);
    const keysToUnDelete: string[] = [];

    for (const row of selectedRows) {
        const { _id, _isSelected, _isNew, _hasChanges, _isValid, _isDeletedByUser, _existingTaskId, originalData, ...taskData } = row;
        
        const updateTime = row.csvUpdatedAt instanceof Date && !isNaN(row.csvUpdatedAt.getTime())
            ? Timestamp.fromDate(row.csvUpdatedAt)
            : serverTimestamp();

        const updatesToSave: Partial<Task> & { updatedAt: any, history?: any, progress?: number } = { ...taskData, updatedAt: updateTime };
        
        const completedStatusLabel = resolvedStatusConfiguration.find(s => s.id === 'done')?.label || 'TAMAMLANDI';
        if (taskData.status === completedStatusLabel) {
            updatesToSave.progress = 100;
        } else if(taskData.progress !== null) {
            updatesToSave.progress = taskData.progress;
        }

        if (_isSelected && (_isNew || _isDeletedByUser)) {
            const newTaskDocRef = doc(collection(db, 'tasks'));
            
            const newTaskDataToSave: Omit<Task, 'id'> = {
                ...updatesToSave,
                creatorId: currentUser.uid,
                userIds: [currentUser.uid],
                createdAt: updateTime,
                history: [{
                    action: _isDeletedByUser ? 'revived_from_csv' : 'created_from_csv',
                    details: _isDeletedByUser ? "Görev, CSV'den içe aktarılarak yeniden etkinleştirildi." : "Görev, CSV'den içe aktarıldı.",
                    timestamp: new Date(),
                    actorId: currentUser.uid
                }],
            } as Omit<Task, 'id'>;

            batch.set(newTaskDocRef, newTaskDataToSave);
            
            if (_isDeletedByUser && row.taskKey) {
                keysToUnDelete.push(row.taskKey);
                revivedTasksCount++;
            } else {
                newTasksCount++;
            }
        } else if (_isSelected && _existingTaskId && _hasChanges) {
            const taskDocRef = doc(db, 'tasks', _existingTaskId);
            updatesToSave.history = arrayUnion({
                action: 'updated_from_csv',
                details: "Görev, CSV'den içe aktarma ile güncellendi.",
                timestamp: new Date(),
                actorId: currentUser.uid,
            });
            batch.update(taskDocRef, updatesToSave);
            updatedTasksCount++;
        }
    }

    if (keysToUnDelete.length > 0) {
        batch.update(userDocRef, { deletedTaskKeys: arrayRemove(...keysToUnDelete) });
    }

    try {
        await batch.commit().catch(async (serverError) => {
          const permissionError = new FirestorePermissionError({
              path: `batch write (import)`,
              operation: 'write',
          });
          errorEmitter.emit('permission-error', permissionError);
          throw serverError;
        });

        await fetchData(true);
        let message = '';
        if (newTasksCount > 0) message += `${newTasksCount} yeni görev eklendi. `;
        if (updatedTasksCount > 0) message += `${updatedTasksCount} görev güncellendi. `;
        if (revivedTasksCount > 0) message += `${revivedTasksCount} silinmiş görev yeniden yüklendi.`;

        toast({ title: 'İçe Aktarma Tamamlandı', description: message.trim() || 'İçe aktarma işlemi tamamlandı.' });
    } catch (e: any) {
        console.error("CSV Import error:", e);
        if (!(e instanceof FirestorePermissionError)) {
          toast({ variant: "destructive", title: "Hata!", description: `CSV içe aktarılırken bir hata oluştu: ${e.message}` });
        }
    }
  };


  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleOpenJira = () => {
    if (!globalSettings?.jiraApiUrlBase) {
      toast({
        variant: 'destructive',
        title: 'Jira Adresi Eksik',
        description: 'Yönetici tarafından Jira URL adresi henüz ayarlanmamış.'
      });
      return;
    }
    const defaultJql = 'assignee = currentUser() ORDER BY updated DESC';
    const jql = globalSettings.jiraJqlQuery || defaultJql;
    const encodedJql = encodeURIComponent(jql);
    const jiraUrl = `${globalSettings.jiraApiUrlBase}/issues/?jql=${encodedJql}`;
    window.open(jiraUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSaveWidths = async () => {
    if (!userProfile || userProfile.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Hata!', description: 'Bu işlemi yapma yetkiniz yok.' });
      return;
    }

    setIsSavingWidths(true);
    try {
      const updatedFieldConfig = resolvedFieldConfiguration.map(field => {
        const newWidth = columnWidths[field.key];
        if (newWidth) {
          return { ...field, width: typeof newWidth === 'number' ? `${newWidth}px` : newWidth };
        }
        return field;
      });
      
      const globalSettingsDocRef = doc(db, 'global_settings', 'main');
      await setDoc(globalSettingsDocRef, { fieldConfiguration: updatedFieldConfig }, { merge: true });

      toast({ title: 'Başarılı', description: 'Varsayılan sütun genişlikleri kaydedildi.' });
      setIsAdjustingWidths(false);

    } catch (error: any) {
      console.error("Error saving column widths:", error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Genişlikler kaydedilirken bir hata oluştu: ${error.message}` });
    } finally {
      setIsSavingWidths(false);
    }
  };

  const handleCancelAdjustWidths = () => {
    const initialWidths: Record<string, string> = {};
    visibleTableFields.forEach(field => {
        if(field.width) {
            initialWidths[field.key] = field.width;
        }
    });
    setColumnWidths(initialWidths);
    setIsAdjustingWidths(false);
  };
  
  const handleExportExcel = (tasksToExport: Task[]) => {
    const headers = visibleTableFields.map(f => f.label);
    const data = tasksToExport.map(task => {
      const rowData: Record<string, string> = {};
      visibleTableFields.forEach(field => {
        rowData[field.label] = getRenderedCellText(task, field);
      });
      return rowData;
    });
    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Görevlerim");
    XLSX.writeFile(workbook, `Gorevlerim_${new Date().toLocaleDateString('tr-TR')}.xlsx`);
  };


  const handleCreateTestCase = async (task: Task) => {
    if (!currentUser) return;
    const testCaseRef = doc(db, 'testCases', task.id);
    const taskRef = doc(db, 'tasks', task.id);

    try {
        await writeBatch(db)
            .set(testCaseRef, {
                taskName: task.taskName,
                taskKey: task.taskKey,
                steps: [],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            })
            .update(taskRef, {
                hasInternalTestCase: true
            })
            .commit();
        
        toast({title: "Başarılı", description: "Test senaryosu oluşturuldu."});
        router.push(`/test-case/${task.id}`);

    } catch(e) {
        console.error("Error creating test case: ", e);
        toast({variant: 'destructive', title: "Hata", description: "Test senaryosu oluşturulamadı."});
    }
  };
  
  const getFullUrl = (task: Task, fieldConfig: FieldSetting): string => {
    const value = task[fieldConfig.key as keyof Task];
    let baseId = task[`${fieldConfig.key}BaseId` as keyof Task] as string | null | undefined;
    const trimmedValue = (value as string)?.trim();
  
    if (!trimmedValue) return '#';
  
    if (!baseId && !isLikelyUrl(trimmedValue)) {
      if (fieldConfig.key === 'taskKey') {
        baseId = globalSettings?.defaultTaskKeyBaseLinkId;
      } else if (fieldConfig.key === 'analysisTestLink') {
        if (task.taskType === 'ANALİZ') {
          baseId = globalSettings?.defaultAnalysisBaseLinkId;
        } else if (task.taskType === 'TEST') {
          baseId = globalSettings?.defaultTestBaseLinkId;
        }
      }
    }
  
    if (baseId && baseLinks) {
      const base = baseLinks.find(b => b.id === baseId);
      if (base?.url) {
        const cleanBaseUrl = base.url.endsWith('/') ? base.url : base.url + '/';
        const cleanValue = trimmedValue.startsWith('/') ? trimmedValue.substring(1) : trimmedValue;
        return ensureProtocol(cleanBaseUrl + cleanValue);
      }
    }
  
    if (isLikelyUrl(trimmedValue)) {
      return ensureProtocol(trimmedValue);
    }
  
    return '#';
  };

  const getRenderedCellText = (task: Task, fieldConfig: FieldSetting): string => {
    let value: any;
    if (fieldConfig.isCustom) {
      value = task.customFields?.[fieldConfig.key];
    } else {
      const key = fieldConfig.key as keyof Task;
      value = task[key];
    }

    switch (fieldConfig.key) {
      case 'taskKey':
      case 'analysisTestLink': {
        const href = getFullUrl(task, fieldConfig);
        const rawValue = task[fieldConfig.key as keyof Task] as string | undefined || '';
        if (href !== '#') {
          const hasBaseId = !!task[`${fieldConfig.key}BaseId` as keyof Task] || (!isLikelyUrl(rawValue) && (
            (fieldConfig.key === 'taskKey' && !!globalSettings?.defaultTaskKeyBaseLinkId) ||
            (fieldConfig.key === 'analysisTestLink' && (
              (task.taskType === 'ANALİZ' && !!globalSettings?.defaultAnalysisBaseLinkId) ||
              (task.taskType === 'TEST' && !!globalSettings?.defaultTestBaseLinkId)
            ))
          ));

          const displayText = hasBaseId ? rawValue : "İlgili Link";
          return displayText;
        }
        return rawValue || '-';
      }
      
      case 'progress':
        return `${value}%`;

      case 'progressNotes': {
        const notesRaw = value as string | ProgressNoteEntry[] | undefined;
        if (Array.isArray(notesRaw)) {
            return notesRaw.map(n => typeof n === 'object' && n.content ? n.content : String(n)).join('\n---\n');
        }
        return String(value ?? '-');
      }
      
      default:
        return String(value ?? '-');
    }
  };

  const renderCellContent = (task: Task, fieldConfig: FieldSetting) => {
    let value: any;
    if (fieldConfig.isCustom) {
        value = task.customFields?.[fieldConfig.key];
    } else {
        value = task[fieldConfig.key as keyof Task];
    }
    
    switch (fieldConfig.key) {
      case 'taskKey':
      case 'analysisTestLink': {
        const href = getFullUrl(task, fieldConfig);
        const rawValue = (task[fieldConfig.key as keyof Task] as string)?.trim() || '';

        if (href !== '#') {
           const hasBaseId = !!task[`${fieldConfig.key}BaseId` as keyof Task] || (!isLikelyUrl(rawValue) && (
             (fieldConfig.key === 'taskKey' && !!globalSettings?.defaultTaskKeyBaseLinkId) ||
             (fieldConfig.key === 'analysisTestLink' && (
               (task.taskType === 'ANALİZ' && !!globalSettings?.defaultAnalysisBaseLinkId) ||
               (task.taskType === 'TEST' && !!globalSettings?.defaultTestBaseLinkId)
             ))
           ));

           const displayText = hasBaseId ? rawValue : "İlgili Link";
           return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              <LinkIcon className="h-3 w-3" /> {displayText}
            </a>
          );
        }
        return <span className="whitespace-pre-wrap break-word">{rawValue || '-'}</span>;
      }
      
      case 'taskName':
        return <span className="font-medium whitespace-pre-wrap break-word" title={value}>{value}</span>;

      case 'progress':
        return (
          <div className="flex items-center gap-2 w-full">
            <Progress value={value as number} aria-valuenow={value as number} aria-valuemin={0} aria-valuemax={100} className="w-full h-2" />
            <span className="text-xs font-medium tabular-nums">{value}%</span>
          </div>
        );
      case 'status':
         const statusConfig = resolvedStatusConfiguration.find(s => s.label === value);
        return (
          <div className="flex items-center gap-2">
            <StatusIcon status={value as string} statusConfig={statusConfig} />
            <span className="font-medium">{value}</span>
          </div>
        );

      case 'progressNotes': {
        const notesValue = value as string | ProgressNoteEntry[] | undefined;
        let lastUpdater: UserProfile | undefined;

        if (allUsers && task.userIds.length > 1 && task.lastProgressNoteActorId) {
            lastUpdater = allUsers.find(u => u.uid === task.lastProgressNoteActorId);
        }
        
        let notesText: string;
        if (Array.isArray(notesValue)) {
            notesText = notesValue.map(n => typeof n === 'object' && n.content ? n.content : String(n)).join('\n');
        } else {
            notesText = notesValue || '';
        }
        
        if (notesText && notesText.trim()) {
            return (
              <div className="relative">
                 {task.updatedAt instanceof Timestamp && (
                    <div className="absolute top-0 right-0 text-xs text-muted-foreground flex items-center gap-2">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1">
                                            <CalendarDays className="h-3 w-3"/>
                                            {new Date(task.updatedAt.toDate()).toLocaleDateString('tr-TR')}
                                        </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Son Güncelleme</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        {lastUpdater && (
                              <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Avatar className="h-5 w-5">
                                            <AvatarImage src={lastUpdater.photoURL} />
                                            <AvatarFallback className="text-[10px]">{getInitials(lastUpdater)}</AvatarFallback>
                                        </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>{lastUpdater.firstName} {lastUpdater.lastName}</p>
                                    </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                        )}
                    </div>
                  )}
                  <div className="text-foreground whitespace-pre-wrap text-xs mt-4 pr-24">
                     {renderFormattedText(notesText)}
                  </div>
              </div>
            );
        }
        return <span className="text-xs text-muted-foreground">-</span>;
      }
      
      default:
        return <span className="whitespace-pre-wrap break-word">{String(value ?? '-')}</span>;
    }
  };
  
  const sortedUsersForList = React.useMemo(() => {
    if (!allUsers) return [];
    const visibleUsers = allUsers.filter(u => !u.hideFromTaskAssignment);
    const activeUsers = visibleUsers.filter(u => (u.status || 'active') === 'active');
    const inactiveUsers = visibleUsers.filter(u => u.status === 'inactive');
    
    const sortFn = (a: UserProfile, b: UserProfile) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr');

    return [...activeUsers.sort(sortFn), ...inactiveUsers.sort(sortFn)];
  }, [allUsers]);

  const getInitials = (user?: UserProfile) => {
      if (!user) return '...';
      if (user.status === 'inactive') return 'P';
      const firstNameInitial = user.firstName ? user.firstName[0] : '';
      const lastNameInitial = user.lastName ? user.lastName[0] : '';
      return `${firstNameInitial}${lastNameInitial}`.toUpperCase();
  }

  if (isLoading || !userProfile || !globalSettings) {
    return (
      <>
        <AppHeader />
        <div className="flex items-center justify-center min-h-[calc(100vh-80px)]">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      </>
    );
  }


  return (
    <TooltipProvider>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8">
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv,text/csv"
            className="hidden"
            onClick={(e) => { (e.target as HTMLInputElement).value = '' }}
        />
        <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-2 justify-end print:hidden">
                <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isLoading}>
                    <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                    Yenile
                </Button>
                {isAdjustingWidths && (
                  <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-accent/20 border border-accent w-full justify-between">
                      <p className="text-sm font-medium text-accent-foreground flex-grow">Sütunları ayarlayın ve kaydedin. Bu yeni varsayılan görünüm olacaktır.</p>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveWidths} size="sm" disabled={isSavingWidths}>
                            {isSavingWidths ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Genişlikleri Kaydet
                        </Button>
                        <Button onClick={handleCancelAdjustWidths} size="sm" variant="outline">İptal</Button>
                      </div>
                  </div>
                )}
                 <div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Dışa Aktar
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => handleExportExcel(tasks)} disabled={tasks.length === 0}>
                                <FileDown className="mr-2 h-4 w-4" />
                                <span>Excel'e Aktar</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => window.print()} disabled={tasks.length === 0}>
                                <Printer className="mr-2 h-4 w-4" />
                                <span>Yazdır</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                
                {(globalSettings?.jiraCsvSyncEnabled === undefined || globalSettings?.jiraCsvSyncEnabled === true) && (
                  <div>
                      <TooltipProvider>
                          <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                  <Button variant="outline">
                                      Jira/CSV ile Güncelle
                                      <ChevronDown className="ml-2 h-4 w-4" />
                                  </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-64">
                                  <Tooltip>
                                      <TooltipTrigger asChild>
                                          <DropdownMenuItem onSelect={handleOpenJira} disabled={!globalSettings?.jiraApiUrlBase}>
                                              <ExternalLink className="mr-2 h-4 w-4" />
                                              <span>Jira'da Aç</span>
                                          </DropdownMenuItem>
                                      </TooltipTrigger>
                                      <TooltipContent side="left" align="start" className="p-2 max-w-md">
                                          <div className="text-sm">
                                              <p>İçe aktarmadan önce, Jira'ya gidip<br/>`Dışa Aktar -{'>'} CSV (Seçili alanlar)` ile verilerinizi alın.</p>
                                              <Separator className="my-2"/>
                                              <p className="font-semibold">Önemli Not:</p>
                                              <p>Jira, 1000'den fazla görevi tek seferde dışa aktarmanıza izin vermez. Eğer 1000'den fazla göreviniz varsa, JQL sorgunuzdaki <code className="text-xs bg-muted p-1 rounded-sm">created</code> tarihini güncelleyerek (örn: <code className="text-xs bg-muted p-1 rounded-sm">"2024-06-01"</code>) sonucu 1000'in altına düşürebilirsiniz.</p>
                                          </div>
                                      </TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                  <TooltipTrigger asChild>
                                      <DropdownMenuItem onSelect={handleImportClick} disabled={isImporting}>
                                          {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                                          <span>CSV İçe Aktar</span>
                                      </DropdownMenuItem>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" align="start">
                                      <p>Jira'dan dışa aktardığınız CSV dosyasını seçerek<br/>içe aktarma işlemini başlatın.</p>
                                  </TooltipContent>
                                  </Tooltip>
                                  {globalSettings?.jiraSyncEnabled && (
                                      <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onSelect={handleFullSync} disabled={isSyncingAll}>
                                          {isSyncingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                          <span>Jira API ile Senkronize Et</span>
                                      </DropdownMenuItem>
                                      </>
                                  )}
                              </DropdownMenuContent>
                          </DropdownMenu>
                      </TooltipProvider>
                  </div>
                )}
                
                {userProfile?.role === 'admin' && !isAdjustingWidths && (
                    <Button onClick={() => setIsAdjustingWidths(true)} variant="outline">
                        <Columns className="mr-2 h-5 w-5" />
                        Genişlikleri Ayarla
                    </Button>
                )}

                <Button onClick={handleAddNewTask} className="bg-primary hover:bg-primary/90">
                    <PlusCircle className="mr-2 h-5 w-5" /> {resolvedUiStrings.home_addTaskButton}
                </Button>
                 {userProfile?.role === 'admin' && (
                    <Button onClick={() => setIsDeleteAllConfirmOpen(true)} variant="destructive">
                        <Trash2 className="mr-2 h-5 w-5" />
                        Tüm Görevlerimi Sil
                    </Button>
                )}
            </div>
            
            <div className="flex justify-end print:hidden">
              <div className="flex flex-wrap items-center gap-2">
                {summaryData.map(summary => (
                  <a key={summary.status} href={`#status-${summary.status}`} className="text-decoration-none">
                    <Card className="p-2 hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2">
                        {summary.config && <StatusIcon status={summary.status} statusConfig={summary.config} />}
                        <span className="font-medium text-xs">{summary.status}</span>
                        <span className="text-xs text-muted-foreground">({summary.total})</span>
                      </div>
                    </Card>
                  </a>
                ))}
              </div>
            </div>

        </div>

        {tasks.length === 0 && !isLoading && ( 
           <div className="text-center text-muted-foreground py-10">{resolvedUiStrings.tasks_page_no_tasks_overall}</div>
        )}

        <div className="task-table-container">
        <TooltipProvider>
        {statusOptions.map((status) => {
            const currentTasks = tasksByStatus[status] || [];
            if (currentTasks.length === 0) return null;
            
            const isExpanded = expandedStatuses[status] || false;
            const visibleTasks = isExpanded ? currentTasks : currentTasks.slice(0, TASKS_TO_SHOW_INITIALLY);
            const hasMoreTasks = currentTasks.length > TASKS_TO_SHOW_INITIALLY;

            return (
            <div key={status} id={`status-${status}`} className="mb-10 scroll-mt-24 task-section">
                <div className="flex items-center justify-between mb-4 section-header">
                <div className="flex items-center gap-2">
                    <StatusIcon status={status} statusConfig={resolvedStatusConfiguration.find(s => s.label === status)} />
                    <h2 className="font-headline text-xl text-foreground flex items-center">
                        {status}
                        <span className="text-muted-foreground ml-2 text-lg">({currentTasks.length})</span>
                    </h2>
                </div>
                </div>
                <div className="relative w-full overflow-auto rounded-md border border-border bg-card">
                <Table ref={tableRef} className="w-full" style={{ tableLayout: 'fixed' }}>
                    <TableHeader>
                    <TableRow>
                        {visibleTableFields.map((field) => (
                            <TableHead key={field.key} data-fieldkey={field.key} style={{width: columnWidths[field.key] ? (typeof columnWidths[field.key] === 'number' ? `${columnWidths[field.key]}px` : columnWidths[field.key]) : 'auto'}} className="text-left relative group">
                            {field.label}
                            {isAdjustingWidths && (
                                <div
                                onMouseDown={(e) => handleMouseDown(e, field.key)}
                                className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none opacity-0 group-hover:opacity-100 print:hidden"
                                />
                            )}
                            </TableHead>
                        ))}
                        <TableHead className="text-center print:hidden" style={{ width: '150px' }}>İşlemler</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {visibleTasks.map((task) => (
                        <TableRow key={task.id} className="hover:bg-accent/10 transition-colors">
                            {visibleTableFields.map((field) => (
                                <TableCell key={field.key} className="text-left align-top">
                                    <div className="max-h-64 overflow-y-auto">
                                    {renderCellContent(task, field)}
                                    </div>
                                </TableCell>
                            ))}
                            <TableCell className="text-center align-top print:hidden">
                            <div className="flex justify-center items-center">
                                <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleAssignClick(task)}>
                                        <Users className="h-5 w-5 text-primary" />
                                        <span className="sr-only">Ata / Değiştir</span>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Görevi Ata / Değiştir</p>
                                </TooltipContent>
                                </Tooltip>
                                {globalSettings?.internalTestCasesEnabled && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => task.hasInternalTestCase 
                                                        ? router.push(`/test-case/${task.id}`) 
                                                        : handleCreateTestCase(task)
                                                    }
                                                    aria-label={task.hasInternalTestCase ? "Test Senaryosunu Görüntüle" : "Test Senaryosu Oluştur"}
                                                >
                                                    <ClipboardCheck className="h-5 w-5 text-purple-500 hover:text-purple-400" />
                                                </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>{task.hasInternalTestCase ? "Test Senaryosunu Görüntüle" : "Test Senaryosu Oluştur"}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {task.taskKey && globalSettings?.jiraSyncEnabled && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleSyncClick(task)} disabled={syncingTaskId === task.id} aria-label={`Jira ile senkronize et ${task.taskName}`}>
                                        {syncingTaskId === task.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5 text-blue-500 hover:text-blue-400" />}
                                    </Button>
                                    </TooltipTrigger>
                                    <TooltipContent><p>Jira ile durumu senkronize et</p></TooltipContent>
                                </Tooltip>
                                )}
                                <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(task)} aria-label={resolvedUiStrings.tasks_page_edit_task_aria_label?.replace('{taskName}', task.taskName)}>
                                    <Edit2 className="h-5 w-5 text-primary hover:text-primary/80" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Görevi Düzenle</p></TooltipContent>
                                </Tooltip>
                                {(currentUser?.uid === task.creatorId || task.userIds.includes(currentUser!.uid)) && (
                                  <Tooltip>
                                  <TooltipTrigger asChild>
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteTask(task)} aria-label={resolvedUiStrings.tasks_page_delete_task_aria_label?.replace('{taskName}', task.taskName)} className="text-destructive hover:text-destructive/80">
                                      <Trash2 className="h-5 w-5" />
                                      </Button>
                                  </TooltipTrigger>
                                  <TooltipContent><p>Görevi Sil</p></TooltipContent>
                                  </Tooltip>
                                )}
                            </div>
                            </TableCell>
                        </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                    {hasMoreTasks && (
                    <div className="p-2 text-center print:hidden">
                        <Button variant="link" onClick={() => setExpandedStatuses(prev => ({...prev, [status]: !isExpanded}))}>
                            {isExpanded ? 'Daha Az Göster' : `Kalan ${currentTasks.length - TASKS_TO_SHOW_INITIALLY} görevi göster...`}
                        </Button>
                    </div>
                    )}
                </div>
            </div>
            );
        })}
        </TooltipProvider>
        </div>

        {selectedTask && isModalOpen && (
          <EditTaskModal
            isOpen={isModalOpen}
            onClose={handleCloseModal}
            task={selectedTask}
            onSave={handleSaveTask}
            allUsers={allUsers}
            resolvedFieldConfiguration={resolvedFieldConfiguration}
            resolvedStatusConfiguration={resolvedStatusConfiguration}
            resolvedUiStrings={resolvedUiStrings}
          />
        )}
        
        <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
            <DialogContent>
              <DialogHeader>
                  <DialogTitle>Görev Ata / Değiştir</DialogTitle>
                  <DialogDescription>
                    "{taskToAssign?.taskName}" görevini kimlere atamak istersiniz?
                  </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Command>
                  <CommandInput placeholder="Kullanıcı ara..." />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>Kullanıcı bulunamadı.</CommandEmpty>
                    <CommandGroup>
                      {sortedUsersForList.map((user) => {
                        const isCreator = currentUser?.uid === taskToAssign?.creatorId;
                        const isTeamLead = userProfile?.role === 'admin' || userProfile?.canViewTeamTasks === true;
                        const isSelf = user.uid === currentUser?.uid;
                        const isAssigned = selectedAssignees.includes(user.uid);
                        
                        let isDisabled = user.status === 'inactive';
                        let canUncheck = true;

                        if (!isCreator && !isTeamLead) {
                            if(isAssigned && !isSelf) {
                                canUncheck = false;
                            }
                            if(isSelf && taskToAssign && taskToAssign.userIds.length <=1) {
                                canUncheck = false;
                            }
                        }

                        return (
                        <CommandItem
                          key={user.uid}
                           onSelect={() => {
                            if (isDisabled) return;
                            if (isAssigned && !canUncheck) {
                                toast({ title: "Yetkiniz Yok", description: "Yalnızca görevi oluşturan kişi, takım lideri veya kullanıcının kendisi atamayı kaldırabilir." });
                                return;
                            }
                             if (isAssigned && isSelf && taskToAssign && taskToAssign.userIds.length <= 1) {
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
                <Button variant="outline" onClick={() => setIsAssignModalOpen(false)}>İptal</Button>
                <Button onClick={handleAssignTask}>Kaydet</Button>
              </DialogFooter>
            </DialogContent>
        </Dialog>

        {isPreviewModalOpen && csvFile && userProfile && (
            <ImportPreviewModal
                isOpen={isPreviewModalOpen}
                onClose={() => {
                  setIsPreviewModalOpen(false);
                  setCsvFile(null);
                }}
                file={csvFile}
                existingTasksMap={tasksByTaskKeyMap}
                onImport={handleConfirmImport}
                resolvedFieldConfiguration={resolvedFieldConfiguration}
                resolvedStatusConfiguration={resolvedStatusConfiguration}
                resolvedStatusMappings={resolvedStatusMappings}
                userProfile={userProfile}
            />
        )}

        <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{resolvedUiStrings.tasks_page_delete_confirm_title}</DialogTitle>
              <DialogDescription>
                {resolvedUiStrings.tasks_page_delete_confirm_description}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDeleteConfirmOpen(false); setTaskToDelete(null); }}>İptal</Button>
              <Button onClick={confirmDeleteTask} variant="destructive">
                Evet, Sil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDeleteAllConfirmOpen} onOpenChange={setIsDeleteAllConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tüm Görevleri Silme Onayı</DialogTitle>
              <DialogDescription>
                Size atanmış TÜM görevleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteAllConfirmOpen(false)}>İptal</Button>
              <Button onClick={handleDeleteAllTasks} variant="destructive">
                Evet, Hepsini Sil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
      <ScrollToTopButton />
    </TooltipProvider>
  );
}

const MyTasksPage = React.memo(MyTasksPageContent);
export default MyTasksPage;
