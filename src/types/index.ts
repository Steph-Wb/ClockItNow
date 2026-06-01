export interface Client {
  id: number;
  name: string;
  address?: string;
  street?: string;
  zip_city?: string;
  rapport_postfix?: number;
  rapport_description?: string;
  currency: string;
  is_active: number;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  client_id?: number;
  client_name?: string;
  color: string;
  hourly_rate: number;
  is_billable: number;
  is_active: number;
  created_at: string;
}

export interface Task {
  id: number;
  name: string;
  project_id: number;
  is_active: number;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  description?: string;
  project_id?: number;
  project_name?: string;
  project_color?: string;
  client_name?: string;
  hourly_rate?: number;
  task_id?: number;
  task_name?: string;
  start_time: string;
  end_time?: string;
  is_billable: number;
  created_at: string;
}

export interface DashboardData {
  totalSeconds: number;
  billableAmount: number;
  billableSeconds: number;
  billablePercent: number;
  byDay: { date: string; seconds: number }[];
  byProject: { name: string; color: string; seconds: number; amount: number }[];
  byClient: { name: string; color: string; seconds: number; amount: number }[];
  topActivities: { description: string; project_name: string; seconds: number }[];
  period: { start: string; end: string };
}

export interface ReportEntry extends TimeEntry {
  duration_seconds: number;
  amount: number;
}

export interface ReportData {
  entries: ReportEntry[];
  totalSeconds: number;
  totalAmount: number;
}

export type Period = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';

export interface AppSettings {
  sender_name: string | null;
  sender_address: string | null;
  signature_png: string | null;
}
