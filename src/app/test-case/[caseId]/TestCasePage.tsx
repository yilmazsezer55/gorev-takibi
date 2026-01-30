'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, addDoc, collection, Timestamp, setDoc, onSnapshot } from 'firebase/firestore';
import type { TestCase, TestStep, TestStepStatus, Task, UserProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import AppHeader from '@/components/header';
import { Loader2, PlusCircle, Trash2, Edit, Save, X, ArrowLeft, GripVertical, Check, AlertTriangle, CircleHelp, Bug, Copy, FileDown, ChevronDown, Bold, List, Columns, ListFilter, Printer } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { FirestorePermissionError } from '@/firebase/errors';
import { errorEmitter } from '@/firebase/error-emitter';

const TEST_STEP_STATUSES: TestStepStatus[] = ['Başarılı', 'Başarısız', 'Koşulmadı'];

const StatusIndicator = ({ status }: { status: TestStepStatus }) => {
    switch (status) {
        case 'Başarılı':
            return <Check className="h-5 w-5 text-green-500" />;
        case 'Başarısız':
            return <X className="h-5 w-5 text-red-500" />;
        case 'Koşulmadı':
        default:
            return <CircleHelp className="h-5 w-5 text-gray-500" />;
    }
};

const BUG_ASSIGN_DIALOG_TITLE_ID = 'bug-assign-dialog-title';
const BUG_ASSIGN_DIALOG_DESC_ID = 'bug-assign-dialog-desc';

type CopyOption = 'before' | 'specific' | 'after' | 'last';

const renderFormattedText = (text: string | undefined) => {
    if (!text) return null;

    const lines = text.split('\n');
    let htmlContent = '';
    let inList = false;

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('• ')) {
            if (!inList) {
                htmlContent += '<ul>';
                inList = true;
            }
            let listItem = trimmedLine.substring(2);
            listItem = listItem.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
            htmlContent += `<li>${listItem}</li>`;
        } else {
            if (inList) {
                htmlContent += '</ul>';
                inList = false;
            }
            let paragraph = line;
            paragraph = paragraph.replace(/\*(.*?)\*/g, '<strong>$1</strong>');
            htmlContent += `<p>${paragraph}</p>`;
        }
    });

    if (inList) {
        htmlContent += '</ul>';
    }

    htmlContent = htmlContent.replace(/<p><\/p>/g, '');

    return <div dangerouslySetInnerHTML={{ __html: htmlContent }} className="prose dark:prose-invert prose-sm max-w-none" />;
};


function TestCasePageContent() {
    const { currentUser, userProfile, allUsers, loading: authLoading, registerListener } = useAuth();
    const router = useRouter();
    const params = useParams();
    const { toast } = useToast();
    const caseId = params.caseId as string;

    const [testCase, setTestCase] = React.useState<TestCase | null>(null);
    const [localSteps, setLocalSteps] = React.useState<TestStep[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isStepModalOpen, setIsStepModalOpen] = React.useState(false);
    const [editingStep, setEditingStep] = React.useState<TestStep | null>(null);

    const [editingCell, setEditingCell] = React.useState<string | null>(null); // "stepId-fieldName"

    const [isBugModalOpen, setIsBugModalOpen] = React.useState(false);
    const [bugToCreate, setBugToCreate] = React.useState<TestStep | null>(null);
    const [selectedBugAssignees, setSelectedBugAssignees] = React.useState<string[]>([]);
    const [isCreatingBug, setIsCreatingBug] = React.useState(false);

    const [isCopyModalOpen, setIsCopyModalOpen] = React.useState(false);
    const [stepToCopy, setStepToCopy] = React.useState<TestStep | null>(null);
    const [copyOption, setCopyOption] = React.useState<CopyOption>('after');
    const [specificStepNumber, setSpecificStepNumber] = React.useState('');
    const [isCopying, setIsCopying] = React.useState(false);

    const [isAdjustingWidths, setIsAdjustingWidths] = React.useState(false);
    const [isSavingWidths, setIsSavingWidths] = React.useState(false);
    const [columnWidths, setColumnWidths] = React.useState<Record<string, string>>({});
    const resizingRef = React.useRef<{ fieldKey: string; startX: number; startWidth: number; } | null>(null);

    const [statusFilter, setStatusFilter] = React.useState<Record<TestStepStatus, boolean>>({
        'Başarılı': true,
        'Başarısız': true,
        'Koşulmadı': true,
    });

    React.useEffect(() => {
        if (!authLoading && currentUser) {
            const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'testCaseView');
            getDoc(settingsDocRef).then(docSnap => {
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    if (settings.columnWidths) {
                        setColumnWidths(settings.columnWidths);
                    }
                }
            });
        }
    }, [authLoading, currentUser]);

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
        if (newWidth > 75) {
            setColumnWidths(prev => ({ ...prev, [fieldKey]: `${newWidth}px` }));
        }
    }, []);

    const handleMouseUp = React.useCallback(() => {
        resizingRef.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseMove]);

    const handleSaveWidths = async () => {
        if (!currentUser) return;

        setIsSavingWidths(true);
        try {
            const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'testCaseView');
            await setDoc(settingsDocRef, { columnWidths }, { merge: true });
            toast({ title: 'Başarılı', description: 'Test senaryosu sütun genişlikleri kaydedildi.' });
            setIsAdjustingWidths(false);
        } catch (error: any) {
            console.error("Error saving column widths:", error);
            toast({ variant: 'destructive', title: 'Hata!', description: `Genişlikler kaydedilirken bir hata oluştu: ${error.message}` });
        } finally {
            setIsSavingWidths(false);
        }
    };

    React.useEffect(() => {
        if (testCase?.steps) {
            const sortedSteps = [...testCase.steps].sort((a, b) => a.stepNumber - b.stepNumber);
            setLocalSteps(sortedSteps);
        }
    }, [testCase]);

    React.useEffect(() => {
        if (authLoading || !currentUser || !caseId) {
            return;
        }

        setIsLoading(true);
        const testCaseDocRef = doc(db, 'testCases', caseId);

        const unsubscribe = onSnapshot(testCaseDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setTestCase({ id: docSnap.id, ...docSnap.data() } as TestCase);
            } else {
                toast({ variant: 'destructive', title: 'Hata', description: 'Test senaryosu bulunamadı.' });
                setTestCase(null);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching test case with onSnapshot:", error);
            const permissionError = new FirestorePermissionError({
                path: `testCases/${caseId}`,
                operation: 'get',
            });
            errorEmitter.emit('permission-error', permissionError);
            setIsLoading(false);
        });

        // Register the listener for cleanup on logout/unmount
        const unregister = registerListener(unsubscribe);

        return () => {
            unregister();
        };

    }, [caseId, currentUser, authLoading, toast, registerListener]);

    const handleExportExcel = () => {
        if (!testCase) return;
        const headers = ["No", "Adım Açıklaması", "Beklenen Sonuç", "Gerçekleşen Sonuç", "Durum"];
        const data = localSteps.map((step) => ({
            "No": step.stepNumber,
            "Adım Açıklaması": step.description,
            "Beklenen Sonuç": step.expectedResult,
            "Gerçekleşen Sonuç": step.actualResult || '',
            "Durum": step.status,
        }));

        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Test Adımları");
        XLSX.writeFile(workbook, `Test_Senaryosu_${testCase.taskKey || testCase.id}.xlsx`);
    };

    const handleSaveStep = async () => {
        if (!caseId || !editingStep || (!editingStep.description || !editingStep.expectedResult)) return;

        const testCaseRef = doc(db, 'testCases', caseId);

        try {
            let finalSteps;
            if (editingStep.id) {
                finalSteps = localSteps.map(s => s.id === editingStep.id ? editingStep : s);
                toast({ title: "Başarılı", description: "Test adımı güncellendi." });
            } else {
                const stepToAdd: TestStep = {
                    ...editingStep,
                    id: uuidv4(),
                    stepNumber: (localSteps.length || 0) + 1,
                    status: 'Koşulmadı',
                };
                finalSteps = [...localSteps, stepToAdd];
                toast({ title: "Başarılı", description: "Yeni test adımı eklendi." });
            }
            await updateDoc(testCaseRef, {
                steps: finalSteps,
                updatedAt: serverTimestamp()
            });
            // Data will be re-fetched by onSnapshot
        } catch (error) {
            console.error("Error saving step: ", error);
            toast({ variant: 'destructive', title: 'Hata', description: "Test adımı kaydedilemedi." });
        } finally {
            closeStepModal();
        }
    };

    const handleDeleteStep = async (stepId: string) => {
        if (!caseId) return;

        const testCaseRef = doc(db, 'testCases', caseId);

        try {
            const remainingSteps = localSteps
                .filter(s => s.id !== stepId)
                .sort((a, b) => a.stepNumber - b.stepNumber)
                .map((step, index) => ({ ...step, stepNumber: index + 1 }));

            await updateDoc(testCaseRef, {
                steps: remainingSteps,
                updatedAt: serverTimestamp()
            });
            toast({ title: "Başarılı", description: "Test adımı silindi." });
            // Data will be re-fetched by onSnapshot
        } catch (error) {
            console.error("Error deleting step: ", error);
            toast({ variant: 'destructive', title: 'Hata', description: "Test adımı silinemedi." });
        }
    };

    const handleActualResultBlur = async () => {
        if (!caseId) return;
        const testCaseRef = doc(db, 'testCases', caseId);
        setEditingCell(null);
        try {
            await updateDoc(testCaseRef, { steps: localSteps, updatedAt: serverTimestamp() });
            toast({ title: "Kaydedildi", description: "Gerçekleşen sonuç güncellendi." });
            // Data will be re-fetched by onSnapshot
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Hata', description: 'Gerçekleşen sonuç güncellenemedi.' });
        }
    };

    const handleStatusChange = async (stepId: string, status: TestStepStatus) => {
        if (!caseId) return;
        const testCaseRef = doc(db, 'testCases', caseId);
        const updatedSteps = localSteps.map(s => s.id === stepId ? { ...s, status } : s);
        try {
            await updateDoc(testCaseRef, { steps: updatedSteps, updatedAt: serverTimestamp() });
            // Data will be re-fetched by onSnapshot
        } catch (e) {
            console.error(e);
            toast({ variant: 'destructive', title: 'Hata', description: 'Durum güncellenemedi.' });
        }
    };

    const openStepModal = (step: TestStep | null) => {
        if (step) {
            setEditingStep(step);
        } else {
            setEditingStep({
                id: '',
                stepNumber: 0,
                description: '',
                expectedResult: '',
                actualResult: '',
                status: 'Koşulmadı'
            });
        }
        setIsStepModalOpen(true);
    };

    const closeStepModal = () => {
        setIsStepModalOpen(false);
        setEditingStep(null);
    };

    const handleOpenBugModal = (step: TestStep) => {
        setBugToCreate(step);
        setSelectedBugAssignees([]);
        setIsBugModalOpen(true);
    };

    const handleOpenCopyModal = (step: TestStep) => {
        setStepToCopy(step);
        setCopyOption('after');
        setSpecificStepNumber('');
        setIsCopyModalOpen(true);
    };

    const handleCopyStep = async () => {
        if (!stepToCopy || !caseId) return;

        setIsCopying(true);
        const originalSteps = [...localSteps].sort((a, b) => a.stepNumber - b.stepNumber);
        let insertIndex = -1;

        if (copyOption === 'last') {
            insertIndex = originalSteps.length;
        } else if (copyOption === 'specific') {
            const targetStep = parseInt(specificStepNumber, 10);
            if (isNaN(targetStep) || targetStep <= 0 || targetStep > originalSteps.length + 1) {
                toast({ variant: 'destructive', title: 'Hata', description: `Geçersiz adım numarası. 1 ile ${originalSteps.length + 1} arasında bir sayı girin.` });
                setIsCopying(false);
                return;
            }
            insertIndex = targetStep - 1;
        } else {
            const relativeStepIndex = originalSteps.findIndex(s => s.id === stepToCopy.id);
            if (relativeStepIndex === -1) {
                toast({ variant: 'destructive', title: 'Hata', description: 'Referans adım bulunamadı.' });
                setIsCopying(false);
                return;
            }
            insertIndex = copyOption === 'before' ? relativeStepIndex : relativeStepIndex + 1;
        }

        const newStep: TestStep = {
            ...stepToCopy,
            id: uuidv4(),
            description: `KOPYALA - ${stepToCopy.description}`,
            stepNumber: 0,
            status: 'Koşulmadı',
            actualResult: ''
        };

        const newSteps = [...originalSteps];
        newSteps.splice(insertIndex, 0, newStep);

        const finalSteps = newSteps.map((step, index) => ({
            ...step,
            stepNumber: index + 1
        }));

        try {
            const testCaseRef = doc(db, 'testCases', caseId);
            await updateDoc(testCaseRef, {
                steps: finalSteps,
                updatedAt: serverTimestamp()
            });
            toast({ title: "Başarılı", description: "Test adımı kopyalandı." });
            setIsCopyModalOpen(false);
        } catch (error) {
            console.error("Error copying step: ", error);
            toast({ variant: 'destructive', title: 'Hata', description: 'Test adımı kopyalanamadı.' });
        } finally {
            setIsCopying(false);
        }
    };

    const handleCreateBugTask = async () => {
        if (!bugToCreate || !testCase || !userProfile || selectedBugAssignees.length === 0) {
            toast({ variant: 'destructive', title: 'Eksik Bilgi', description: 'Hata kaydı oluşturmak için en az bir kişiyi atamanız gerekir.' });
            return;
        }

        setIsCreatingBug(true);
        try {
            const firstStatusOption = "YAPILACAK";
            const progressNotes = `Hata, "${testCase.taskName}" (${testCase.taskKey}) test senaryosunun ${bugToCreate.stepNumber}. adımında bulundu.\n\nAdım Açıklaması:\n${bugToCreate.description}\n\nBeklenen Sonuç:\n${bugToCreate.expectedResult}\n\nGerçekleşen Sonuç:\n${bugToCreate.actualResult || '(Girilmedi)'}`;

            const bugTask: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'creatorId'> = {
                taskName: `HATA: ${testCase.taskName} - Adım ${bugToCreate.stepNumber}`,
                taskKey: testCase.taskKey,
                taskType: "HATA",
                status: firstStatusOption,
                userIds: selectedBugAssignees,
                progress: 0,
                cityAdmin: '',
                progressNotes,
                history: [{
                    action: 'created_from_test_case',
                    details: `Hata kaydı, ${userProfile.firstName} tarafından test senaryosundan oluşturuldu.`,
                    timestamp: new Date(),
                    actorId: userProfile.uid,
                }]
            };

            await addDoc(collection(db, "tasks"), {
                ...bugTask,
                creatorId: userProfile.uid, // Set creatorId
                createdAt: serverTimestamp() as Timestamp,
                updatedAt: serverTimestamp() as Timestamp,
            }).catch(async (serverError) => {
                const permissionError = new FirestorePermissionError({
                    path: 'tasks',
                    operation: 'create',
                    requestResourceData: bugTask,
                });
                errorEmitter.emit('permission-error', permissionError);
                throw serverError;
            });


            toast({ title: "Başarılı!", description: "Hata kaydı oluşturuldu ve ilgili kişilere atandı." });
            setIsBugModalOpen(false);
            setBugToCreate(null);

        } catch (error) {
            console.error("Error creating bug task:", error);
            if (!(error instanceof FirestorePermissionError)) {
                toast({ variant: 'destructive', title: 'Hata', description: 'Hata kaydı oluşturulamadı.' });
            }
        } finally {
            setIsCreatingBug(false);
        }
    };

    const applyFormat = (
        currentValue: string,
        textarea: HTMLTextAreaElement,
        format: 'bold' | 'bullet'
    ): string => {
        if (!textarea) return currentValue;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = currentValue.substring(start, end);

        let replacement;
        if (format === 'bold') {
            replacement = `*${selectedText}*`;
        } else { // bullet
            replacement = `• ${selectedText}`;
        }

        return currentValue.substring(0, start) + replacement + currentValue.substring(end);
    };

    const handleTextareaChange = (
        event: React.ChangeEvent<HTMLTextAreaElement>,
        updateFn: (value: string) => void
    ) => {
        const { value, selectionStart } = event.target;

        // Auto bullet on Enter
        const lastChar = value[selectionStart - 1];
        if (lastChar === '\n') {
            const startStr = value.substring(0, selectionStart);
            const lines = startStr.split('\n');
            const currentLine = lines[lines.length - 2] || '';

            if (currentLine.trim().startsWith('• ')) {
                const newValue = `${startStr}• `;
                updateFn(newValue);
                setTimeout(() => event.target.setSelectionRange(selectionStart + 2, selectionStart + 2), 0);
                return;
            } else if (currentLine.trim() === '•') { // User pressed Enter on an empty bullet, so remove it
                const previousLines = lines.slice(0, -2).join('\n');
                const endStr = value.substring(selectionStart);
                const newValue = (previousLines ? previousLines.length + 1 : 0) + endStr;
                updateFn(newValue);
                setTimeout(() => {
                    const newCursorPos = (previousLines ? previousLines.length + 1 : 0);
                    event.target.setSelectionRange(newCursorPos, newCursorPos);
                }, 0);
                return;
            }
        }

        // Auto-capitalization after bullet point + space
        if (selectionStart > 2 && value[selectionStart - 2] === '•' && value[selectionStart - 1] === ' ') {
            const charToCapitalize = value[selectionStart];
            if (charToCapitalize && charToCapitalize.toLocaleLowerCase('tr-TR') === charToCapitalize) {
                const newValue = value.substring(0, selectionStart) + charToCapitalize.toLocaleUpperCase('tr-TR') + value.substring(selectionStart + 1);
                updateFn(newValue);
                setTimeout(() => event.target.setSelectionRange(selectionStart + 1, selectionStart + 1), 0);
                return;
            }
        }

        updateFn(value);
    };

    const statusCounts = React.useMemo(() => {
        return localSteps.reduce((acc, step) => {
            acc[step.status] = (acc[step.status] || 0) + 1;
            return acc;
        }, {} as Record<TestStepStatus, number>);
    }, [localSteps]);

    const filteredSteps = React.useMemo(() => {
        return localSteps.filter(step => statusFilter[step.status]);
    }, [localSteps, statusFilter]);

    if (isLoading || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
            </div>
        );
    }

    if (!testCase) {
        return (
            <>
                <AppHeader />
                <main className="flex items-center justify-center min-h-[calc(100vh-80px)] bg-background">
                    <Card>
                        <CardHeader>
                            <CardTitle>Test Senaryosu Bulunamadı</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p>Bu test senaryosu mevcut değil veya silinmiş.</p>
                            <Button onClick={() => router.push('/')} className="mt-4">
                                <ArrowLeft className="mr-2 h-4 w-4" /> Ana Sayfaya Dön
                            </Button>
                        </CardContent>
                    </Card>
                </main>
            </>
        );
    }

    const tableHeaders = [
        { key: 'stepNumber', label: 'No' },
        { key: 'description', label: 'Adım Açıklaması' },
        { key: 'expectedResult', label: 'Beklenen Sonuç' },
        { key: 'actualResult', label: 'Gerçekleşen Sonuç' },
        { key: 'status', label: 'Durum' },
        { key: 'actions', label: 'İşlemler' }
    ];

    const sortedUsersForList = React.useMemo(() => {
        if (!allUsers) return [];
        const visibleUsers = allUsers.filter(u => !u.hideFromTaskAssignment);
        const activeUsers = visibleUsers.filter(u => (u.status || 'active') === 'active');
        const inactiveUsers = visibleUsers.filter(u => u.status === 'inactive');

        const sortFn = (a: UserProfile, b: UserProfile) => `${a.firstName} ${b.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'tr');

        return [...activeUsers.sort(sortFn), ...inactiveUsers.sort(sortFn)];
    }, [allUsers]);

    return (
        <>
            <TooltipProvider>
                <AppHeader />
                <main className="container mx-auto p-4 sm:p-6 lg:p-8 flex flex-col h-full">
                    <div className="flex-shrink-0 mb-4">
                        <div className="flex justify-between items-center flex-wrap gap-2">
                            <Button variant="outline" onClick={() => router.back()} className="print:hidden">
                                <ArrowLeft className="mr-2 h-4 w-4" /> Geri
                            </Button>
                            {isAdjustingWidths && (
                                <div className="flex flex-wrap items-center gap-2 p-2 rounded-md bg-accent/20 border border-accent print:hidden">
                                    <p className="text-sm font-medium text-accent-foreground">Sütunları ayarlayın ve kaydedin.</p>
                                    <Button onClick={handleSaveWidths} size="sm" disabled={isSavingWidths}>
                                        {isSavingWidths ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        Kaydet
                                    </Button>
                                    <Button onClick={() => setIsAdjustingWidths(false)} size="sm" variant="ghost">İptal</Button>
                                </div>
                            )}
                            <div className="flex items-center gap-2 print:hidden">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="sm">
                                            <ListFilter className="mr-2 h-4 w-4" />
                                            Durum Filtresi
                                            <ChevronDown className="ml-2 h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                        {TEST_STEP_STATUSES.map(status => (
                                            <DropdownMenuCheckboxItem
                                                key={status}
                                                checked={statusFilter[status]}
                                                onCheckedChange={(checked) => setStatusFilter(f => ({ ...f, [status]: checked }))}
                                            >
                                                {status} ({statusCounts[status] || 0})
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <div className="print:hidden">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline">
                                                Dışa Aktar
                                                <ChevronDown className="ml-2 h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onSelect={handleExportExcel} disabled={localSteps.length === 0}>
                                                <FileDown className="mr-2 h-4 w-4" />
                                                <span>Excel'e Aktar</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onSelect={() => window.print()} disabled={localSteps.length === 0}>
                                                <Printer className="mr-2 h-4 w-4" />
                                                <span>Yazdır</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                {!isAdjustingWidths && (
                                    <Button onClick={() => setIsAdjustingWidths(true)} variant="outline" size="sm">
                                        <Columns className="mr-2 h-4 w-4" /> Genişlikleri Ayarla
                                    </Button>
                                )}
                                <Button onClick={() => openStepModal(null)}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Yeni Adım Ekle
                                </Button>
                            </div>
                        </div>
                    </div>
                    <Card className="flex-grow flex flex-col overflow-hidden printable" id="test-case-card">
                        <div className="flex-shrink-0 border-b p-6 print:border-none">
                            <CardHeader className="p-0">
                                <CardTitle className="text-2xl font-headline text-primary">Test Senaryosu: {testCase.taskName}</CardTitle>
                                <CardDescription>Görev Anahtarı: {testCase.taskKey}</CardDescription>
                            </CardHeader>
                        </div>

                        <div className="flex-grow overflow-auto">
                            <Table style={{ tableLayout: 'fixed', width: '100%' }}>
                                <TableHeader className="sticky top-0 bg-card z-10 print:static">
                                    <TableRow>
                                        {tableHeaders.map(header => (
                                            <TableHead
                                                key={header.key}
                                                style={{ width: columnWidths[header.key] || 'auto' }}
                                                className={cn(
                                                    "relative group",
                                                    header.key === 'actions' && 'print:hidden'
                                                )}
                                            >
                                                {header.label}
                                                {isAdjustingWidths && header.key !== 'actions' && (
                                                    <div
                                                        onMouseDown={(e) => handleMouseDown(e, header.key)}
                                                        className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none opacity-0 group-hover:opacity-100 print:hidden"
                                                    />
                                                )}
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredSteps.map((step, index) => (
                                        <TableRow key={step.id}>
                                            <TableCell className="align-top">{step.stepNumber}</TableCell>
                                            <TableCell className="align-top whitespace-pre-wrap break-words">{renderFormattedText(step.description)}</TableCell>
                                            <TableCell className="align-top whitespace-pre-wrap break-words">{renderFormattedText(step.expectedResult)}</TableCell>
                                            <TableCell className="align-top">
                                                {editingCell === `${step.id}-actualResult` ? (
                                                    <Textarea
                                                        value={step.actualResult || ''}
                                                        onChange={(e) => handleTextareaChange(e, (newValue) => {
                                                            setLocalSteps(prev => prev.map(s => s.id === step.id ? { ...s, actualResult: newValue } : s));
                                                        })}
                                                        onBlur={handleActualResultBlur}
                                                        onInput={(e) => {
                                                            const target = e.currentTarget;
                                                            target.style.height = 'auto';
                                                            target.style.height = `${target.scrollHeight}px`;
                                                        }}
                                                        placeholder="Gözlemlenen sonucu girin..."
                                                        rows={1}
                                                        className="w-full text-sm resize-none overflow-hidden bg-transparent p-0 border-0 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 whitespace-pre-wrap break-words"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <div onClick={() => setEditingCell(`${step.id}-actualResult`)} className="min-h-[2rem] w-full cursor-text">
                                                        {renderFormattedText(step.actualResult) || <span className="text-muted-foreground italic">Gözlemlenen sonucu girin...</span>}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <StatusIndicator status={step.status} />
                                                    <Select value={step.status} onValueChange={(value) => handleStatusChange(step.id, value as TestStepStatus)}>
                                                        <SelectTrigger className="print:hidden">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {TEST_STEP_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                                        </SelectContent>
                                                    </Select>
                                                    <span className="hidden print:inline">{step.status}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right align-top print:hidden">
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenCopyModal(step)} title="Adımı Kopyala">
                                                    <Copy className="h-4 w-4 text-blue-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleOpenBugModal(step)} title="Hata Kaydı Oluştur">
                                                    <Bug className="h-4 w-4 text-orange-500" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => openStepModal(step)} title="Adımı Düzenle">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={() => handleDeleteStep(step.id)} className="text-destructive hover:text-destructive/80" title="Adımı Sil">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredSteps.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center h-24">Seçili filtrelere uygun test adımı bulunmamaktadır.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>

                    <Dialog open={isStepModalOpen} onOpenChange={setIsStepModalOpen}>
                        <DialogContent className="sm:max-w-4xl">
                            <DialogHeader>
                                <DialogTitle>{editingStep?.id ? 'Adımı Düzenle' : 'Yeni Adım Ekle'}</DialogTitle>
                                <DialogDescription>
                                    Test adımının detaylarını girin.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label htmlFor="step-desc" className="block text-sm font-medium mb-1">Adım Açıklaması</Label>
                                    <div className="flex items-center space-x-2 border rounded-md p-1 mb-1">
                                        <Button type="button" variant="ghost" size="icon" onMouseDown={(e) => {
                                            e.preventDefault();
                                            const textarea = (e.currentTarget.closest('div.grid')?.querySelector('#step-desc')) as HTMLTextAreaElement;
                                            setEditingStep(prev => prev ? { ...prev, description: applyFormat(prev.description, textarea, 'bold') } : null);
                                        }}><Bold className="h-4 w-4" /></Button>
                                        <Button type="button" variant="ghost" size="icon" onMouseDown={(e) => {
                                            e.preventDefault();
                                            const textarea = (e.currentTarget.closest('div.grid')?.querySelector('#step-desc')) as HTMLTextAreaElement;
                                            setEditingStep(prev => prev ? { ...prev, description: applyFormat(prev.description, textarea, 'bullet') } : null);
                                        }}><List className="h-4 w-4" /></Button>
                                    </div>
                                    <Textarea
                                        id="step-desc"
                                        placeholder="Ör: Kullanıcı giriş butonuna tıklar."
                                        value={editingStep?.description || ''}
                                        onChange={(e) => handleTextareaChange(e, (newValue) => setEditingStep(prev => prev ? { ...prev, description: newValue } : null))}
                                        className="min-h-[150px]"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="step-expected" className="block text-sm font-medium mb-1">Beklenen Sonuç</Label>
                                    <div className="flex items-center space-x-2 border rounded-md p-1 mb-1">
                                        <Button type="button" variant="ghost" size="icon" onMouseDown={(e) => {
                                            e.preventDefault();
                                            const textarea = (e.currentTarget.closest('div.grid')?.querySelector('#step-expected')) as HTMLTextAreaElement;
                                            setEditingStep(prev => prev ? { ...prev, expectedResult: applyFormat(prev.expectedResult, textarea, 'bold') } : null);
                                        }}><Bold className="h-4 w-4" /></Button>
                                        <Button type="button" variant="ghost" size="icon" onMouseDown={(e) => {
                                            e.preventDefault();
                                            const textarea = (e.currentTarget.closest('div.grid')?.querySelector('#step-expected')) as HTMLTextAreaElement;
                                            setEditingStep(prev => prev ? { ...prev, expectedResult: applyFormat(prev.expectedResult, textarea, 'bullet') } : null);
                                        }}><List className="h-4 w-4" /></Button>
                                    </div>
                                    <Textarea
                                        id="step-expected"
                                        placeholder="Ör: Ana sayfaya yönlendirilir."
                                        value={editingStep?.expectedResult || ''}
                                        onChange={(e) => handleTextareaChange(e, (newValue) => setEditingStep(prev => prev ? { ...prev, expectedResult: newValue } : null))}
                                        className="min-h-[150px]"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="outline" onClick={closeStepModal}>İptal</Button>
                                </DialogClose>
                                <Button onClick={handleSaveStep}><Save className="mr-2 h-4 w-4" /> Kaydet</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isBugModalOpen} onOpenChange={setIsBugModalOpen}>
                        <DialogContent
                            aria-labelledby={BUG_ASSIGN_DIALOG_TITLE_ID}
                            aria-describedby={BUG_ASSIGN_DIALOG_DESC_ID}
                        >
                            <DialogHeader>
                                <DialogTitle id={BUG_ASSIGN_DIALOG_TITLE_ID}>Hata Kaydı Oluştur ve Ata</DialogTitle>
                                <DialogDescription id={BUG_ASSIGN_DIALOG_DESC_ID}>
                                    "{bugToCreate?.description}" adımında bulunan hata için bir görev oluşturun ve ilgili kişilere atayın.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <Command>
                                    <CommandInput placeholder="Kullanıcı ara..." />
                                    <CommandList className="max-h-[300px]">
                                        <CommandEmpty>Kullanıcı bulunamadı.</CommandEmpty>
                                        <CommandGroup>
                                            {sortedUsersForList.map((user) => (
                                                <CommandItem
                                                    key={user.uid}
                                                    onSelect={() => {
                                                        if (user.status !== 'inactive') {
                                                            setSelectedBugAssignees((prev) =>
                                                                prev.includes(user.uid)
                                                                    ? prev.filter((uid) => uid !== user.uid)
                                                                    : [...prev, user.uid]
                                                            );
                                                        }
                                                    }}
                                                    className="flex items-center justify-between"
                                                >
                                                    <span>{user.firstName} {user.lastName}</span>
                                                    <Checkbox
                                                        checked={selectedBugAssignees.includes(user.uid)}
                                                        aria-hidden="true"
                                                        tabIndex={-1}
                                                    />
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsBugModalOpen(false)}>İptal</Button>
                                <Button onClick={handleCreateBugTask} disabled={isCreatingBug || selectedBugAssignees.length === 0}>
                                    {isCreatingBug && <Loader2 className="animate-spin mr-2 h-4 w-4" />}
                                    Görevi Oluştur
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={isCopyModalOpen} onOpenChange={setIsCopyModalOpen}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Test Adımını Kopyala {stepToCopy?.stepNumber} ve Ekle</DialogTitle>
                                <DialogDescription>
                                    <strong>Test Adımı:</strong> KOPYALA - *{stepToCopy?.description}*
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <RadioGroup value={copyOption} onValueChange={(value) => setCopyOption(value as CopyOption)}>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="before" id="r-before" />
                                        <Label htmlFor="r-before">Adımdan önce ekle {stepToCopy?.stepNumber}</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="after" id="r-after" />
                                        <Label htmlFor="r-after">Adımdan sonra ekle {stepToCopy?.stepNumber}</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="specific" id="r-specific" />
                                        <Label htmlFor="r-specific">Adıma ekle</Label>
                                        <Input
                                            type="number"
                                            className="w-24 h-8"
                                            value={specificStepNumber}
                                            onChange={(e) => setSpecificStepNumber(e.target.value)}
                                            onClick={() => setCopyOption('specific')}
                                            disabled={copyOption !== 'specific'}
                                        />
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="last" id="r-last" />
                                        <Label htmlFor="r-last">Son adım olarak ekle</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsCopyModalOpen(false)}>Vazgeç</Button>
                                <Button onClick={handleCopyStep} disabled={isCopying}>
                                    {isCopying && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
                                    Kopyala
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </main>
            </TooltipProvider>
        </>
    );
}

const TestCasePage = React.memo(TestCasePageContent);
export default TestCasePage;
