import axios from 'axios';
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 60000, // 60秒超时，大文件导入需要更长处理时间
});

// 网络连接错误自动重试（ECONNRESET等故障自动恢复）
const NETWORK_ERROR_CODES = ['ECONNABORTED', 'ECONNRESET', 'ERR_NETWORK', 'ERR_CONNECTION_RESET'];
api.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  // 避免死循环：最多重试 1 次
  if (!config || config._retryCount >= 1) return Promise.reject(error);
  
  const isNetworkError = NETWORK_ERROR_CODES.includes(error.code)
    || (!error.response && error.message?.includes('timeout'));
  
  if (isNetworkError) {
    config._retryCount = (config._retryCount || 0) + 1;
    console.warn(`[API] 连接异常 (${error.code})，重试第 ${config._retryCount} 次:`, config.url);
    await new Promise(r => setTimeout(r, 500)); // 等待 500ms 后重试
    return api(config);
  }
  return Promise.reject(error);
});

// ===== 设备 =====
export const deviceApi = {
  list: () => api.get('/devices'),
  get: (id: string) => api.get(`/devices/${id}`),
  create: (d: any) => api.post('/devices', d),
  update: (id: string, d: any) => api.put(`/devices/${id}`, d),
  delete: (id: string) => api.delete(`/devices/${id}`),
  scrap: (id: string, d: any) => api.put(`/devices/${id}/scrap`, d),
  restore: (id: string) => api.put(`/devices/${id}/restore`),
  changeRecords: (params?: any) => api.get('/devices/change-records', { params }),
  importExcel: (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/devices/import', fd);
  },
  categories: () => api.get('/devices/categories/list'),
};

// ===== 维修工单 =====
export const repairApi = {
  list: (params?: any) => api.get('/repairs', { params }),
  create: (d: any) => api.post('/repairs', d),
  update: (id: string, d: any) => api.put(`/repairs/${id}`, d),
  delete: (id: string) => api.delete(`/repairs/${id}`),
  start: (id: string) => api.post(`/repairs/${id}/start`),
  complete: (id: string, d: any) => api.post(`/repairs/${id}/complete`, d),
  statsOverview: (params?: any) => api.get('/repairs/stats/overview', { params }),
  statsHighFreq: () => api.get('/repairs/stats/high-frequency'),
  statsMonthlyTrend: (params?: any) => api.get('/repairs/stats/monthly-trend', { params }),
  statsByLine: (params?: any) => api.get('/repairs/stats/by-line', { params }),
  statsSummary: (params?: any) => api.get('/repairs/stats/summary', { params }),
  zoneStats: () => api.get('/repairs/zone-stats'),
  nextNo: () => api.get('/repairs/next-no'),
};

// ===== 零部件 =====
export const partApi = {
  list: (keyword?: string) => api.get('/parts', { params: keyword ? { keyword } : {} }),
  create: (d: any) => api.post('/parts', d),
  update: (id: string, d: any) => api.put(`/parts/${id}`, d),
  patchStock: (id: string, stock: number) => api.patch(`/parts/${id}/stock`, { stock }),
  delete: (id: string) => api.delete(`/parts/${id}`),
  importExcel: (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/parts/import', fd);
  },
  lowStock: () => api.get('/parts/low-stock'),
  logs: () => api.get('/parts/logs'),
  createLog: (d: any) => api.post('/parts/logs', d),
  nextNo: () => api.get('/parts/next-no'),
  // 领用
  usage: (d: any) => api.post('/parts/usage', d),
  usageLogs: (params?: any) => api.get('/parts/usage', { params }),
  // 管理员：待审批列表
  usagePending: () => api.get('/parts/usage/pending'),
  // 管理员：审批通过
  usageApprove: (id: string) => api.post(`/parts/usage/${id}/approve`),
  // 管理员：驳回申请
  usageReject: (id: string, reason: string) => api.post(`/parts/usage/${id}/reject`, { reason }),
  // 管理员：修改领用申请（仅 pending 状态）
  usageUpdate: (id: string, data: { part_id?: number; quantity?: number }) => api.put(`/parts/usage/${id}`, data),
  // 超管：完整编辑领用记录（不限状态）
  usageSuperUpdate: (id: string, data: any) => api.put(`/parts/usage/${id}/super`, data),
  // 超管：删除领用记录
  usageDelete: (id: string) => api.delete(`/parts/usage/${id}`),
  // 入库
  stockin: (d: any) => api.post('/parts/stockin', d),
  stockinLogs: (params?: any) => api.get('/parts/stockin', { params }),
  // 超管：编辑入库记录
  stockinUpdate: (id: string, data: any) => api.put(`/parts/stockin/${id}`, data),
  // 超管：删除入库记录
  stockinDelete: (id: string) => api.delete(`/parts/stockin/${id}`),
};

// ===== 保养计划 =====
export const maintenanceApi = {
  list: () => api.get('/maintenance'),
  create: (d: any) => api.post('/maintenance', d),
  update: (id: string, d: any) => api.put(`/maintenance/${id}`, d),
  delete: (id: string) => api.delete(`/maintenance/${id}`),
  nextNo: () => api.get('/maintenance/next-no'),
};

// ===== 工具台账 =====
export const toolApi = {
  list: () => api.get('/tools'),
  get: (id: string) => api.get(`/tools/${id}`),
  create: (d: any) => api.post('/tools', d),
  update: (id: string, d: any) => api.put(`/tools/${id}`, d),
  delete: (id: string) => api.delete(`/tools/${id}`),
  scrap: (id: string, d: any) => api.put(`/tools/${id}/scrap`, d),
  changeRecords: (params?: any) => api.get('/tools/change-records', { params }),
  importExcel: (file: File) => {
    const fd = new FormData(); fd.append('file', file);
    return api.post('/tools/import', fd);
  },
};

// ===== 统计 =====
export const statsApi = {
  overview: () => api.get('/stats/overview'),
  faultFrequency: () => api.get('/stats/fault-frequency'),
  faultTypes: () => api.get('/stats/fault-types'),
  lowStock: () => api.get('/stats/low-stock'),
  stopDurationByMonth: (params?: any) => api.get('/stats/stop-duration-by-month', { params }),
  faultRateByMonth: (params?: any) => api.get('/stats/fault-rate-by-month', { params }),
  weeklyStats: (year: number, month: number) => api.get('/stats/weekly', { params: { year, month } }),
  saveWeeklyStats: (data: { year: number; month: number; week: number; running_hours: number | null; repeat_fault_count: number | null }) =>
    api.post('/stats/weekly', data),
};

// ===== 数据版本检查（智能刷新）=====
export const dataVersionApi = {
  check: () => api.get('/data-version'),
};

// ===== 现场改善 =====
export const improvementApi = {
  list: (params?: any) => api.get('/improvements', { params }),
  getDetail: (id: string | number) => api.get(`/improvements/detail/${id}`),
  create: (d: any) => api.post('/improvements', d),
  update: (id: string | number, d: any) => api.put(`/improvements/${id}`, d),
  assign: (id: string | number, d: any) => api.post(`/improvements/${id}/assign`, d),
  feedback: (id: string | number, d: any) => api.post(`/improvements/${id}/feedback`, d),
  confirm: (id: string | number, d: any) => api.post(`/improvements/${id}/confirm`, d),
  delete: (id: string | number) => api.delete(`/improvements/${id}`),
  completeDirect: (id: string | number) => api.post(`/improvements/${id}/complete-direct`),
  suspend: (id: string | number) => api.post(`/improvements/${id}/suspend`),
  resume: (id: string | number) => api.post(`/improvements/${id}/resume`),
};

// ===== 通知设置 =====
export const notificationApi = {
  getConfig: () => api.get('/notifications/config'),
  updateConfig: (d: any) => api.put('/notifications/config', d),
  testSend: () => api.post('/notifications/test'),
  sendPending: () => api.post('/notifications/send-pending'),
  logs: (limit?: number) => api.get('/notifications/logs', { params: { limit } }),
};

// ===== 设备排班 =====
export const scheduleApi = {
  list: (year: number, month: number) => api.get('/schedule', { params: { year, month } }),
  toggle: (date: string, lineCode: string) => api.post('/schedule/toggle', { date, lineCode }),
  updateStaff: (date: string, lineCode: string, staff: string[]) => api.put('/schedule/staff', { date, lineCode, staff }),
  staffList: () => api.get('/schedule/staff-list'),
};

// ===== 值班巡查 =====
export const inspectionApi = {
  list: () => api.get('/inspections'),
  getByToken: (token: string) => api.get(`/inspections/by-token/${token}`),
  create: (d: any) => api.post('/inspections', d),
  update: (id: number, d: any) => api.put(`/inspections/${id}`, d),
  delete: (id: number) => api.delete(`/inspections/${id}`),
  checkIn: (d: any) => api.post('/inspections/check-in', d),
  weekView: (date: string) => api.get('/inspections/week-view', { params: { date } }),
  qrUrl: (token: string) => api.get(`/inspections/qr-url/${token}`),
  todayStats: () => api.get('/inspections/today-stats'),
};
