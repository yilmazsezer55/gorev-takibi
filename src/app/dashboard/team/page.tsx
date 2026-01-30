

'use client';

import * as React from 'react';
import {
  collection,
  query,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  setDoc,
  getDocs,
  orderBy,
  getDoc,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import type { Task, UserProfile, FieldSetting, StatusSetting, BaseLink, GlobalSettings, ProgressNoteEntry } from '@/types';
import { Check, ChevronsUpDown, Users, Loader2, Link as LinkIcon, CalendarDays, Eye, CheckCheck, Calendar as CalendarIcon, X, Printer, FileDown, ChevronDown, Edit, RefreshCw, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import AppHeader from '@/components/header';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ScrollToTopButton from '@/components/scroll-to-top-button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, subDays, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { DEFAULT_STATUS_CONFIGURATION } from '@/contexts/auth-context';
import { DEFAULT_FIELD_CONFIGURATION } from '@/contexts/auth-context';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useTaskStore } from '@/contexts/task-store';



const AllLucideIcons = LucideIcons as unknown as { [key: string]: React.ElementType };

const StatusIcon = ({ status, statusConfig }: { status: string, statusConfig: StatusSetting | undefined }) => {
    if (!statusConfig) {
        return <LucideIcons.HelpCircle className="h-4 w-4 text-gray-500" aria-label={status} />;
    }
    const IconComponent = AllLucideIcons[statusConfig.icon];
    if (!IconComponent) {
        return <LucideIcons.HelpCircle className={`h-4 w-4 ${statusConfig.color}`} aria-label={status} />;
    }
    return <IconComponent className={`h-4 w-4 ${statusConfig.color}`} aria-label={status} />;
};


const getInitials = (user?: UserProfile) => {
    if (!user) return '...';
    if (user.status === 'inactive') return 'P';
    const firstNameInitial = user.firstName ? user.firstName[0] : '';
    const lastNameInitial = user.lastName ? user.lastName[0] : '';
    return `${firstNameInitial}${lastNameInitial}`.toUpperCase();
}

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

const PRESET_DATES = [
    { label: 'Son 1 Hafta', days: 7 },
    { label: 'Son 2 Hafta', days: 14 },
    { label: 'Son 1 Ay', days: 30 },
]

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

function TeamDashboardPageContent() {
  const { currentUser, userProfile, allUsers: allUsersFromAuth, globalSettings: authGlobalSettings } = useAuth();
  const { tasks, isLoading, loadTeamTasks, removeTasks } = useTaskStore();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [allUsers, setAllUsers] = React.useState<UserProfile[] | null>(allUsersFromAuth);
  const [baseLinks, setBaseLinks] = React.useState<BaseLink[] | null>(null);
  const [globalSettings, setGlobalSettings] = React.useState<GlobalSettings | null>(authGlobalSettings);

  const [selectedUserId, setSelectedUserId] = React.useState('all');
  
  const [date, setDate] = React.useState<DateRange | undefined>(() => {
    const defaultRange = authGlobalSettings?.defaultDashboardDateRange;
    if (defaultRange && defaultRange !== 'all') {
        const days = parseInt(defaultRange, 10);
        return { from: subDays(new Date(), days), to: new Date() };
    }
    if (defaultRange === 'all') return undefined;
    return { from: subDays(new Date(), 7), to: new Date() };
  });

  const [tempDate, setTempDate] = React.useState<DateRange | undefined>(date);
  const [isDatePickerOpen, setIsDatePickerOpen] = React.useState(false);
  const [isUserPickerOpen, setIsUserPickerOpen] = React.useState(false);
  
  const [activePreset, setActivePreset] = React.useState<string | null>(() => {
    const defaultRange = authGlobalSettings?.defaultDashboardDateRange;
    if (defaultRange === 'all') return 'Tümü';
    const preset = PRESET_DATES.find(p => p.days === parseInt(defaultRange || '7', 10));
    return preset?.label || 'Son 1 Hafta';
  });
  
  const [activeStatusFilter, setActiveStatusFilter] = React.useState<string>('all');

  const [taskToAssign, setTaskToAssign] = React.useState<Task | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = React.useState(false);
  const [selectedAssignees, setSelectedAssignees] = React.useState<string[]>([]);
  
  const [expandedStatuses, setExpandedStatuses] = React.useState<Record<string, boolean>>({});
  const [taskToDelete, setTaskToDelete] = React.useState<Task | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  // Derived state from globalSettings or defaults
  const resolvedStatusConfiguration = React.useMemo(() => (globalSettings?.statusConfiguration && globalSettings.statusConfiguration.length > 0) ? globalSettings.statusConfiguration : DEFAULT_STATUS_CONFIGURATION, [globalSettings]);
  const resolvedFieldConfiguration = React.useMemo(() => {
      const config = globalSettings?.fieldConfiguration || DEFAULT_FIELD_CONFIGURATION;
      const statusOptions = resolvedStatusConfiguration.map(s => s.label);
      return config.map(field => field.key === 'status' ? { ...field, options: statusOptions } : field)
                   .sort((a, b) => a.order - b.order);
  }, [globalSettings, resolvedStatusConfiguration]);
  
  const fetchAllData = React.useCallback(async (force = false) => {
    if (!currentUser) return;
    await loadTeamTasks(force);
  }, [currentUser, loadTeamTasks]);

  React.useEffect(() => {
    setAllUsers(allUsersFromAuth);
    setGlobalSettings(authGlobalSettings);
  }, [allUsersFromAuth, authGlobalSettings]);

  // This effect remains to fetch non-task related data.
  React.useEffect(() => {
    if (!currentUser) return;
    const fetchOtherData = async () => {
        try {
            const [linksSnap] = await Promise.all([
                getDocs(query(collection(db, 'baseLinks'), orderBy('name', 'asc'))),
            ]);
            setBaseLinks(linksSnap.docs.map(d => ({ id: d.id, ...d.data() } as BaseLink)));
        } catch (error) {
            console.error("Error fetching links for dashboard:", error);
            toast({ 
                variant: 'destructive', 
                title: 'Veri Yükleme Hatası', 
                description: `Ek veriler yüklenemedi.` 
            });
        }
    };
    fetchOtherData();
  }, [currentUser, toast]);


  React.useEffect(() => {
    if (!currentUser || !userProfile) {
      router.push('/login');
      return;
    }
    if (userProfile.role !== 'admin' && !userProfile.canViewTeamTasks) {
      toast({ variant: 'destructive', title: 'Yetkisiz Erişim', description: 'Bu sayfayı görüntüleme yetkiniz yok.' });
      router.push('/dashboard');
      return;
    }
    if (pathname === '/dashboard/team') {
        fetchAllData();
    }
  }, [currentUser, userProfile, router, toast, fetchAllData, pathname]);
  

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
  const tableRefs = React.useRef<Record<string, HTMLTableElement | null>>({});

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
  
  const sortedUsersForDashboardFilter = React.useMemo(() => {
    if (!allUsers) return [];
    // Apply the new visibility flag specifically for this list
    const visibleUsers = allUsers.filter(u => !u.hideFromDashboard);
    const activeUsers = visibleUsers.filter(u => (u.status || 'active') === 'active');
    const inactiveUsers = visibleUsers.filter(u => u.status === 'inactive');
    
    const sortFn = (a: UserProfile, b: UserProfile) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr');

    return [...activeUsers.sort(sortFn), ...inactiveUsers.sort(sortFn)];
  }, [allUsers]);

  const sortedUsersForAssignment = React.useMemo(() => {
    if (!allUsers) return [];
    const visibleUsers = allUsers.filter(u => !u.hideFromTaskAssignment);
    const activeUsers = visibleUsers.filter(u => (u.status || 'active') === 'active');
    const inactiveUsers = visibleUsers.filter(u => u.status === 'inactive');
    
    const sortFn = (a: UserProfile, b: UserProfile) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr');

    return [...activeUsers.sort(sortFn), ...inactiveUsers.sort(sortFn)];
  }, [allUsers]);

  const handleUserFilterChange = React.useCallback((direction: 'next' | 'prev') => {
    const userListWithAll = [{ uid: 'all', firstName: 'Tüm', lastName: 'Kullanıcılar' }, ...sortedUsersForDashboardFilter];
    const currentIndex = userListWithAll.findIndex(u => u.uid === selectedUserId);
    
    let nextIndex;
    if (direction === 'next') {
        nextIndex = (currentIndex + 1) % userListWithAll.length;
    } else {
        nextIndex = (currentIndex - 1 + userListWithAll.length) % userListWithAll.length;
    }
    setSelectedUserId(userListWithAll[nextIndex].uid);
  }, [selectedUserId, sortedUsersForDashboardFilter]);
  
  const handleApplyDateFilter = () => {
    setDate(tempDate);
    setActivePreset(null);
    setIsDatePickerOpen(false);
  };
  
  const handleCancelDateFilter = () => {
    setTempDate(date);
    setIsDatePickerOpen(false);
  };

  const setPresetDate = (preset: {label: string, days: number}) => {
      const newDateRange = { from: subDays(new Date(), preset.days), to: new Date() };
      setDate(newDateRange);
      setTempDate(newDateRange);
      setActivePreset(preset.label);
  };
  
  const setAllTime = () => {
      setDate(undefined);
      setTempDate(undefined);
      setActivePreset('Tümü');
  };

  const handleStatusFilterClick = (status: string) => {
    if (activeStatusFilter === status) {
        setActiveStatusFilter('all'); // Toggle off if already active
    } else {
        setActiveStatusFilter(status);
    }
  };


  const getTaskTimestamp = (task: Task): number => {
    const ts = task.updatedAt || task.createdAt;
    if (ts instanceof Timestamp) {
        return ts.toMillis();
    }
    // Handle cases where Timestamp is serialized from IDB
    if (ts && typeof ts === 'object' && 'seconds' in ts) {
        return new Timestamp((ts as any).seconds, (ts as any).nanoseconds).toMillis();
    }
    return 0;
  };

  const filteredTasks = React.useMemo(() => {
    let tasksToProcess = [...tasks];

    // Date filtering
    if (date?.from && date?.to) {
        const fromStartOfDay = new Date(date.from.getFullYear(), date.from.getMonth(), date.from.getDate(), 0, 0, 0, 0);
        const toEndOfDay = new Date(date.to.getFullYear(), date.to.getMonth(), date.to.getDate(), 23, 59, 59, 999);

        tasksToProcess = tasksToProcess.filter(task => {
            const taskTime = getTaskTimestamp(task);
            return taskTime >= fromStartOfDay.getTime() && taskTime <= toEndOfDay.getTime();
        });
    }

    // User filtering
    if (selectedUserId !== 'all') {
      tasksToProcess = tasksToProcess.filter(task => task.userIds.includes(selectedUserId));
    }
    
    return tasksToProcess.sort((a, b) => getTaskTimestamp(b) - getTaskTimestamp(a));
  }, [tasks, selectedUserId, date]);

  const tasksByStatus = React.useMemo(() => {
    const grouped: { [key: string]: Task[] } = {};
    
    for (const statusOption of statusOptions) {
      grouped[statusOption] = [];
    }
    
    for (const task of filteredTasks) {
      const status = task.status && statusOptions.includes(task.status) 
        ? task.status 
        : (statusOptions[1] || 'DEVAM EDİLİYOR');

      if (!grouped[status]) {
          grouped[status] = [];
      }
      
      grouped[status].push(task);
    }
    return grouped;
  }, [filteredTasks, statusOptions]);


  const summaryData = React.useMemo(() => {
      return statusOptions.map(status => {
          const group = tasksByStatus[status];
          if (!group) return null;
          return {
              status,
              total: group.length, // Only count tasks within the filter
              config: resolvedStatusConfiguration.find(s => s.label === status)
          };
      }).filter(s => s && s.total > 0);
  }, [tasksByStatus, statusOptions, resolvedStatusConfiguration]);


  const handleAssignClick = (task: Task) => {
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
        const updateData = {
            userIds: selectedAssignees,
            history: arrayUnion({
                action: 'assignment_changed',
                details: `Atananlar güncellendi. Önceki: ${previousAssigneesText || 'Yok'}. Yeni: ${newAssigneesText || 'Yok'}.`,
                timestamp: new Date(),
                actorId: currentUser.uid,
            }),
            updatedAt: serverTimestamp(),
        };
        batch.update(taskDocRef, updateData);

        await batch.commit().catch(async (serverError) => {
            const permissionError = new FirestorePermissionError({
                path: `tasks/${taskToAssign.id}`,
                operation: 'update',
                requestResourceData: { userIds: selectedAssignees }
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
            await fetchAllData();
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

 const handleDeleteTask = (task: Task) => {
    if (!currentUser) {
        toast({ variant: "destructive", title: "Hata!", description: "İşlem yapmak için giriş yapmalısınız." });
        return;
    }
    setTaskToDelete(task);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteTask = async () => {
    if (!currentUser || !taskToDelete) {
        toast({ variant: "destructive", title: "Hata!", description: "Kullanıcı veya silinecek görev bulunamadı."});
        setIsDeleteConfirmOpen(false);
        setTaskToDelete(null);
        return;
    }
    
    // Optimistic UI update
    await removeTasks([taskToDelete.id]);
    setIsDeleteConfirmOpen(false);
    setTaskToDelete(null);
    
    try {
      const taskDocRef = doc(db, 'tasks', taskToDelete.id);
      await deleteDoc(taskDocRef);
      toast({ title: "Başarılı", description: "Görev silindi."});
      
      // No need to call removeTasks again, it was done optimistically
    } catch (error: any) {
      console.error("Error deleting task: ", error);
      // Revert optimistic update on failure
      await fetchAllData(true); 
      if (!(error instanceof FirestorePermissionError)) {
        toast({ variant: "destructive", title: "Hata!", description: "Görev silinirken bir sorun oluştu."});
      } else {
          const permissionError = new FirestorePermissionError({
              path: `tasks/${taskToDelete.id}`,
              operation: 'delete',
          });
          errorEmitter.emit('permission-error', permissionError);
      }
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

    if (!allUsers) return '...';

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
      
      case 'userIds':
        return task.userIds.map(uid => {
            const user = allUsers.find(u => u.uid === uid);
            return user ? `${user.firstName} ${user.lastName}` : 'Bilinmeyen Kullanıcı';
        }).join(', ');
      
      default:
        return String(value ?? '-');
    }
  };

  const handleExportExcel = (tasksToExport: Task[]) => {
    if (!allUsers) return;
    const headers = [...visibleTableFields.map(f => f.label), "Atananlar"];
    const data = tasksToExport.map(task => {
      const rowData: Record<string, string> = {};
      visibleTableFields.forEach(field => {
        rowData[field.label] = getRenderedCellText(task, field);
      });
       rowData["Atananlar"] = getRenderedCellText(task, {key: 'userIds'} as FieldSetting);
      return rowData;
    });
    const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Takım Görevleri");
    XLSX.writeFile(workbook, `Takim_Gorevleri_${new Date().toLocaleDateString('tr-TR')}.xlsx`);
  };
  
  const isOnline = (user: UserProfile) => {
    if (!user || !user.lastSeen) return false;
    const lastSeen = (user.lastSeen as Timestamp).toDate();
    const now = new Date();
    // Consider online if last seen within the last 2 minutes
    return (now.getTime() - lastSeen.getTime()) < 2 * 60 * 1000;
  };


  if (isLoading || !allUsers) {
    return (
      <>
        <AppHeader />
        <div className="flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
        </div>
      </>
    );
  }
  
  const selectedUser = allUsers.find(u => u.uid === selectedUserId);


  const renderCellContent = (task: Task, fieldConfig: FieldSetting) => {
    let value: any;
    if (fieldConfig.isCustom) {
        value = task.customFields?.[fieldConfig.key];
    } else {
        const key = fieldConfig.key as keyof Task;
        value = task[key];
    }

    if (!allUsers) return null;

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
        return <span className="font-medium whitespace-pre-wrap break-words" title={value}>{value}</span>;

      case 'progress':
        return (
          <div className="flex items-center gap-2 w-full">
            <Progress value={value as number} aria-valuenow={value as number} aria-valuemin={0} aria-valuemax={100} className="w-full h-2" />
            <span className="text-xs font-medium tabular-nums">{value}%</span>
          </div>
        );
      case 'status': 
        return value; 

      case 'progressNotes': {
        const notesValue = value as string | ProgressNoteEntry[] | undefined;
        let lastUpdater: UserProfile | undefined;

        if (task.userIds.length > 1 && task.lastProgressNoteActorId) {
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


  return (
    <TooltipProvider>
      <AppHeader />
      <main className="w-full p-4 sm:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4 print-hidden">
                <div className="flex items-center justify-center gap-2 rounded-lg bg-muted p-1">
                    <Button variant="ghost" size="icon" onClick={() => handleUserFilterChange('prev')}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    
                    <Popover open={isUserPickerOpen} onOpenChange={setIsUserPickerOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                role="combobox"
                                aria-expanded={isUserPickerOpen}
                                className="w-[200px] justify-center h-auto py-1 px-2"
                            >
                                <div className="flex flex-col items-center justify-center text-center">
                                    <div className="font-semibold text-sm truncate">
                                        {selectedUserId === 'all' ? 'Tüm Kullanıcılar' : `${selectedUser?.firstName} ${selectedUser?.lastName}`}
                                    </div>
                                    {selectedUser && (
                                    <div className='flex items-center gap-1.5'>
                                        <div className={cn("h-2 w-2 rounded-full", isOnline(selectedUser) ? "bg-green-500" : "bg-gray-400")} />
                                        <span className='text-xs text-muted-foreground'>{isOnline(selectedUser) ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
                                    </div>
                                    )}
                                </div>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0">
                             <Command value={selectedUserId}>
                                <CommandList>
                                    <CommandEmpty>Kullanıcı bulunamadı.</CommandEmpty>
                                    <CommandGroup>
                                        <CommandItem
                                            key="all"
                                            value="all"
                                            onSelect={() => {
                                                setSelectedUserId("all");
                                                setIsUserPickerOpen(false);
                                            }}
                                        >
                                            <Check className={cn("mr-2 h-4 w-4", selectedUserId === "all" ? "opacity-100" : "opacity-0")} />
                                            Tüm Kullanıcılar
                                        </CommandItem>
                                        {sortedUsersForDashboardFilter.map((user) => (
                                            <CommandItem
                                                key={user.uid}
                                                value={user.uid}
                                                onSelect={() => {
                                                    setSelectedUserId(user.uid);
                                                    setIsUserPickerOpen(false);
                                                }}
                                            >
                                               <div className="flex items-center justify-between w-full">
                                                    <div className="flex items-center">
                                                        <Check className={cn("mr-2 h-4 w-4", selectedUserId === user.uid ? "opacity-100" : "opacity-0")} />
                                                        {user.firstName} {user.lastName}
                                                    </div>
                                                    <div className={cn("h-2 w-2 rounded-full", isOnline(user) ? "bg-green-500" : "bg-gray-400")} />
                                                </div>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>

                    <Button variant="ghost" size="icon" onClick={() => handleUserFilterChange('next')}>
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </div>

                 <div className="flex flex-col sm:flex-row items-center gap-2">
                     <Button variant="outline" size="sm" onClick={() => fetchAllData(true)} disabled={isLoading}>
                       <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                       Yenile
                    </Button>
                    <div className="print-hidden">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline">
                                    Dışa Aktar
                                    <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => handleExportExcel(filteredTasks)} disabled={tasks.length === 0}>
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

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant={activePreset === 'Tümü' ? 'default' : 'outline'} size="sm" onClick={setAllTime}>
                            Tümü
                        </Button>
                        {PRESET_DATES.map(preset => (
                            <Button key={preset.label} variant={activePreset === preset.label ? 'default' : 'outline'} size="sm" onClick={() => setPresetDate(preset)}>
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                    <Popover open={isDatePickerOpen} onOpenChange={setIsDatePickerOpen}>
                        <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn("w-full sm:w-auto justify-start text-left font-normal", !date && "text-muted-foreground")}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date?.from ? (
                                date.to ? (
                                    <>
                                    {format(date.from, 'dd.MM.y')} - {format(date.to, 'dd.MM.y')}
                                    </>
                                ) : (
                                    format(date.from, 'dd.MM.y')
                                )
                                ) : (
                                <span>Tarih Aralığı Seçin</span>
                            )}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="range"
                                selected={tempDate}
                                onSelect={setTempDate}
                                initialFocus
                                locale={tr}
                                numberOfMonths={2}
                            />
                            <div className="flex justify-end gap-2 p-2 border-t">
                                <Button variant="ghost" size="sm" onClick={handleCancelDateFilter}>İptal</Button>
                                <Button size="sm" onClick={handleApplyDateFilter}>Uygula</Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="hidden print-block text-center my-4">
                {selectedUser ? (
                    <h1 className="text-xl font-bold">{selectedUser.firstName} {selectedUser.lastName} Adlı Kullanıcının Görevleri</h1>
                ) : (
                    <h1 className="text-xl font-bold">Tüm Kullanıcıların Görevleri</h1>
                )}
                 {date?.from && (
                    <p className="text-sm">
                        {format(date.from, 'dd MMMM yyyy', { locale: tr })} - {date.to ? format(date.to, 'dd MMMM yyyy', { locale: tr }) : ''}
                    </p>
                )}
            </div>


            <div className="flex justify-end print:hidden mb-4">
              <div className="flex flex-wrap items-center gap-2">
                {activeStatusFilter !== 'all' && (
                  <Button variant="secondary" size="sm" onClick={() => setActiveStatusFilter('all')}>Tümünü Göster</Button>
                )}
                {summaryData.map(summary => (
                    summary &&
                     <Button 
                        key={summary.status}
                        variant={activeStatusFilter === summary.status ? 'default' : 'outline'}
                        onClick={() => handleStatusFilterClick(summary.status)}
                        className="h-auto p-2"
                      >
                        <div className="flex items-center gap-2">
                            {summary.config && <StatusIcon status={summary.status} statusConfig={summary.config} />}
                            <span className="font-medium text-xs">{summary.status}</span>
                            <span className="text-xs text-muted-foreground">({summary.total})</span>
                        </div>
                    </Button>
                ))}
              </div>
            </div>

          <section className="task-table-container">
            {statusOptions.map((status) => {
              if(activeStatusFilter !== 'all' && activeStatusFilter !== status) return null;
              
              const taskGroup = tasksByStatus[status];
              if (!taskGroup || taskGroup.length === 0) return null;
              
              const visibleTasks = taskGroup;
              const statusConfig = resolvedStatusConfiguration.find(s => s.label === status);
              

              return (
                <div key={status} id={`status-${status}`} className="mb-10 task-section printable">
                  <h2 className="font-headline text-xl text-foreground flex items-center mb-4 section-header">
                    <StatusIcon status={status} statusConfig={statusConfig} />
                    <span className="ml-2">{status}</span>
                    <span className="text-muted-foreground ml-1">({taskGroup.length})</span>
                  </h2>
                  <div className="relative w-full overflow-auto rounded-md border border-border bg-card">
                    <Table ref={el => tableRefs.current[status] = el} className="w-full" style={{ tableLayout: 'fixed' }}>
                      <TableHeader>
                        <TableRow>
                          {visibleTableFields.map((field) => {
                            if (field.key === 'status') return null;
                            return (
                              <TableHead key={field.key} data-fieldkey={field.key} style={{width: columnWidths[field.key] ? (typeof columnWidths[field.key] === 'number' ? `${columnWidths[field.key]}px` : columnWidths[field.key]) : 'auto'}} className="text-left relative group">
                                {field.label}
                                <div
                                    onMouseDown={(e) => handleMouseDown(e, field.key)}
                                    className="absolute top-0 right-0 h-full w-1 cursor-col-resize select-none opacity-0 group-hover:opacity-100 print:hidden"
                                />
                              </TableHead>
                            );
                          })}
                          <TableHead className="text-left" style={{ width: '150px' }}>Atananlar</TableHead>
                          <TableHead className="text-center print:hidden" style={{ width: '100px' }}>İşlemler</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleTasks.map((task) => (
                          <TableRow key={task.id}>
                            {visibleTableFields.map((field) => {
                                if (field.key === 'status') return null; 

                                return (
                                  <TableCell key={field.key} className="align-top">
                                    <div className="max-h-full overflow-y-auto">
                                        {renderCellContent(task, field)}
                                    </div>
                                  </TableCell>
                                );
                            })}
                            <TableCell className="align-top">
                              <div className="flex items-center -space-x-2">
                                  {task.userIds.map(uid => {
                                      const user = allUsers.find(u => u.uid === uid);
                                      if (!user) return null;
                                      const userIsOnline = isOnline(user);
                                      return (
                                          <Tooltip key={uid}>
                                              <TooltipTrigger asChild>
                                                    <div className="relative">
                                                        <Avatar className="h-8 w-8 border-2 border-card">
                                                            <AvatarImage src={user?.photoURL} />
                                                            <AvatarFallback className={cn("text-sm", user.status === 'inactive' ? 'bg-muted text-muted-foreground' : '')}>
                                                                {getInitials(user)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className={cn(
                                                            "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-card",
                                                            userIsOnline ? "bg-green-500" : "bg-gray-400"
                                                        )} />
                                                    </div>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>{user.firstName} {user.lastName}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {user.status === 'inactive' ? 'Kullanıcı Pasif' : (userIsOnline ? 'Çevrimiçi' : 'Çevrimdışı')}
                                                </p>
                                              </TooltipContent>
                                          </Tooltip>
                                      )
                                  })}
                                   {task.userIds.length === 0 && <span className="text-xs text-muted-foreground pl-2">Atanmamış</span>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center align-top print:hidden">
                                <div className="flex items-center justify-center">
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
                                    {currentUser?.uid === task.creatorId && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteTask(task)}>
                                                    <Trash2 className="h-5 w-5 text-destructive" />
                                                    <span className="sr-only">Görevi Sil</span>
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>Görevi Sil</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
             {filteredTasks.length === 0 && !isLoading && (
              <div className="text-center text-muted-foreground py-10">
                {selectedUserId !== 'all' 
                    ? 'Bu kullanıcının seçili filtreye uyan görevi bulunmamaktadır.'
                    : 'Seçili tarih aralığında gösterilecek görev bulunmamaktadır.'
                }
              </div>
            )}
          </section>

            <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Görevi Silme Onayı</DialogTitle>
                  <DialogDescription>
                    "{taskToDelete?.taskName}" görevini kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>İptal</Button>
                  <Button variant="destructive" onClick={confirmDeleteTask}>Evet, Sil</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
                      {sortedUsersForAssignment.map((user) => {
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
        </main>
      <ScrollToTopButton />
    </TooltipProvider>
  );
}

const TeamDashboardPage = React.memo(TeamDashboardPageContent);
export default TeamDashboardPage;
