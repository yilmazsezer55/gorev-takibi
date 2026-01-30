'use client';

import * as React from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { Task, UserProfile } from '@/types';
import { cn } from '@/lib/utils';
import { ArrowUpDown, ArrowUp, ArrowDown, FileDown, Trash2, Loader2 } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';

interface PurgePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasksToPurge: Task[];
  onConfirmPurge: (selectedTasks: Task[]) => Promise<void>;
  allUsers: UserProfile[];
}

type SortConfig = {
  key: keyof Task | 'assignees';
  direction: 'ascending' | 'descending';
};

export default function PurgePreviewModal({
    isOpen,
    onClose,
    tasksToPurge,
    onConfirmPurge,
    allUsers
}: PurgePreviewModalProps) {
  const [selectedTasks, setSelectedTasks] = React.useState<Set<string>>(new Set());
  const [isPurging, setIsPurging] = React.useState(false);
  const [sortConfig, setSortConfig] = React.useState<SortConfig | null>({ key: 'updatedAt', direction: 'descending' });

  React.useEffect(() => {
    if (isOpen) {
      // Initially, select all tasks that are fetched
      setSelectedTasks(new Set(tasksToPurge.map(t => t.id)));
    }
  }, [isOpen, tasksToPurge]);

  const getAssignees = React.useCallback((task: Task): string => {
    if (!task.userIds || task.userIds.length === 0) return 'Atanmamış';
    return task.userIds.map(uid => {
      const user = allUsers.find(u => u.uid === uid);
      return user ? `${user.firstName} ${user.lastName}` : uid;
    }).join(', ');
  }, [allUsers]);

  const sortedTasks = React.useMemo(() => {
    let sortableItems = [...tasksToPurge];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortConfig.key === 'assignees') {
          aValue = getAssignees(a);
          bValue = getAssignees(b);
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }

        if (aValue instanceof Timestamp && bValue instanceof Timestamp) {
            aValue = aValue.toMillis();
            bValue = bValue.toMillis();
        } else {
            aValue = String(aValue || '').toLowerCase();
            bValue = String(bValue || '').toLowerCase();
        }
        
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [tasksToPurge, sortConfig, getAssignees]);

  const requestSort = (key: SortConfig['key']) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getSortIndicator = (key: SortConfig['key']) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    if (sortConfig.direction === 'ascending') {
      return <ArrowUp className="ml-2 h-4 w-4 text-primary" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  const handleSelectTask = (taskId: string) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTasks(new Set(tasksToPurge.map(t => t.id)));
    } else {
      setSelectedTasks(new Set());
    }
  };

  const handlePurgeClick = async () => {
    setIsPurging(true);
    const tasksToActuallyDelete = tasksToPurge.filter(t => selectedTasks.has(t.id));
    await onConfirmPurge(tasksToActuallyDelete);
    setIsPurging(false);
  };
  
  const handleExport = () => {
    const tasksToExport = sortedTasks.filter(t => selectedTasks.has(t.id));
    if (tasksToExport.length === 0) {
      alert("Dışa aktarılacak seçili görev yok.");
      return;
    }
    const data = tasksToExport.map(task => ({
      'Görev Adı': task.taskName,
      'Görev Anahtarı': task.taskKey,
      'Durum': task.status,
      'Son Güncelleme': task.updatedAt instanceof Timestamp ? task.updatedAt.toDate().toLocaleDateString('tr-TR') : task.updatedAt,
      'Atananlar': getAssignees(task)
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Silinecek Görevler");
    XLSX.writeFile(workbook, `Silinecek_Gorevler_Yedegi_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const allSelected = tasksToPurge.length > 0 && selectedTasks.size === tasksToPurge.length;

  return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Eski Görevleri Temizleme Önizlemesi</DialogTitle>
            <DialogDescription>
              Aşağıda silinmek üzere bulunan görevler listelenmiştir. Silmek istemediklerinizi listeden çıkarabilirsiniz.
              Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-grow min-h-0 flex flex-col">
            <div className="flex items-center justify-end py-2">
                <Button variant="outline" size="sm" onClick={handleExport}>
                    <FileDown className="mr-2 h-4 w-4" />
                    Seçilileri CSV Olarak Dışa Aktar
                </Button>
            </div>
            <ScrollArea className="flex-grow">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                        aria-label="Tümünü Seç"
                      />
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" onClick={() => requestSort('taskName')}>
                          Görev Adı {getSortIndicator('taskName')}
                      </Button>
                    </TableHead>
                    <TableHead>
                       <Button variant="ghost" onClick={() => requestSort('status')}>
                          Durum {getSortIndicator('status')}
                      </Button>
                    </TableHead>
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('assignees')}>
                          Atananlar {getSortIndicator('assignees')}
                        </Button>
                    </TableHead>
                    <TableHead>
                       <Button variant="ghost" onClick={() => requestSort('updatedAt')}>
                          Son Güncelleme {getSortIndicator('updatedAt')}
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <Checkbox
                              checked={selectedTasks.has(task.id)}
                              onCheckedChange={() => handleSelectTask(task.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{task.taskName}</TableCell>
                        <TableCell>{task.status}</TableCell>
                        <TableCell>{getAssignees(task)}</TableCell>
                        <TableCell>{task.updatedAt instanceof Timestamp ? task.updatedAt.toDate().toLocaleDateString('tr-TR') : 'Bilinmiyor'}</TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
  
          <DialogFooter>
            <div className="flex justify-between items-center w-full">
                <div className="text-sm text-muted-foreground">
                    {selectedTasks.size} / {tasksToPurge.length} görev silinecek.
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>İptal</Button>
                    <Button variant="destructive" onClick={handlePurgeClick} disabled={isPurging || selectedTasks.size === 0}>
                        {isPurging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Seçili Görevleri Kalıcı Olarak Sil
                    </Button>
                </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
