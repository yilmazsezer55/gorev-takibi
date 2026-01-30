'use client';

import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import type { Task, FieldSetting, ProcessedRow, TaskChanges, StatusSetting, UserProfile } from '@/types';
import { cn } from '@/lib/utils';
import { TASK_TYPES } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { ArrowUpDown, ArrowUp, ArrowDown, Settings, Save, Loader2, ListFilter, ChevronDown } from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore'; 
import { db } from '@/lib/firebase';
import { Label } from '@/components/ui/label';
import { parse as dateFnsParse, isValid } from 'date-fns';
import Papa from 'papaparse';


const NONE_VALUE = "__NONE__"; // Represents no mapping

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: File;
  existingTasksMap: Map<string, Task>;
  onImport: (selectedRows: ProcessedRow[]) => void;
  resolvedFieldConfiguration: FieldSetting[];
  resolvedStatusConfiguration: StatusSetting[];
  resolvedStatusMappings: Record<string, string>;
  userProfile: UserProfile | null;
}

const toTitleCase = (str: string): string => {
    if (!str) return "";
    return str.split(' ').map(word => {
        if (word.length > 1 && word === word.toLocaleUpperCase('tr-TR')) {
            return word; // Keep acronyms
        }
        const lowerCaseWord = word.toLocaleLowerCase('tr-TR');
        return lowerCaseWord.charAt(0).toLocaleUpperCase('tr-TR') + lowerCaseWord.slice(1);
    }).join(' ');
};

function parseDate(dateString: string, monthMappings: Record<string, string>): Date | null {
    if (!dateString || typeof dateString !== 'string') return null;

    let processedString = dateString.trim().toLowerCase();

    for (const [key, value] of Object.entries(monthMappings)) {
        if (processedString.includes(key)) {
            processedString = processedString.replace(key, value);
            break; 
        }
    }
    
    const formatsToTry = [
        'dd/MM/yyyy HH:mm',
        'dd/MM/yyyy',
    ];

    for (const format of formatsToTry) {
        const parsedDate = dateFnsParse(processedString, format, new Date());
        if (isValid(parsedDate)) {
            return parsedDate;
        }
    }

    const fallbackDate = new Date(dateString);
    if (isValid(fallbackDate)) {
        return fallbackDate;
    }

    return null;
}

const DELIMITER_OPTIONS = [
  { label: 'Noktalı Virgül (;)', value: ';' },
  { label: 'Virgül (,)', value: ',' },
  { label: 'Dikey Çubuk (|)', value: '|' },
  { label: 'Düzeltme İşareti (^)', value: '^' },
  { label: 'Sekme (Tab)', value: '\t' },
];

const detectDelimiter = (text: string): string => {
  const delimiters = [';', ',', '|', '^', '\t'];
  const counts: { [key: string]: number } = { ';': 0, ',': 0, '|': 0, '^': 0, '\t': 0 };
  const lines = text.split('\n').slice(0, 5); // Check first 5 lines

  lines.forEach(line => {
    delimiters.forEach(delimiter => {
      counts[delimiter] += line.split(delimiter).length - 1;
    });
  });

  let maxCount = 0;
  let detectedDelimiter = ';';
  for (const delimiter of delimiters) {
    if (counts[delimiter] > maxCount) {
      maxCount = counts[delimiter];
      detectedDelimiter = delimiter;
    }
  }
  return detectedDelimiter;
};


export default function ImportPreviewModal({
    isOpen,
    onClose,
    file,
    existingTasksMap,
    onImport,
    resolvedFieldConfiguration,
    resolvedStatusConfiguration,
    resolvedStatusMappings,
    userProfile
}: ImportPreviewModalProps) {
  const { currentUser, refreshAuthData } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = React.useState<ProcessedRow[]>([]);
  const [editingCell, setEditingCell] = React.useState<string | null>(null); // "rowIndex-colKey"
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  
  const [csvHeaders, setCsvHeaders] = React.useState<string[]>([]);
  const [dateLikeHeaders, setDateLikeHeaders] = React.useState<string[]>([]);
  const [selectedDateHeader, setSelectedDateHeader] = React.useState<string>(NONE_VALUE);
  const [headerMappings, setHeaderMappings] = React.useState<Record<string, string>>({}); // { fieldKey: csvHeader }
  const [isMappingModalOpen, setIsMappingModalOpen] = React.useState(false);
  const [isSavingMappings, setIsSavingMappings] = React.useState(false);
  const [selectedDelimiter, setSelectedDelimiter] = React.useState(';');
  const [statusFilter, setStatusFilter] = React.useState<Record<string, boolean>>({
    new: true,
    update: true,
    nochange: true,
    deleted: true,
  });


  const importableFields = React.useMemo(() => {
    return resolvedFieldConfiguration.filter(f => f.isDefault || f.isCustom);
  }, [resolvedFieldConfiguration]);
  
  const keyField = React.useMemo(() => importableFields.find(f => f.key === 'taskKey'), [importableFields]);
  const nameField = React.useMemo(() => importableFields.find(f => f.key === 'taskName'), [importableFields]);
  const statusField = React.useMemo(() => importableFields.find(f => f.key === 'status'), [importableFields]);
  const statusOptions = React.useMemo(() => resolvedStatusConfiguration.map(s => s.label), [resolvedStatusConfiguration]);
  
  const processData = React.useCallback((rawData: any[], currentHeaderMappings: Record<string, string>, dateHeader: string) => {
    if (!currentUser || rawData.length === 0 || !keyField || !userProfile || !resolvedStatusMappings) {
        setRows([]);
        return;
    };
    
    const keyFieldCsvHeader = currentHeaderMappings[keyField.key];

    if (!keyFieldCsvHeader || keyFieldCsvHeader === NONE_VALUE) {
        setRows([]);
        return;
    }
    
    const monthMappings: Record<string, string> = {
        'oca': '01', 'şub': '02', 'mar': '03', 'nis': '04', 'may': '05', 'haz': '06',
        'tem': '07', 'ağu': '08', 'eyl': '09', 'eki': '10', 'kas': '11', 'ara': '12',
    };

    const getVal = (row: any, fieldKey: string): string => {
        const targetHeaderFromSettings = currentHeaderMappings[fieldKey];
        if (!targetHeaderFromSettings || targetHeaderFromSettings === NONE_VALUE) return '';
        const matchingHeader = Object.keys(row).find(h => h.trim() === targetHeaderFromSettings.trim());
        if (!matchingHeader) return '';
        return row[matchingHeader] != null ? String(row[matchingHeader]).trim() : '';
    };

    const completedStatusLabel = resolvedStatusConfiguration.find(s => s.id === 'done')?.label || 'TAMAMLANDI';
    const cancelledStatusLabel = resolvedStatusConfiguration.find(s => s.id === 'cancelled')?.label || 'İPTAL EDİLDİ';

    const processed = rawData.map((rawRow, index): ProcessedRow => {
        const taskKey = getVal(rawRow, 'taskKey') || '';
        const existingTask = existingTasksMap.get(taskKey);

        const _isNew = !existingTask;
        const _isDeletedByUser = userProfile.deletedTaskKeys?.includes(taskKey) || false;

        let _hasChanges = false;
        const _changedFields: TaskChanges = {};

        const taskNameFromCsv = toTitleCase(getVal(rawRow, 'taskName') || '');
        const rawStatusFromCsv = getVal(rawRow, 'status');
        const rawStatusFromCsvLc = rawStatusFromCsv.toLocaleLowerCase('tr-TR');
        const mappedStatus = resolvedStatusMappings[rawStatusFromCsvLc] || rawStatusFromCsv; // Use raw if no mapping

        if (_isDeletedByUser || _isNew) {
            _hasChanges = true;
        } else if (existingTask) {
            // Check for status change based on user's specific logic
            if (mappedStatus) {
                const isCsvStatusFinal = (mappedStatus === completedStatusLabel || mappedStatus === cancelledStatusLabel);
                
                if (isCsvStatusFinal) {
                    if (existingTask.status !== mappedStatus) {
                        _hasChanges = true;
                        _changedFields.status = true;
                    }
                }
            }
            
            // Check for other field changes regardless of status
            if (existingTask.taskName !== taskNameFromCsv) {
                _changedFields.taskName = true;
                 _hasChanges = true;
            }
            importableFields.forEach(field => {
                if (field.isCustom) {
                    const newValue = getVal(rawRow, field.key);
                    const oldValue = existingTask.customFields?.[field.key];
                    if (String(newValue || '') !== String(oldValue || '')) {
                        _changedFields[field.key] = true;
                        _hasChanges = true;
                    }
                }
            });
        }
        
        let statusForDisplay: string;
        if (existingTask) {
             statusForDisplay = _hasChanges && _changedFields.status ? mappedStatus : existingTask.status;
        } else {
            statusForDisplay = mappedStatus || statusOptions[0];
        }
        
        const rawTaskType = (getVal(rawRow, 'taskType') || '').toUpperCase();
        const taskType = TASK_TYPES.find(t => t === rawTaskType) || 'ANALİZ';
        const rawProgress = getVal(rawRow, 'progress');
        const progress = rawProgress !== '' && !isNaN(parseInt(rawProgress, 10)) ? parseInt(rawProgress, 10) : null;
        const rawDateString = dateHeader !== NONE_VALUE ? rawRow[dateHeader]?.trim() : null;
        const csvUpdatedAt = rawDateString ? parseDate(rawDateString, monthMappings) : null;
        
        const customFieldsFromCsv: Record<string, any> = {};
        importableFields.forEach(field => {
            if (field.isCustom) {
                customFieldsFromCsv[field.key] = getVal(rawRow, field.key);
            }
        });

        const _errors: string[] = [];
        if (!taskKey && keyField) _errors.push(`${keyField.label} eksik.`);
        if (!taskNameFromCsv && nameField) _errors.push(`${nameField.label} eksik.`);
        const _isValid = _errors.length === 0;

        return {
            _id: index,
            _isSelected: _isValid && _hasChanges && !_isDeletedByUser,
            _isNew,
            _hasChanges,
            _isValid,
            _isDeletedByUser,
            _errors,
            _existingTaskId: existingTask?.id,
            _changedFields,
            taskKey,
            taskName: taskNameFromCsv,
            status: statusForDisplay,
            cityAdmin: getVal(rawRow, 'cityAdmin') || '',
            taskType,
            progress,
            customFields: customFieldsFromCsv,
            originalData: rawRow,
            csvUpdatedAt,
        };
    });
    
    setRows(processed);
    setSortConfig({ key: 'csvUpdatedAt', direction: 'descending' });
  }, [currentUser, existingTasksMap, importableFields, keyField, nameField, userProfile, statusOptions, resolvedStatusMappings, resolvedStatusConfiguration]);

  const parseCsvFile = React.useCallback((delimiter: string, mappings: Record<string, string>, dateHeader: string) => {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: delimiter,
      complete: (results) => {
        if (!results.data || results.data.length === 0 || results.errors.length > 0) {
            toast({ 
                variant: 'destructive', 
                title: 'Dosya Okuma Hatası', 
                description: `Seçilen ayraç ("${delimiter}") ile CSV dosyası okunamadı veya dosya boş. Lütfen doğru ayıracı seçtiğinizden emin olun.`
            });
            setRows([]);
            return;
        }

        const rawData = results.data as any[];
        setCsvHeaders(Object.keys(rawData[0]));
        processData(rawData, mappings, dateHeader);
      },
      error: (error: any) => {
        console.error("PapaParse error:", error);
        toast({ variant: 'destructive', title: 'Dosya Okuma Hatası', description: `CSV dosyası okunurken bir hata oluştu: ${error.message}` });
        setRows([]);
      }
    });
  }, [file, toast, processData]);

  React.useEffect(() => {
    if (isOpen && file) {
      const initialMappings: Record<string, string> = {};
      importableFields.forEach(field => {
        initialMappings[field.key] = field.csvHeader || NONE_VALUE;
      });
      setHeaderMappings(initialMappings);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const detectedDelimiter = detectDelimiter(text);
        setSelectedDelimiter(detectedDelimiter);

        const tempHeaders = text.split('\n')[0].split(detectedDelimiter).map(h => h.trim());
        const dateHeaders = tempHeaders.filter(h => h.toLowerCase().includes('tarih') || h.toLowerCase().includes('güncelleme') || h.toLowerCase().includes('oluşturma') || h.toLowerCase().includes('date') || h.toLowerCase().includes('updated') || h.toLowerCase().includes('created'));
        setDateLikeHeaders(dateHeaders);
        
        const defaultDateHeader = dateHeaders.find(h => h.toLowerCase().includes('güncelleme') || h.toLowerCase().includes('updated')) || (dateHeaders.length > 0 ? dateHeaders[0] : NONE_VALUE);
        setSelectedDateHeader(defaultDateHeader);
        
        parseCsvFile(detectedDelimiter, initialMappings, defaultDateHeader);
      };
      reader.readAsText(file, 'utf-8');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, file]);


  React.useEffect(() => {
    if (isOpen && file && csvHeaders.length > 0) {
        parseCsvFile(selectedDelimiter, headerMappings, selectedDateHeader);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDelimiter, selectedDateHeader, headerMappings]);


  const visibleImportableFields = React.useMemo(() => {
    return importableFields.filter(f => {
      const isMapped = headerMappings[f.key] && headerMappings[f.key] !== NONE_VALUE;
      return f.key !== 'csvUpdatedAt' && f.visible && isMapped;
    });
  }, [importableFields, headerMappings]);

  const filteredAndSortedRows = React.useMemo(() => {
    const filtered = rows.filter(row => {
        if (row._isDeletedByUser) return statusFilter.deleted;
        if (row._isNew) return statusFilter.new;
        if (row._hasChanges) return statusFilter.update;
        return statusFilter.nochange;
    });

    let sortableRows = [...filtered];
    if (sortConfig !== null) {
      sortableRows.sort((a, b) => {
        if (sortConfig.key === 'csvUpdatedAt') {
            const valA = a.csvUpdatedAt?.getTime() || 0;
            const valB = b.csvUpdatedAt?.getTime() || 0;
            if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        }

        const aField = importableFields.find(f => f.key === sortConfig.key);
        const bField = importableFields.find(f => f.key === sortConfig.key);

        const aValue = aField?.isCustom ? a.customFields[sortConfig.key] : a[sortConfig.key as keyof Omit<ProcessedRow, 'customFields'>];
        const bValue = bField?.isCustom ? b.customFields[sortConfig.key] : b[sortConfig.key as keyof Omit<ProcessedRow, 'customFields'>];
        
        const valA = String(aValue || '');
        const valB = String(bValue || '');

        return sortConfig.direction === 'ascending'
          ? valA.localeCompare(valB, 'tr')
          : valB.localeCompare(valA, 'tr');
      });
    }
    return sortableRows;
  }, [rows, sortConfig, importableFields, statusFilter]);

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };


  const handleSelectRow = (id: number) => {
    setRows(currentRows =>
      currentRows.map(row => (row._id === id ? { ...row, _isSelected: !row._isSelected } : row))
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setRows(currentRows => currentRows.map(row => {
        const canBeSelected = row._isValid && (row._hasChanges || row._isDeletedByUser);
        return canBeSelected ? { ...row, _isSelected: checked } : row;
    }));
  };

  const handleCellUpdate = (id: number, fieldKey: string, value: string) => {
    setRows(currentRows =>
      currentRows.map(row => {
        if (row._id === id) {
          const fieldConfig = resolvedFieldConfiguration.find(f => f.key === fieldKey);
          let updatedRow: ProcessedRow;

          if (fieldConfig?.isCustom) {
            updatedRow = { ...row, customFields: { ...row.customFields, [fieldKey]: value } };
          } else {
             updatedRow = { ...row, [fieldKey as keyof Omit<ProcessedRow, 'customFields'>]: value };
          }
          
          const errors: string[] = [];
          if (!updatedRow.taskKey && keyField) errors.push(`${keyField.label} eksik.`);
          if (!updatedRow.taskName && nameField) errors.push(`${nameField.label} eksik.`);
          updatedRow._errors = errors;
          updatedRow._isValid = errors.length === 0;

          if (!updatedRow._isValid) {
            updatedRow._isSelected = false;
          }

          return updatedRow;
        }
        return row;
      })
    );
  };
  
  const handleImportClick = async () => {
    const selectedRows = rows.filter(row => row._isSelected && row._isValid);
    if (selectedRows.length === 0) {
      toast({
        variant: 'destructive',
        title: 'İçe Aktarılacak Görev Yok',
        description: 'Lütfen içe aktarmak için geçerli ve değişikliğe sahip görevleri seçin.',
      });
      return;
    }
    onImport(selectedRows);
  };
  
  const handleSaveMappings = async () => {
    if (userProfile?.role !== 'admin') {
      toast({ variant: 'destructive', title: 'Yetki Hatası', description: 'Bu işlemi sadece yöneticiler yapabilir.' });
      return;
    }
    setIsSavingMappings(true);
    try {
      const updatedConfig = resolvedFieldConfiguration.map(field => {
        const mappedHeader = headerMappings[field.key];
        const currentCsvHeader = mappedHeader === NONE_VALUE ? '' : mappedHeader;
        return {
          ...field,
          options: field.options || [],
          csvHeader: currentCsvHeader,
        };
      });

      const globalSettingsDocRef = doc(db, 'global_settings', 'main');
      await setDoc(globalSettingsDocRef, { fieldConfiguration: updatedConfig }, { merge: true });
      await refreshAuthData();
      
      toast({ title: 'Başarılı', description: 'CSV başlık eşleştirmeleri tüm kullanıcılar için kaydedildi.' });
      setIsMappingModalOpen(false);

    } catch (error: any) {
      console.error('Error saving mappings:', error);
      toast({ variant: 'destructive', title: 'Hata!', description: `Eşleştirmeler kaydedilirken bir hata oluştu: ${error.message}` });
    } finally {
      setIsSavingMappings(false);
    }
  };


  const selectableRowCount = filteredAndSortedRows.filter(r => r._isValid && (r._hasChanges || r._isDeletedByUser)).length;
  const selectedRowCount = filteredAndSortedRows.filter(r => r._isSelected).length;
  const allSelected = selectableRowCount > 0 && selectedRowCount === selectableRowCount;

  const statusCounts = React.useMemo(() => {
    return rows.reduce((acc, row) => {
        if (row._isDeletedByUser) {
            acc.deleted++;
        } else if (row._isNew) {
            acc.new++;
        } else if (row._hasChanges) {
            acc.update++;
        } else {
            acc.nochange++;
        }
        return acc;
    }, { new: 0, update: 0, nochange: 0, deleted: 0 });
  }, [rows]);

  const renderCellContent = (row: ProcessedRow, field: FieldSetting) => {
    const value = field.isCustom ? row.customFields[field.key] : row[field.key as keyof Omit<ProcessedRow, 'customFields'>];
    return String(value || '');
  }

  const getSortIndicator = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />;
    }
    if (sortConfig.direction === 'ascending') {
      return <ArrowUp className="ml-2 h-4 w-4 text-primary" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4 text-primary" />;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>CSV İçe Aktarma Önizlemesi</DialogTitle>
             <DialogDescription>
                Sistem, CSV dosyanız için en uygun ayıracı otomatik olarak algılar. Gerekirse değiştirebilir ve alanların doğru eşleştirildiğinden emin olabilirsiniz.
             </DialogDescription>
          </DialogHeader>
          
          <div className="flex-grow min-h-0 flex flex-col">
              <div className="flex flex-col sm:flex-row items-center justify-between my-2 gap-4">
                  <div className="flex-grow flex items-center space-x-4 flex-wrap gap-y-2">
                    <div className="flex items-center space-x-2">
                        <Label htmlFor="delimiter-select" className="text-sm font-medium whitespace-nowrap">CSV Ayıracı:</Label>
                         <Select value={selectedDelimiter} onValueChange={setSelectedDelimiter}>
                            <SelectTrigger id="delimiter-select" className="h-8 w-auto min-w-[180px]">
                                <SelectValue placeholder="Ayraç seçin..." />
                            </SelectTrigger>
                            <SelectContent>
                                {DELIMITER_OPTIONS.map(option => (
                                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                     <div className="flex items-center space-x-2">
                        <Label htmlFor="date-header-select" className="text-sm font-medium whitespace-nowrap">Tarih Sütunu:</Label>
                         <Select value={selectedDateHeader} onValueChange={setSelectedDateHeader}>
                            <SelectTrigger id="date-header-select" className="h-8 w-auto min-w-[180px]">
                                <SelectValue placeholder="Tarih sütunu seçin..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={NONE_VALUE}>Tarih Yok</SelectItem>
                                {dateLikeHeaders.map(header => (
                                    <SelectItem key={header} value={header}>{header}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                              <ListFilter className="mr-2 h-4 w-4" />
                              Durum Filtresi
                              <ChevronDown className="ml-2 h-4 w-4" />
                          </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                          <DropdownMenuCheckboxItem checked={statusFilter.new} onCheckedChange={(checked) => setStatusFilter(f => ({...f, new: checked}))}>Yeni ({statusCounts.new})</DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem checked={statusFilter.update} onCheckedChange={(checked) => setStatusFilter(f => ({...f, update: checked}))}>Güncelleme ({statusCounts.update})</DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem checked={statusFilter.nochange} onCheckedChange={(checked) => setStatusFilter(f => ({...f, nochange: checked}))}>Güncel ({statusCounts.nochange})</DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem checked={statusFilter.deleted} onCheckedChange={(checked) => setStatusFilter(f => ({...f, deleted: checked}))}>Silinmiş ({statusCounts.deleted})</DropdownMenuCheckboxItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {userProfile?.role === 'admin' && (
                    <Button variant="outline" size="sm" onClick={() => setIsMappingModalOpen(true)}>
                        <Settings className="mr-2 h-4 w-4" />
                        Başlıkları Eşleştir
                    </Button>
                  )}
              </div>
            <ScrollArea className="h-[calc(90vh-15rem)] pr-6">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                        aria-label="Tümünü Seç"
                        disabled={selectableRowCount === 0}
                      />
                    </TableHead>
                    <TableHead className="w-[120px]">İçe Aktarma Durumu</TableHead>
                    {visibleImportableFields.map(field => (
                       <TableHead key={field.key}>
                          <Button variant="ghost" onClick={() => requestSort(field.key)} className="px-2 font-bold text-foreground">
                              {field.label}
                              {getSortIndicator(field.key)}
                          </Button>
                       </TableHead>
                    ))}
                    <TableHead>
                        <Button variant="ghost" onClick={() => requestSort('csvUpdatedAt')} className="px-2 font-bold text-foreground">
                            {selectedDateHeader === NONE_VALUE ? 'Tarih' : selectedDateHeader}
                            {getSortIndicator('csvUpdatedAt')}
                        </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedRows.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={visibleImportableFields.length + 3} className="h-24 text-center">
                            Gösterilecek veri yok. Lütfen ayraç, başlık ve filtre ayarlarınızı kontrol edin.
                          </TableCell>
                      </TableRow>
                  )}
                  {filteredAndSortedRows.map((row) => (
                      <React.Fragment key={row._id}>
                          <TableRow className={cn(!row._isValid && 'bg-destructive/10')}>
                              <TableCell>
                              <Checkbox
                                  checked={row._isSelected}
                                  onCheckedChange={() => handleSelectRow(row._id)}
                                  disabled={!row._isValid || (!row._hasChanges && !row._isDeletedByUser)}
                              />
                              </TableCell>
                              <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                  {row._isDeletedByUser ? (
                                      <Badge variant="destructive" className="border-red-600 bg-red-50 text-red-700">Silinmiş</Badge>
                                  ) : row._isNew ? (
                                  <Badge variant="secondary" className="border-green-600 bg-green-50 text-green-700">Yeni</Badge>
                                  ) : row._hasChanges ? (
                                  <Badge variant="outline" className="border-yellow-600 bg-yellow-50 text-yellow-700">Güncelleme</Badge>
                                  ) : (
                                  <Badge variant="outline" className="border-gray-400 bg-gray-100 text-gray-600">Güncel</Badge>
                                  )}
                                  {!row._isValid && (
                                  <Badge variant="destructive">Hatalı</Badge>
                                  )}
                              </div>
                              </TableCell>
                              {visibleImportableFields.map(field => (
                                  <TableCell key={field.key} className={cn(row._changedFields[field.key] && 'bg-yellow-100 dark:bg-yellow-900/30')}>
                                      {editingCell === `${row._id}-${field.key}` ? (
                                          field.key === 'status' ? (
                                              <Select
                                                  defaultValue={renderCellContent(row, field)}
                                                  onValueChange={(value) => {
                                                      handleCellUpdate(row._id, field.key, value);
                                                      setEditingCell(null);
                                                  }}
                                              >
                                                  <SelectTrigger className="h-8 w-[180px]">
                                                      <SelectValue placeholder="Durum Seçin" />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                      {statusOptions.map(option => (
                                                          <SelectItem key={option} value={option}>{option}</SelectItem>
                                                      ))}
                                                  </SelectContent>
                                              </Select>
                                          ) : (
                                              <Input
                                                  defaultValue={renderCellContent(row, field)}
                                                  autoFocus
                                                  onBlur={(e) => {
                                                      handleCellUpdate(row._id, field.key, e.target.value);
                                                      setEditingCell(null);
                                                  }}
                                                  onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                          handleCellUpdate(row._id, field.key, e.currentTarget.value);
                                                          setEditingCell(null);
                                                      } else if (e.key === 'Escape') {
                                                          setEditingCell(null);
                                                      }
                                                  }}
                                                  className="h-8"
                                              />
                                          )
                                      ) : (
                                          <div onClick={() => setEditingCell(`${row._id}-${field.key}`)} className={cn("min-h-[2rem] flex items-center", 'cursor-pointer')}>
                                              {renderCellContent(row, field) || <span className="text-muted-foreground italic">boş</span>}
                                          </div>
                                      )}
                                  </TableCell>
                              ))}
                              <TableCell>
                                {row.csvUpdatedAt ? row.csvUpdatedAt.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : <span className="text-muted-foreground italic">tarih yok</span>}
                              </TableCell>
                          </TableRow>
                      </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
  
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>İptal</Button>
            <Button onClick={handleImportClick} disabled={selectedRowCount === 0}>
                Seçilenleri İçe Aktar {selectedRowCount > 0 && `(${selectedRowCount})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {userProfile?.role === 'admin' && (
        <Dialog open={isMappingModalOpen} onOpenChange={setIsMappingModalOpen}>
            <DialogContent className="max-w-2xl">
                 <DialogHeader>
                    <DialogTitle>CSV Başlık Eşleştirme</DialogTitle>
                    <DialogDescription>
                        Uygulamadaki alanları CSV dosyanızdaki sütunlarla eşleştirin. Bu ayarlar kaydedildiğinde tüm kullanıcılar için varsayılan olacaktır.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] p-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 p-4">
                        {importableFields.filter(f => f.key !== 'csvUpdatedAt').map(field => (
                            <div key={field.key} className="flex flex-col gap-2">
                                <label className="font-medium text-sm">{field.label}</label>
                                <Select
                                    value={headerMappings[field.key] || NONE_VALUE}
                                    onValueChange={(value) => setHeaderMappings(prev => ({...prev, [field.key]: value}))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="CSV Sütunu Seçin" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={NONE_VALUE}>Eşleştirme Yok</SelectItem>
                                        {csvHeaders.map(header => (
                                            <SelectItem key={header} value={header}>{header}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setIsMappingModalOpen(false)}>İptal</Button>
                    <Button onClick={handleSaveMappings} disabled={isSavingMappings}>
                        {isSavingMappings ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Kaydet
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
      )}
    </>
  );
}
