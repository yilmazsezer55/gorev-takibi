'use client';

import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp, type Unsubscribe, onSnapshot, collection, getDocs, updateDoc } from 'firebase/firestore';
import type { UserProfile, StatusSetting, FieldSetting, UiStrings, GlobalSettings } from '@/types';
import { Loader2 } from 'lucide-react';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';
import { useToast } from '@/hooks/use-toast';
import { idb } from '@/lib/idb';

export const DEFAULT_STATUS_CONFIGURATION: StatusSetting[] = [
    { id: 'todo', label: 'YAPILACAK', icon: 'Zap', color: 'text-gray-500' },
    { id: 'in-progress', label: 'DEVAM EDİLİYOR', icon: 'Hourglass', color: 'text-blue-500' },
    { id: 'on-hold', label: 'BEKLEMEYE ALINDI', icon: 'PauseCircle', color: 'text-orange-500' },
    { id: 'testing', label: 'TEST EDİLİYOR', icon: 'TestTube2', color: 'text-purple-500' },
    { id: 'in-review', label: 'ONAYA SUNULDU', icon: 'Eye', color: 'text-yellow-500' },
    { id: 'done', label: 'TAMAMLANDI', icon: 'CheckCheck', color: 'text-green-500' },
    { id: 'cancelled', label: 'İPTAL EDİLDİ', icon: 'XCircle', color: 'text-red-500' },
];

export const DEFAULT_FIELD_CONFIGURATION: FieldSetting[] = [
  { key: 'taskName', label: 'Görev Adı', visible: true, order: 0, isDefault: true, fieldType: 'text', modalColumn: 'left', csvHeader: 'Summary' },
  { key: 'taskKey', label: 'Görev Linki / Anahtarı', visible: false, order: 1, isDefault: true, fieldType: 'text', modalColumn: 'left', csvHeader: 'Issue key' },
  { key: 'taskType', label: 'Görev Tipi', visible: true, order: 2, isDefault: true, fieldType: 'select', options: ["ANALİZ", "TEST", "HATA"], modalColumn: 'left', csvHeader: 'Issue Type' },
  { key: 'cityAdmin', label: 'Şehir/İdare', visible: true, order: 3, isDefault: true, fieldType: 'combobox', modalColumn: 'left', csvHeader: 'Custom field (City Admin)' },
  { key: 'status', label: 'Durum', visible: true, order: 4, isDefault: true, fieldType: 'select', options: [], modalColumn: 'right', csvHeader: 'Status' },
  { key: 'progress', label: 'İlerleme', visible: false, order: 5, isDefault: true, fieldType: 'slider', modalColumn: 'right' },
  { key: 'analysisTestLink', label: 'Analiz/Test Linki', visible: false, order: 6, isDefault: true, fieldType: 'text', modalColumn: 'right' },
  { key: 'progressNotes', label: 'İlerleme Notları', visible: true, order: 7, isDefault: true, fieldType: 'textarea', modalColumn: 'right' },
];

export const DEFAULT_STATUS_MAPPINGS: Record<string, string> = {
  'to do': 'YAPILACAK',
  'in progress': 'DEVAM EDİLİYOR',
  'beklemede': 'BEKLEMEYE ALINDI',
  'on hold': 'BEKLEMEYE ALINDI',
  'test ediliyor': 'TEST EDİLİYOR',
  'in review': 'ONAYA SUNULDU',
  'done': 'TAMAMLANDI',
  'tamamlandı': 'TAMAMLANDI',
  'iptal': 'İPTAL EDİLDİ',
  'cancelled': 'İPTAL EDİLDİ',
};

export const DEFAULT_UI_STRINGS: UiStrings = {
  layout_title: "Görev Yöneticisi",
  header_title: "Görevlerim",
  home_addTaskButton: "Yeni Görev Ekle",

  tasks_page_delete_confirm_title: "Görevi Silme Onayı",
  tasks_page_delete_confirm_description: "Bu görevi kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.",
  tasks_page_no_tasks_in_status: "Bu durumda gösterilecek göreviniz bulunmamaktadır.",
  tasks_page_no_tasks_overall: "Henüz size atanmış bir görev bulunmuyor.",
  tasks_page_edit_task_aria_label: "Düzenle: {taskName}",
  tasks_page_delete_task_aria_label: "Sil: {taskName}",
  
  edit_task_modal_title_edit: "Görevi Düzenle",
  edit_task_modal_title_add: "Yeni Görev Ekle",
  edit_task_modal_desc_edit: "Görev detaylarını aşağıdan güncelleyebilirsiniz.",
  edit_task_modal_desc_add: "Yeni göreviniz için detayları aşağıya girin.",
  edit_task_modal_desc_task_key: "Linkin tamamını yapıştırabilir veya sadece anahtarı girebilirsiniz.",
  edit_task_modal_button_add_new_city_admin: "Yeni Ekle",
  edit_task_modal_combobox_placeholder_city_admin: "Şehir veya idare seçin...",
  edit_task_modal_combobox_empty_city_admin: "Şehir/İdare bulunamadı.",
  edit_task_modal_combobox_aria_label_delete_city_admin: "{name} seçeneğini sil",
  edit_task_modal_label_progress_with_value: "İlerleme Durumu: %{value}",
  edit_task_modal_aria_label_progress_slider: "görev ilerleme kaydırıcısı",
  edit_task_modal_label_progress_notes_timestamp_tooltip: "Son Güncelleme: {timestamp}",
  edit_task_modal_placeholder_new_progress_note: "Yeni bir not ekleyin...",
  edit_task_modal_desc_analysis_test_link_not_completed: "'Analiz/Test Linki' görevin tipi 'ANALİZ' veya 'TEST' olarak seçilmediği için kullanılamaz.",

  edit_task_modal_add_city_admin_title: "Yeni Şehir/İdare Ekle",
  edit_task_modal_add_city_admin_desc: "Görevler için yeni bir Şehir/İdare seçeneği ekleyin.",
  edit_task_modal_add_city_admin_label: "Yeni Şehir/İdare Adı",
  edit_task_modal_add_city_admin_placeholder: "Örn: İstanbul Büyükşehir Belediyesi",

  edit_task_modal_delete_city_admin_title: "Şehir/İdare Seçeneğini Sil",
  edit_task_modal_delete_city_admin_desc: "'{name}' seçeneğini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz ve bu seçeneği kullanan mevcut görevleri etkilemez.",
};


interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  globalSettings: GlobalSettings | null;
  loading: boolean;
  handleLogout: () => Promise<void>;
  refreshAuthData: () => Promise<void>;
  allUsers: UserProfile[] | null;
  resolvedStatusConfiguration: StatusSetting[];
  resolvedFieldConfiguration: FieldSetting[];
  resolvedStatusMappings: Record<string, string>;
  resolvedUiStrings: UiStrings;
  registerListener: (listener: Unsubscribe) => () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [listeners, setListeners] = useState<Unsubscribe[]>([]);
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const registerListener = useCallback((listener: Unsubscribe) => {
    setListeners(prev => [...prev, listener]);
    return () => {
      listener();
      setListeners(prev => prev.filter(l => l !== listener));
    };
  }, []);

  const cleanupListeners = useCallback(() => {
    setListeners(prevListeners => {
      prevListeners.forEach(unsubscribe => unsubscribe());
      return [];
    });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
        // The onAuthStateChanged listener handles state cleanup now
        await signOut(auth);
    } catch (error) {
        console.error('Logout error:', error);
    }
  }, []);

  const refreshAuthData = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;

    setLoading(true);
    try {
        const userDocRef = doc(db, 'users', user.uid);
        const settingsDocRef = doc(db, 'global_settings', 'main');
        
        const [userDocSnap, settingsDocSnap] = await Promise.all([
            getDoc(userDocRef),
            getDoc(settingsDocRef),
        ]);

        if (userDocSnap.exists()) {
            setUserProfile(userDocSnap.data() as UserProfile);
        } else {
            throw new Error("Kullanıcı profili veritabanında bulunamadı.");
        }
        if (settingsDocSnap.exists()) {
            setGlobalSettings(settingsDocSnap.data() as GlobalSettings);
        }
    } catch (error) {
        console.error("Auth context data refresh error:", error);
        toast({
            variant: "destructive",
            title: "Oturum Hatası",
            description: "Kullanıcı verileri alınamadı. Bu, sistem limitlerinin aşıldığı anlamına gelebilir. Oturum sonlandırılıyor.",
        });
        await handleLogout(); 
    } finally {
        setLoading(false);
    }
  }, [handleLogout, toast]);

  useEffect(() => {
    const authUnsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthInitializing(true);
      cleanupListeners(); 
      if (user) {
        const lastUserId = await idb.getMetadata('lastUserId');
        if (lastUserId && lastUserId !== user.uid) {
            console.log(`User changed from ${lastUserId} to ${user.uid}. Clearing IDB.`);
            await idb.clearAllTaskData();
        }
        await idb.setMetadata('lastUserId', user.uid);

        setCurrentUser(user);
        await refreshAuthData();

        // Real-time listener for all users' presence and data
        const usersUnsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
            const updatedUsers = snapshot.docs.map(doc => doc.data() as UserProfile);
            setAllUsers(updatedUsers);
        }, (error) => {
            console.error("Error listening to user presence:", error);
        });
        registerListener(usersUnsubscribe);
        
        // Update current user's lastSeen timestamp periodically
        const userLastSeenRef = doc(db, 'users', user.uid);
        updateDoc(userLastSeenRef, { lastSeen: serverTimestamp() }).catch(console.error);

        const interval = setInterval(() => {
            if (auth.currentUser) {
                 updateDoc(userLastSeenRef, { lastSeen: serverTimestamp() }).catch(console.error);
            }
        }, 60000);

        const unregisterInterval = () => clearInterval(interval);
        registerListener(unregisterInterval);

      } else {
        // User is null, meaning they logged out.
        await idb.clearAllTaskData();
        setCurrentUser(null);
        setUserProfile(null);
        setGlobalSettings(null);
        setAllUsers(null);
      }
      setAuthInitializing(false);
    });
    
    return () => authUnsubscribe();

  }, [cleanupListeners, refreshAuthData, registerListener]);

  useEffect(() => {
      if (!authInitializing && !currentUser) {
          const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname.startsWith('/auth');
          if (!isAuthPage) {
              router.push('/login');
          }
      }
  }, [authInitializing, currentUser, pathname, router]);

  const resolvedStatusConfiguration = React.useMemo(() => (globalSettings?.statusConfiguration && globalSettings.statusConfiguration.length > 0) ? globalSettings.statusConfiguration : DEFAULT_STATUS_CONFIGURATION, [globalSettings]);
  const resolvedFieldConfiguration = React.useMemo(() => {
      const config = globalSettings?.fieldConfiguration || DEFAULT_FIELD_CONFIGURATION;
      const statusOptions = resolvedStatusConfiguration.map(s => s.label);
      return config.map(field => field.key === 'status' ? { ...field, options: statusOptions } : field)
                   .sort((a, b) => a.order - b.order);
  }, [globalSettings, resolvedStatusConfiguration]);
  const resolvedStatusMappings = React.useMemo(() => ({ ...DEFAULT_STATUS_MAPPINGS, ...(globalSettings?.statusMappings || {}) }), [globalSettings]);
  const resolvedUiStrings = React.useMemo(() => ({ ...DEFAULT_UI_STRINGS, ...(globalSettings?.uiStrings || {}) }), [globalSettings]);

  if (authInitializing) {
      return (
        <div className="flex items-center justify-center h-screen w-screen bg-background">
          {/* This is intentionally minimal to avoid flash of complex content */}
        </div>
      );
  }

  const value: AuthContextType = {
    currentUser,
    userProfile,
    globalSettings,
    loading,
    refreshAuthData,
    handleLogout,
    allUsers,
    resolvedStatusConfiguration,
    resolvedFieldConfiguration,
    resolvedStatusMappings,
    resolvedUiStrings,
    registerListener,
  };

  return (
    <AuthContext.Provider value={value}>
      <FirebaseErrorListener />
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
