

import type { Timestamp } from 'firebase/firestore';

export interface StatusSetting {
  id: string; // Unique identifier for the status (e.g., 'todo', 'in-progress')
  label: string; // Display name (e.g., "YAPILACAK", "DEVAM EDİLİYOR")
  icon: string; // Lucide icon name (e.g., "Zap", "Hourglass")
  color: string; // Tailwind color class (e.g., "text-blue-500", "text-yellow-500")
}

export const TASK_TYPES = ["ANALİZ", "TEST", "HATA"] as const;
export type TaskType = typeof TASK_TYPES[number];

export const STATUS_OPTIONS = ["YAPILACAK", "DEVAM EDİLİYOR", "BEKLEMEYE ALINDI", "TEST EDİLİYOR", "ONAYA SUNULDU", "TAMAMLANDI", "İPTAL EDİLDİ"] as const;
export type Status = typeof STATUS_OPTIONS[number];

export type DefaultTaskFieldKey =
  | 'taskKey'
  | 'taskType'
  | 'taskName'
  | 'cityAdmin'
  | 'progress'
  | 'status'
  | 'analysisTestLink'
  | 'progressNotes'
  | 'csvUpdatedAt';

export type FieldType = 'text' | 'select' | 'slider' | 'textarea' | 'combobox' | 'datetime';

export interface FieldSetting {
  key: string;
  label: string;
  visible: boolean;
  order: number;
  isDefault: boolean;
  isCustom?: boolean;
  fieldType: FieldType;
  options?: string[];
  modalColumn?: 'left' | 'right';
  csvHeader?: string;
  width?: string;
}

export interface TaskHistoryEntry {
  timestamp: Timestamp | Date;
  action: string; // "created", "assigned", "status_changed", "progress_updated" etc.
  details: string; // "Assigned to John Doe from Jane Doe"
  actorId: string; // The UID of the user who performed the action
}

export interface ProgressNoteEntry {
  id: string;
  timestamp: Timestamp | Date;
  content: string;
  actorId: string;
}

export interface Task {
  id: string;
  creatorId: string;
  userIds: string[];
  taskKey: string;
  taskKeyBaseId?: string | null;
  taskType: TaskType;
  taskName: string;
  cityAdmin: string;
  progress: number;
  status: string; // Changed from Status to string to allow custom statuses
  analysisTestLink?: string;
  analysisTestLinkBaseId?: string | null;
  progressNotes?: string | ProgressNoteEntry[];
  lastProgressNoteActorId?: string;
  customFields?: Record<string, any>;
  history?: TaskHistoryEntry[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  csvUpdatedAt?: Timestamp;
  hasInternalTestCase?: boolean;
}

export interface TaskChanges {
    [key: string]: boolean;
}

export interface ProcessedRow {
  _id: number;
  _isSelected: boolean;
  _isNew: boolean;
  _hasChanges: boolean;
  _isValid: boolean;
  _isDeletedByUser: boolean;
  _errors: string[];
  _existingTaskId?: string;
  _changedFields: TaskChanges;
  taskKey: string;
  taskName: string;
  status: string; // Changed from Status to string
  taskType: TaskType;
  cityAdmin: string;
  progress: number | null; // Allow null to differentiate between 0 and not-provided
  customFields: Record<string, any>;
  originalData: any;
  csvUpdatedAt: Date | null;
}

export const GENDER_OPTIONS = ["Erkek", "Kadın"] as const;
export type Gender = typeof GENDER_OPTIONS[number];

export interface UiStrings {
  layout_title: string;
  header_title: string;
  home_addTaskButton: string;
  tasks_page_delete_confirm_title: string;
  tasks_page_delete_confirm_description: string;
  tasks_page_no_tasks_in_status: string;
  tasks_page_no_tasks_overall: string;
  tasks_page_edit_task_aria_label: string;
  tasks_page_delete_task_aria_label: string;
  edit_task_modal_title_edit: string;
  edit_task_modal_title_add: string;
  edit_task_modal_desc_edit: string;
  edit_task_modal_desc_add: string;
  edit_task_modal_desc_task_key: string;
  edit_task_modal_button_add_new_city_admin: string;
  edit_task_modal_combobox_placeholder_city_admin: string;
  edit_task_modal_combobox_empty_city_admin: string;
  edit_task_modal_combobox_aria_label_delete_city_admin: string;
  edit_task_modal_label_progress_with_value: string;
  edit_task_modal_aria_label_progress_slider: string;
  edit_task_modal_label_progress_notes_timestamp_tooltip: string;
  edit_task_modal_placeholder_new_progress_note: string;
  edit_task_modal_desc_analysis_test_link_not_completed: string;
  edit_task_modal_add_city_admin_title: string;
  edit_task_modal_add_city_admin_desc: string;
  edit_task_modal_add_city_admin_label: string;
  edit_task_modal_add_city_admin_placeholder: string;
  edit_task_modal_delete_city_admin_title: string;
  edit_task_modal_delete_city_admin_desc: string;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive';

export interface GlobalSettings {
  defaultTaskKeyBaseLinkId?: string | null;
  defaultAnalysisBaseLinkId?: string | null;
  defaultTestBaseLinkId?: string | null;
  uiStrings?: UiStrings;
  fieldConfiguration?: FieldSetting[];
  statusConfiguration?: StatusSetting[]; // New setting for statuses
  statusMappings?: Record<string, string>; // Value is now string (status label)
  jiraApiUrlBase?: string;
  jiraApiUser?: string;
  jiraApiPassword?: string;
  jiraJqlQuery?: string;
  jiraConnectionVerified?: boolean;
  jiraSyncEnabled?: boolean;
  jiraCsvSyncEnabled?: boolean;
  internalTestCasesEnabled?: boolean;
  defaultDashboardDateRange?: string;
  testCaseColumnWidths?: Record<string, string>;
  updatedAt?: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  firstName: string;
  lastName: string;
  photoURL?: string;
  gender: Gender | string;
  role: UserRole;
  status: UserStatus;
  canViewTeamTasks?: boolean;
  hideFromDashboard?: boolean;
  hideFromTaskAssignment?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedTaskKeys?: string[];
  lastSeen?: Timestamp;
}

export interface BaseLink {
  id: string;
  name: string;
  url: string;
  createdAt: any;
}

export interface CityAdminValue {
  id: string;
  name: string;
  createdAt: any;
}

export type TestStepStatus = 'Başarılı' | 'Başarısız' | 'Koşulmadı';

export interface TestStep {
    id: string;
    stepNumber: number;
    description: string;
    expectedResult: string;
    actualResult?: string;
    status: TestStepStatus;
}

export interface TestCase {
    id: string; // This will be the same as the taskId
    taskName: string;
    taskKey: string;
    steps: TestStep[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
