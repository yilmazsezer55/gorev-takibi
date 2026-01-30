'use client';

import { openDB, type DBSchema } from 'idb';
import type { Task } from '@/types';

const DB_NAME = 'TaskAppDB';
const DB_VERSION = 3; // Version incremented for schema change
const STORE_MY_TASKS = 'my_tasks';
const STORE_TEAM_TASKS = 'team_tasks';
const STORE_METADATA = 'metadata';

interface TaskAppDBSchema extends DBSchema {
  [STORE_MY_TASKS]: {
    key: string;
    value: Task;
  };
  [STORE_TEAM_TASKS]: {
    key: string;
    value: Task;
  };
  [STORE_METADATA]: {
    key: string; // e.g., 'lastSync_my_tasks', 'lastSync_team_tasks', 'lastUserId'
    value: any;
  };
}

const dbPromise = typeof window !== 'undefined'
    ? openDB<TaskAppDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            if (oldVersion < 3) {
                if (db.objectStoreNames.contains('tasks')) {
                    db.deleteObjectStore('tasks');
                }
                if (!db.objectStoreNames.contains(STORE_MY_TASKS)) {
                    db.createObjectStore(STORE_MY_TASKS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_TEAM_TASKS)) {
                    db.createObjectStore(STORE_TEAM_TASKS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORE_METADATA)) {
                    db.createObjectStore(STORE_METADATA);
                }
            }
        },
    })
    : null;

if (dbPromise) {
    console.log("🧪 IDB OPEN ÇAĞRILDI");
    dbPromise.then(() => {
        console.log("🧪 IDB OPEN SUCCESS");
    }).catch(event => {
        console.error("🧪 IDB OPEN ERROR", event);
    });
}


export const idb = {
  getMyTasks: async (): Promise<Task[]> => {
    if (!dbPromise) return [];
    return (await dbPromise).getAll(STORE_MY_TASKS);
  },
  saveMyTasks: async (tasks: Task[]) => {
    if (!dbPromise) return;
    const db = await dbPromise;
    const tx = db.transaction(STORE_MY_TASKS, 'readwrite');
    await tx.store.clear();
    await Promise.all(tasks.map(task => tx.store.put(task)));
    await tx.done;
  },
  mergeMyTasks: async (tasks: Task[]) => {
    if (!dbPromise) return;
    const db = await dbPromise;
    const tx = db.transaction(STORE_MY_TASKS, 'readwrite');
    await Promise.all(tasks.map(task => tx.store.put(task)));
    await tx.done;
  },
  getTeamTasks: async (): Promise<Task[]> => {
    if (!dbPromise) return [];
    return (await dbPromise).getAll(STORE_TEAM_TASKS);
  },
  saveTeamTasks: async (tasks: Task[]) => {
    if (!dbPromise) return;
    const db = await dbPromise;
    const tx = db.transaction(STORE_TEAM_TASKS, 'readwrite');
    await tx.store.clear();
    await Promise.all(tasks.map(task => tx.store.put(task)));
    await tx.done;
  },
  mergeTeamTasks: async (tasks: Task[]) => {
    if (!dbPromise) return;
    const db = await dbPromise;
    const tx = db.transaction(STORE_TEAM_TASKS, 'readwrite');
    await Promise.all(tasks.map(task => tx.store.put(task)));
    await tx.done;
  },
  removeTasks: async (taskIds: string[]) => {
    if (!dbPromise) return;
    const db = await dbPromise;
    const tx = db.transaction([STORE_MY_TASKS, STORE_TEAM_TASKS], 'readwrite');
    await Promise.all([
        ...taskIds.map(id => tx.objectStore(STORE_MY_TASKS).delete(id)),
        ...taskIds.map(id => tx.objectStore(STORE_TEAM_TASKS).delete(id)),
    ]);
    await tx.done;
    console.log(`🗑️ ${taskIds.length} görev IDB'den silindi.`);
  },
  clearAllTaskData: async () => {
    if (!dbPromise) return;
    const db = await dbPromise;
    const tx = db.transaction([STORE_MY_TASKS, STORE_TEAM_TASKS, STORE_METADATA], 'readwrite');
    await Promise.all([
        tx.objectStore(STORE_MY_TASKS).clear(),
        tx.objectStore(STORE_TEAM_TASKS).clear(),
        tx.objectStore(STORE_METADATA).delete('lastSync_my_tasks'),
        tx.objectStore(STORE_METADATA).delete('lastSync_team_tasks'),
        tx.objectStore(STORE_METADATA).delete('lastUserId'),
    ]);
    await tx.done;
    console.log("🧹 IDB task data and sync metadata cleared.");
  },
  getMetadata: async (key: string): Promise<any> => {
    if (!dbPromise) return undefined;
    return (await dbPromise).get(STORE_METADATA, key);
  },
  setMetadata: async (key: string, value: any) => {
    if (!dbPromise) return;
    return (await dbPromise).put(STORE_METADATA, value, key);
  },
};
