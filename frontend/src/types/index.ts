export interface Device {
  id?: number;
  device_no: string;
  name: string;
  category: string;
  model?: string;
  location: string;
  production_line?: string;
  supplier?: string;
  install_date?: string;
  maintenance_cycle_days?: number;
  responsible_person?: string;
  status?: string;
  remarks?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RepairPart {
  id?: number;
  repair_id?: number;
  part_id: number;
  part_name: string;
  part_no?: string;
  quantity: number;
  created_at?: string;
}

export interface Repair {
  id?: number;
  work_order_no?: string;
  report_date: string;
  report_time?: string;
  device_id: number;
  line?: string;
  reporter?: string;
  area?: string;
  fault_desc: string;
  fault_type?: string;
  fault_cause?: string;
  solution?: string;
  parts_used?: string;
  repairman: string;
  accept_time?: string;
  finish_time?: string;
  duration_minutes?: number;
  stop_duration_minutes?: number;
  status?: string;
  remarks?: string;
  work_order_type?: string;
  device_no?: string;
  device_name?: string;
  device_location?: string;
  parts?: RepairPart[];
}

export interface Part {
  id?: number;
  part_no?: string;
  category?: string;
  name: string;
  spec: string;
  brand?: string;
  applicable_devices?: string;
  storage_location: string;
  stock: number;
  safety_stock: number;
  unit?: string;
  unit_price?: number;
  supplier?: string;
  purchase_cycle_days?: number;
  remarks?: string;
}

export interface MaintenancePlan {
  id?: number;
  plan_no?: string;
  maintenance_type: string; // 保养位置
  task_desc: string;
  plan_date: string;
  responsible_person: string;
  wechat_id?: string;
  required_parts?: string;
  estimated_duration?: number;
  actual_date?: string;
  status?: string;
  executor?: string;
  remarks?: string;
  parts?: Array<{ part_id: number; part_name: string; quantity: number }>;
}

export interface StatOverview {
  deviceCount: number;
  repairCount: number;
  partCount: number;
  lowStockCount: number;
}

export interface DeviceChangeRecord {
  id?: number;
  device_id: number;
  device_no: string;
  device_name: string;
  change_type: '采购' | '报废';
  change_date: string;
  operator: string;
  reason?: string;
  remarks?: string;
  created_at?: string;
}

export interface Tool {
  id?: number;
  name: string;
  line?: string;
  model?: string;
  device_no?: string;
  station?: string;
  quantity?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ToolChangeRecord {
  id?: number;
  tool_id: number;
  tool_name: string;
  change_type: '采购' | '报废';
  change_date: string;
  operator: string;
  reason?: string;
  remarks?: string;
  created_at?: string;
}
