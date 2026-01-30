
'use client';

import { create } from 'zustand';
import { collection, query, where, getDocs, orderBy, Timestamp, type Query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { idb } from '@/lib/idb';
import type { Task } from '@/types';

type Scope = 'my_tasks' | 'team_tasks';

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  loadMyTasks: (userId: string, force?: boolean) => Promise<void>;
  loadTeamTasks: (force?: boolean) => Promise<void>;
  removeTasks: (taskIds: string[]) => Promise<void>;
}

const _deltaSync = async (scope: Scope, q: Query, set: (state: Partial<TaskState>) => void) => {
    set({ isSyncing: true, error: null });

    const lastSyncKey = `lastSync_${scope}`;
    const lastSync = await idb.getMetadata(lastSyncKey);
    
    if (!lastSync) {
        console.error(`❌ DELTA SYNC için ${lastSyncKey} bulunamadı. İlk yükleme yapılmalı.`);
        set({ isSyncing: false, error: "Delta sync için senkronizasyon zaman damgası bulunamadı." });
        return; 
    }

    console.log(`🔁 DELTA FIRESTORE OKUMA (${scope})`);
    const deltaQuery = query(q, where("updatedAt", ">", lastSync));

    try {
        const querySnapshot = await getDocs(deltaQuery);
        if (querySnapshot.empty) {
            console.log(`Değişiklik yok (${scope}), delta senkronizasyon atlandı.`);
            set({ isSyncing: false });
            return;
        }

        const newOrUpdatedTasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
        
        console.log("🧠 DELTA MERGE YAPILDI");
        const getFn = scope === 'my_tasks' ? idb.getMyTasks : idb.getTeamTasks;
        const mergeFn = scope === 'my_tasks' ? idb.mergeMyTasks : idb.mergeTeamTasks;

        const existingTasks = await getFn();
        const taskMap = new Map(existingTasks.map(task => [task.id, task]));
        newOrUpdatedTasks.forEach(task => taskMap.set(task.id, task));
        const mergedTasks = Array.from(taskMap.values());
        
        let newLatestSync: Date = new Date(lastSync);
        newOrUpdatedTasks.forEach(task => {
            const taskTimestamp = task.updatedAt?.toDate();
            if (taskTimestamp && taskTimestamp > newLatestSync) {
                newLatestSync = taskTimestamp;
            }
        });

        set({ tasks: mergedTasks, isSyncing: false });
        await mergeFn(newOrUpdatedTasks);
        await idb.setMetadata(lastSyncKey, newLatestSync);

    } catch (e: any) {
        console.error(`Error during delta sync (${scope}):`, e);
        set({ error: "Görevler senkronize edilirken bir hata oluştu.", isSyncing: false });
    }
};

const _initialLoad = async (scope: Scope, q: Query, set: (state: Partial<TaskState>) => void) => {
    console.log(`🔥 FIRESTORE OKUMA ÇALIŞTI (${scope} - İLK YÜKLEME)`);
    set({ isLoading: true });
    try {
        const querySnapshot = await getDocs(q);
        const tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));

        let latestSync: Date = new Date(0);
        tasks.forEach(task => {
            const taskTimestamp = task.updatedAt?.toDate();
            if (taskTimestamp && taskTimestamp > latestSync) {
                latestSync = taskTimestamp;
            }
        });
        
        const saveFn = scope === 'my_tasks' ? idb.saveMyTasks : idb.saveTeamTasks;
        const lastSyncKey = `lastSync_${scope}`;

        set({ tasks, isLoading: false });
        await saveFn(tasks);
        await idb.setMetadata(lastSyncKey, latestSync);

    } catch (error) {
        console.error(`Firestore'dan ilk ${scope} okuma hatası:`, error);
        set({ error: "Görevler yüklenemedi.", isLoading: false });
    }
};

export const useTaskStore = create<TaskState>((set, get) => ({
    tasks: [],
    isLoading: false,
    isSyncing: false,
    error: null,

    loadMyTasks: async (userId: string, force: boolean = false) => {
        const myTasksQuery = query(collection(db, 'tasks'), where('userIds', 'array-contains', userId));
        
        if (force) {
            await _deltaSync('my_tasks', myTasksQuery, set);
            return;
        }

        set({ isLoading: true });
        const cachedTasks = await idb.getMyTasks();
        if (cachedTasks.length > 0) {
            console.log("✅ IDB'DEN OKUNDU (My Tasks)");
            set({ tasks: cachedTasks, isLoading: false });
            // No return here, proceed to check for delta updates in the background
        } else {
             await _initialLoad('my_tasks', myTasksQuery, set);
             return; // Initial load is complete, no delta needed immediately
        }

        // Background delta sync after loading from cache
        await _deltaSync('my_tasks', myTasksQuery, set);
    },

    loadTeamTasks: async (force: boolean = false) => {
        const teamTasksQuery = query(collection(db, 'tasks'));

        if (force) {
            await _deltaSync('team_tasks', teamTasksQuery, set);
            return;
        }

        set({ isLoading: true });
        const cachedTasks = await idb.getTeamTasks();
        if (cachedTasks.length > 0) {
            console.log("✅ IDB'DEN OKUNDU (Team Tasks)");
            set({ tasks: cachedTasks, isLoading: false });
             // No return here, proceed to check for delta updates in the background
        } else {
            await _initialLoad('team_tasks', teamTasksQuery, set);
            return; // Initial load is complete, no delta needed immediately
        }

        // Background delta sync after loading from cache
        await _deltaSync('team_tasks', teamTasksQuery, set);
    },
    
    removeTasks: async (taskIds) => {
        set((state) => ({
            tasks: state.tasks.filter((task) => !taskIds.includes(task.id)),
        }));
        await idb.removeTasks(taskIds);
    },
}));
