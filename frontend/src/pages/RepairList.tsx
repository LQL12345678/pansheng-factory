import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useLocation, useSearchParams } from 'react-router-dom';
import { repairApi } from '../services/api';
import { partApi } from '../services/api';
import { Repair } from '../types';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useAuth } from '../hooks/useAuth';
import ModalPortal from '../components/ModalPortal';

const PAGE_SIZE = 20;

// 生产线设备列表（设备维修+1-4线时显示）
const MAIN_LINE_DEVICES = ['机箱提升机', '装配段1', '装配段2', '老化房', '后测段', '下线提升机', '包装线'];

// 获取当前登录用户名（直接从 localStorage 读取，确保及时获取）
const getCurrentUsername = () => {
  try {
    const stored = localStorage.getItem('equip_user');
    if (stored) {
      const user = JSON.parse(stored);
      return user.username || '';
    }
  } catch (e) {}
  return '';
};

export default function RepairList() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [allList, setAllList] = useState<Repair[]>([]);
  const [list, setList] = useState<Repair[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Repair | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<Repair>>({});
  const [nextNo, setNextNo] = useState('');

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const currentPageRef = useRef(currentPage);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // 页面访问权限检查
  useEffect(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
  }, [user]);

  // 搜索和筛选
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('全部');
  const [typeFilter, setTypeFilter] = useState<string>('全部');
  const [areaFilter, setAreaFilter] = useState<string>('全部');
  const [lineFilter, setLineFilter] = useState<string>('全部');

  // 完成工单弹窗
  const [completeModal, setCompleteModal] = useState<{
    visible: boolean;
    repairId: string;
    workOrderNo: string;
    solution: string;
    fault_cause: string;
    parts: { part_id: string; part_name: string; quantity: number }[];
    repairman: string;
    duration_minutes: string;
    stop_duration_minutes: string;
  }>({ visible: false, repairId: '', workOrderNo: '', solution: '', fault_cause: '', parts: [], repairman: '', duration_minutes: '', stop_duration_minutes: '' });

  // 物品搜索（防抖自动搜索）
  const [partSearch, setPartSearch] = useState('');
  const [partOptions, setPartOptions] = useState<any[]>([]);
  const [selectedPart, setSelectedPart] = useState<any>(null);

  const handlePartSearch = useCallback(async (keyword?: string) => {
    const kw = keyword || partSearch;
    if (!kw?.trim()) { setPartOptions([]); return; }
    try {
      const res = await partApi.list(kw.trim());
      setPartOptions(res.data || res || []);
    } catch (e) { }
  }, [partSearch]);

  useEffect(() => {
    const timer = setTimeout(() => { handlePartSearch(); }, 300);
    return () => clearTimeout(timer);
  }, [partSearch, handlePartSearch]);

  // 统计看板
  const [stats, setStats] = useState<any>({});

  // 锁定背景滚动（弹窗打开时）
  useBodyScrollLock(showForm || completeModal.visible);

  // 计算分页数据
  const paginateData = useCallback((data: Repair[], page: number) => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    setList(data.slice(start, end));
    setTotalCount(data.length);
  }, []);

  const load = (keepPage?: number) => {
    const params: any = {};
    if (statusFilter !== '全部') params.status = statusFilter;
    if (typeFilter !== '全部') params.work_order_type = typeFilter;
    if (areaFilter !== '全部') params.area = areaFilter;
    if (lineFilter !== '全部') params.line = lineFilter;
    if (search) params.search = search;
    repairApi.list(params).then((r: any) => {
      const data = r.data || r;
      setAllList(data);

      // 计算正确的页码：保持当前页，但如果超出范围则回退
      const totalAfterFilter = data.length;
      const maxPage = Math.ceil(totalAfterFilter / PAGE_SIZE) || 1;
      let targetPage = 1;
      if (keepPage !== undefined && totalAfterFilter > 0) {
        targetPage = Math.min(keepPage, maxPage);
      }
      setCurrentPage(targetPage);
      paginateData(data, targetPage);
    });
  };

  const loadStats = () => {
    repairApi.statsOverview().then((r: any) => setStats(r.data || r)).catch(console.error);
  };

  // 筛选条件变化时立即加载（重置到第一页）
  useEffect(() => {
    setCurrentPage(1);
    load();
  }, [statusFilter, typeFilter, areaFilter, lineFilter, search]);

  // 从 URL 参数读取区域和线体筛选
  useEffect(() => {
    const areaParam = searchParams.get('area');
    const lineParam = searchParams.get('line');
    if (areaParam || lineParam) {
      if (areaParam) setAreaFilter(areaParam);
      if (lineParam) setLineFilter(lineParam);
      setSearchParams({});
    }
  }, [searchParams]);
  useEffect(() => { loadStats(); }, []);

  // 定时刷新数据（保持当前页码）
  useEffect(() => {
    const interval = setInterval(() => {
      load(currentPageRef.current);
      loadStats();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (location?.pathname === '/repairs/add') {
      setShowForm(true);
      setEditItem(null);
      setFormData({
        report_date: new Date().toISOString().slice(0, 10),
        status: '待处理',
        work_order_type: '设备维修',
        reporter: getCurrentUsername()
      });
      repairApi.nextNo().then(r => setNextNo(r.data?.next_no || '')).catch(() => {});
    }
  }, [location?.pathname]);

  useEffect(() => {
    if (editItem) {
      setFormData({ ...editItem });
    } else if (showForm) {
      setFormData({
        report_date: new Date().toISOString().slice(0, 10),
        status: '待处理',
        work_order_type: '设备维修',
        reporter: getCurrentUsername()
      });
    }
  }, [editItem, showForm]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: any = { ...formData };
      data.device_id = data.device_id ? Number(data.device_id) : null;
      data.duration_minutes = data.duration_minutes ? Number(data.duration_minutes) : null;
      data.stop_duration_minutes = data.stop_duration_minutes ? Number(data.stop_duration_minutes) : null;

      if (editItem?.id) {
        await repairApi.update(String(editItem.id), data);
      } else {
        await repairApi.create(data);
      }
      setShowForm(false);
      setEditItem(null);
      setFormData({});
      load(currentPage); // 保持在当前页
      loadStats();
      window.dispatchEvent(new Event('zone-stats-updated'));
      alert(editItem ? '更新成功！' : '创建成功！');
    } catch (err: any) {
      alert('保存失败：' + (err.response?.data?.error || err.message));
    }
  };

  const handleStart = async (id: string) => {
    try {
      await repairApi.start(id);
      load(currentPage); // 保持在当前页
      loadStats();
      window.dispatchEvent(new Event('zone-stats-updated'));
    } catch (err: any) {
      alert('操作失败：' + (err.response?.data?.error || err.message));
    }
  };

  const openCompleteModal = (repair: Repair) => {
    setCompleteModal({
      visible: true,
      repairId: String(repair.id),
      workOrderNo: repair.work_order_no || '',
      solution: repair.solution || '',
      fault_cause: repair.fault_cause || '',
      parts: [],
      repairman: getCurrentUsername(),
      duration_minutes: repair.duration_minutes ? String(repair.duration_minutes) : '',
      stop_duration_minutes: repair.stop_duration_minutes ? String(repair.stop_duration_minutes) : ''
    });
  };

  // 检测 complete 参数，自动打开完结工单弹窗
  useEffect(() => {
    const completeId = searchParams.get('complete');
    if (completeId && allList.length > 0) {
      const repair = allList.find((r: any) => String(r.id) === completeId);
      if (repair) {
        openCompleteModal(repair);
        // 清除 URL 参数
        setSearchParams({});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allList]);

  const addPart = () => {
    if (!selectedPart) return;
    setCompleteModal(prev => ({
      ...prev,
      parts: [...prev.parts, { part_id: String(selectedPart.id), part_name: selectedPart.name, quantity: 1 }]
    }));
    setSelectedPart(null);
    setPartSearch('');
    setPartOptions([]);
  };

  const removePart = (index: number) => {
    setCompleteModal(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== index)
    }));
  };

  const handleComplete = async () => {
    try {
      const data: any = {
        solution: completeModal.solution,
        fault_cause: completeModal.fault_cause,
        repairman: completeModal.repairman,
        duration_minutes: completeModal.duration_minutes ? Number(completeModal.duration_minutes) : null,
        stop_duration_minutes: completeModal.stop_duration_minutes ? Number(completeModal.stop_duration_minutes) : null,
        parts: completeModal.parts.map(p => ({ part_id: Number(p.part_id), quantity: p.quantity }))
      };
      await repairApi.complete(completeModal.repairId, data);
      setCompleteModal({ visible: false, repairId: '', workOrderNo: '', solution: '', fault_cause: '', parts: [], repairman: '', duration_minutes: '', stop_duration_minutes: '' });
      load(currentPage); // 保持在当前页
      loadStats();
      window.dispatchEvent(new Event('zone-stats-updated'));
      alert('工单已完成！');
    } catch (err: any) {
      alert('完成工单失败：' + (err.response?.data?.error || err.message));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      let imported = 0, skipped = 0;
      for (let i = 4; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !row[1] || !row[5]) { if (row && row[1]) skipped++; continue; }
        try {
          await repairApi.create({
            report_date: row[0] || new Date().toISOString().slice(0, 10),
            device_id: Number(row[1]) || 0,
            line: String(row[2] || ''),
            reporter: String(row[3] || ''),
            area: String(row[4] || ''),
            fault_desc: String(row[5] || ''),
            fault_type: String(row[6] || ''),
            fault_cause: String(row[7] || ''),
            solution: String(row[8] || ''),
            repairman: String(row[9] || ''),
            duration_minutes: row[10] ? Number(row[10]) : null,
            stop_duration_minutes: row[11] ? Number(row[11]) : null,
            status: String(row[12] || '待处理'),
            remarks: String(row[13] || '')
          });
          imported++;
        } catch (e) { skipped++; }
      }
      alert('导入完成！成功: ' + imported + '，跳过: ' + skipped);
      load();
      loadStats();
    } catch (err: any) {
      alert('导入失败：' + (err.message || '文件格式错误'));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = () => {
    const exportData = list.map((item: any) => {
      const row: any = {};
      row['工单号'] = item.work_order_no;
      row['设备ID'] = item.device_id;
      row['设备名称'] = item.device_name;
      row['线体'] = item.line;
      row['提报人'] = item.reporter;
      row['异常区域'] = item.area;
      row['故障描述'] = item.fault_desc;
      row['故障类型'] = item.fault_type;
      row['故障原因'] = item.fault_cause;
      row['处理方式'] = item.solution;
      row['维修人'] = item.repairman;
      row['报修日期'] = item.report_date;
      row['完成日期'] = item.finish_time;
      row['用时(分钟)'] = item.duration_minutes;
      row['停线时长(分钟)'] = item.stop_duration_minutes;
      row['状态'] = item.status;
      row['备注'] = item.remarks;
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '维修工单');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '维修工单导出.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 查看详情弹窗
  const [detailModal, setDetailModal] = useState<Repair | null>(null);
  // 图片灯箱
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  return (
    <div>
      {/* 统计看板 */}
      <div className="repair-stats-grid">
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#888' }}>今日新增</div>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>{stats.todayNew || 0}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#888' }}>进行中</div>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: '#faad14' }}>{stats.inProgress || 0}</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#888' }}>本周完成率</div>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: '#52c41a' }}>{stats.weekRate || 0}%</div>
        </div>
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#888' }}>平均修复时间(分钟)</div>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: '#1890ff' }}>{stats.avgMTTR || 0}</div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {/* 搜索框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <input
            className="toolbar-search"
            placeholder="搜索工单号/线体/设备/故障描述"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
          <button className="primary" style={{ minWidth: 70 }} onClick={() => load()}>搜索</button>
        </div>
        {/* 筛选和工具按钮 - 同一行 */}
        <div className="toolbar-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <option value="全部">全部状态</option>
            <option value="待处理">待处理</option>
            <option value="处理中">处理中</option>
            <option value="已完成">已完成</option>
            <option value="挂起">挂起</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <option value="全部">全部类型</option>
            <option value="设备维修">设备维修</option>
            <option value="工具维修">工具维修</option>
          </select>
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <option value="全部">全部区域</option>
            <option value="装配段1">装配段1</option>
            <option value="装配段2">装配段2</option>
            <option value="老化房">老化房</option>
            <option value="后测段">后测段</option>
          </select>
          <button onClick={() => fileRef.current?.click()}>导入</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
          <button onClick={handleExport}>导出</button>
        </div>
      </div>

      {/* 表格 */}
      <div className="card card-sm">
        <table className="table-compact">
          <thead>
            <tr>
              <th className="th-wo">工单号</th>
              <th className="th-date">日期</th>
              <th className="th-line">线体</th>
              <th className="th-device">设备</th>
              <th className="th-fault">故障描述</th>
              <th className="th-status">状态</th>
              <th className="th-action">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map(d => (
              <tr key={d.id} className="tr-detail">
                <td className="td-wo" data-label="工单号">{d.work_order_no ? d.work_order_no.replace('WO-', '') : ''}</td>
                <td className="td-date" data-label="日期">{d.report_date ? d.report_date.slice(5) : '-'}</td>
                <td className="td-line" data-label="线体">{d.line ? (() => { const v = String(d.line).replace(/\.0$/, ''); return v.endsWith('线') ? v : v + '线'; })() : '-'}</td>
                <td className="td-device" data-label="设备">{d.area || d.device_name || '-'}</td>
                <td className="td-fault" data-label="故障描述">{d.fault_desc || '-'}</td>
                <td className="td-status" data-label="状态">
                  <span className={'status-badge ' + (d.status === '已完成' ? 'status-ok' : d.status === '处理中' ? 'status-warning' : '')}>{d.status}</span>
                </td>
                <td className="td-action">
                  <button className="btn-sm" onClick={() => setDetailModal(d)} style={{ marginRight: 2 }}>详情</button>
                  {isAdmin && d.status === '待处理' && (
                    <button className="btn-sm btn-outline-primary" onClick={() => handleStart(String(d.id))}>标记处理中</button>
                  )}
                  {isAdmin && d.status === '处理中' && (
                    <button className="btn-sm btn-outline-primary" onClick={() => openCompleteModal(d)}>完成</button>
                  )}
                  {isAdmin && (
                    <>
                      <button className="btn-sm" onClick={() => { setEditItem(d); setShowForm(true); }}>编辑</button>
                      {isSuperAdmin && <button className="danger btn-sm" onClick={() => setDeleteConfirm(String(d.id))}>删除</button>}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== 分页控件（仅上下页按钮）===== */}
      {totalCount > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">共 {totalCount} 条</span>
          <button
            className="pagination-btn"
            disabled={currentPage === 1}
            onClick={() => {
              const newPage = currentPage - 1;
              setCurrentPage(newPage);
              paginateData(allList, newPage);
            }}
          >上一页</button>
          <span className="pagination-current">{currentPage} / {Math.ceil(totalCount / PAGE_SIZE)}</span>
          <button
            className="pagination-btn"
            disabled={currentPage === Math.ceil(totalCount / PAGE_SIZE)}
            onClick={() => {
              const newPage = currentPage + 1;
              setCurrentPage(newPage);
              paginateData(allList, newPage);
            }}
          >下一页</button>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <ModalPortal visible={showForm}>
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editItem ? '编辑工单' : '新增报修'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                {!editItem && (
                  <>
                    {nextNo && <div><label>工单号</label><input value={nextNo} readOnly style={{ backgroundColor: 'var(--bg-secondary, #f5f5f5)', color: 'var(--text-secondary)' }} /></div>}
                    <div><label>工单类型</label>
                      <select name="work_order_type" value={formData.work_order_type || '设备维修'} onChange={handleInputChange}>
                        <option>设备维修</option><option>工具维修</option>
                      </select>
                    </div>
                    <div><label>线体</label><input name="line" value={formData.line || ''} onChange={handleInputChange} placeholder="如：1线" /></div>
                    <div><label>设备/区域</label>
                      {formData.work_order_type === '设备维修' && ['1线', '2线', '3线', '4线'].includes(formData.line || '') ? (
                        <select name="area" value={formData.area || ''} onChange={handleInputChange}>
                          <option value="">请选择设备</option>
                          {MAIN_LINE_DEVICES.map((device, idx) => (
                            <option key={idx} value={device}>{device}</option>
                          ))}
                        </select>
                      ) : (
                        <input name="area" value={formData.area || ''} onChange={handleInputChange} placeholder={formData.work_order_type === '工具维修' ? '输入工具名称' : '输入设备或区域'} />
                      )}
                    </div>
                    <div style={{ gridColumn: '1/-1' }}><label>故障描述</label><input name="fault_desc" value={formData.fault_desc || ''} onChange={handleInputChange} placeholder="描述故障现象" /></div>
                    <div><label>报修人</label><input name="reporter" value={formData.reporter || ''} onChange={handleInputChange} /></div>
                  </>
                )}
                {editItem && (
                  <>
                    <div><label>工单号</label><input name="work_order_no" value={formData.work_order_no || ''} onChange={handleInputChange} /></div>
                    <div><label>报修日期</label><input name="report_date" type="date" value={formData.report_date || ''} onChange={handleInputChange} /></div>
                    <div><label>报修人</label><input name="reporter" value={formData.reporter || ''} onChange={handleInputChange} /></div>
                    <div><label>线体</label><input name="line" value={formData.line || ''} onChange={handleInputChange} /></div>
                    <div><label>异常区域</label><input name="area" value={formData.area || ''} onChange={handleInputChange} /></div>
                    <div><label>维修人</label><input name="repairman" value={formData.repairman || ''} onChange={handleInputChange} /></div>
                    <div style={{ gridColumn: '1/-1' }}><label>故障描述</label><input name="fault_desc" value={formData.fault_desc || ''} onChange={handleInputChange} /></div>
                    <div><label>故障原因</label><input name="fault_cause" value={formData.fault_cause || ''} onChange={handleInputChange} /></div>
                    <div><label>处理方式</label><input name="solution" value={formData.solution || ''} onChange={handleInputChange} /></div>
                    <div><label>用时(分钟)</label><input name="duration_minutes" type="number" value={formData.duration_minutes ?? ''} onChange={handleInputChange} /></div>
                    <div><label>停线时长(分钟)</label><input name="stop_duration_minutes" type="number" value={formData.stop_duration_minutes ?? ''} onChange={handleInputChange} /></div>
                    <div><label>完成日期</label><input name="finish_time" type="date" value={formData.finish_time || ''} onChange={handleInputChange} /></div>
                    <div><label>状态</label>
                      <select name="status" value={formData.status || '待处理'} onChange={handleInputChange}>
                        <option>待处理</option><option>处理中</option><option>已完成</option><option>挂起</option>
                      </select>
                    </div>
                    <div><label>工单类型</label>
                      <select name="work_order_type" value={formData.work_order_type || '设备维修'} onChange={handleInputChange}>
                        <option>设备维修</option>
                        <option>工具维修</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: '1/-1' }}><label>备注</label><input name="remarks" value={formData.remarks || ''} onChange={handleInputChange} /></div>
                  </>
                )}
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }}>取消</button>
                <button type="submit" className="primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      {/* 完成工单弹窗 */}
      <ModalPortal visible={completeModal.visible}>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600 }}>
            <h3>完成工单 - {completeModal.workOrderNo}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label>故障原因</label>
                <textarea
                  value={completeModal.fault_cause}
                  onChange={e => setCompleteModal(prev => ({ ...prev, fault_cause: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: 14 }}
                  placeholder="填写故障原因"
                />
              </div>
              <div>
                <label>处理结果</label>
                <textarea
                  value={completeModal.solution}
                  onChange={e => setCompleteModal(prev => ({ ...prev, solution: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: 14 }}
                  placeholder="填写处理方案和结果"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label>维修人</label>
                  <input value={completeModal.repairman} onChange={e => setCompleteModal(prev => ({ ...prev, repairman: e.target.value }))} />
                </div>
                <div>
                  <label>用时(分钟)</label>
                  <input type="number" value={completeModal.duration_minutes} onChange={e => setCompleteModal(prev => ({ ...prev, duration_minutes: e.target.value }))} />
                </div>
                <div>
                  <label>停线时长(分钟)</label>
                  <input type="number" value={completeModal.stop_duration_minutes} onChange={e => setCompleteModal(prev => ({ ...prev, stop_duration_minutes: e.target.value }))} />
                </div>
              </div>

              <div>
                <label>更换物品</label>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    value={partSearch}
                    onChange={e => setPartSearch(e.target.value)}
                    placeholder="输入物品名称/编号搜索（自动搜索）"
                    style={{ width: '100%', padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
                  />
                  {partOptions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, backgroundColor: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      {partOptions.map((p: any) => (
                        <div
                          key={p.id}
                          onClick={() => { setSelectedPart(p); setPartSearch(''); setPartOptions([]); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', backgroundColor: 'transparent', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-cyan)22')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div style={{ fontWeight: 500 }}>{p.name} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({p.part_no})</span></div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>规格: {p.spec} | 库存: {p.stock} {p.unit || '个'} | 位置: {p.storage_location}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPart && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 4, backgroundColor: 'var(--bg-card)' }}>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>{selectedPart.name}</span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>(库存: {selectedPart.stock})</span>
                    </span>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>数量：</label>
                    <input
                      type="number"
                      min={1}
                      max={selectedPart.stock}
                      defaultValue={1}
                      style={{ width: 70, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}
                      onChange={e => setSelectedPart({ ...selectedPart, quantity: Math.max(1, Number(e.target.value)) })}
                    />
                    <button type="button" className="btn-sm btn-outline-primary" onClick={addPart}>添加</button>
                    <button type="button" className="btn-sm" onClick={() => { setSelectedPart(null); }}>取消</button>
                  </div>
                )}
                {completeModal.parts.length > 0 && (
                  <table className="table-compact" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>物品名称</th>
                        <th>数量</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completeModal.parts.map((p, i) => (
                        <tr key={i}>
                          <td>{p.part_name}</td>
                          <td>{p.quantity}</td>
                          <td><button className="danger btn-sm" onClick={() => removePart(i)}>移除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setCompleteModal({ visible: false, repairId: '', workOrderNo: '', solution: '', parts: [], repairman: '', duration_minutes: '', stop_duration_minutes: '' })}>取消</button>
                <button type="button" className="primary" onClick={handleComplete}>确认完成</button>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* 删除确认弹窗 */}
      <DeleteConfirmModal
        visible={!!deleteConfirm}
        message="确定要删除这条维修工单吗？此操作不可撤销。"
        loading={deleting}
        onConfirm={async () => {
          if (!deleteConfirm) return;
          setDeleting(true);
          try {
            await repairApi.delete(deleteConfirm);
            setDeleteConfirm(null);
            load(currentPage); // 保持在当前页
            loadStats();
            window.dispatchEvent(new Event('zone-stats-updated'));
          } catch (err: any) {
            alert('删除失败：' + (err.response?.data?.error || err.message));
            setDeleteConfirm(null);
          } finally { setDeleting(false); }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* 查看详情弹窗 */}
      <ModalPortal visible={!!detailModal}>
        {detailModal && <div className="modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>工单详情</h3>
              <span className={'status-badge ' + (detailModal.status === '已完成' ? 'status-ok' : detailModal.status === '处理中' ? 'status-warning' : '')}>{detailModal.status}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 14 }}>
              <div><span style={{ color: 'var(--text-secondary)' }}>工单号：</span>{detailModal.work_order_no || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>工单类型：</span>{detailModal.work_order_type || '设备维修'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>线体：</span>{detailModal.line ? (() => { const v = String(detailModal.line).replace(/\.0$/, ''); return v.endsWith('线') ? v : v + '线'; })() : '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>设备/区域：</span>{detailModal.area || detailModal.device_name || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>报修人：</span>{detailModal.reporter || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>维修人：</span>{detailModal.repairman || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>报修日期：</span>{detailModal.report_date || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>报修时间：</span>{detailModal.report_time || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>接单时间：</span>{detailModal.accept_time || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>完成时间：</span>{detailModal.finish_time || '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>用时(分钟)：</span>{detailModal.duration_minutes ?? '-'}</div>
              <div><span style={{ color: 'var(--text-secondary)' }}>停线时长(分钟)：</span>{detailModal.stop_duration_minutes ?? '-'}</div>
            </div>

            <div style={{ marginTop: 16, fontSize: 14 }}>
              <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-secondary)' }}>故障描述：</span>{detailModal.fault_desc || '-'}</div>
              {/* 故障图片 */}
              {(() => {
                let images: string[] = [];
                try {
                  const raw = (detailModal as any).fault_images;
                  if (raw) images = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch (_) {}
                if (!images.length) return null;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>故障图片：</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      {images.map((img: string, idx: number) => (
                        <img key={idx} src={img} alt={`故障图${idx + 1}`}
                          style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                          onClick={() => setLightboxImage(img)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-secondary)' }}>故障类型：</span>{detailModal.fault_type || '-'}</div>
              <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-secondary)' }}>故障原因：</span>{detailModal.fault_cause || '-'}</div>
              <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-secondary)' }}>处理方式：</span>{detailModal.solution || '-'}</div>
              {detailModal.remarks && <div style={{ marginBottom: 8 }}><span style={{ color: 'var(--text-secondary)' }}>备注：</span>{detailModal.remarks}</div>}
            </div>

            {/* 更换零部件 */}
            <div style={{ marginTop: 20 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-secondary)' }}>
                更换零部件
                {detailModal.parts && detailModal.parts.length > 0 && (
                  <span style={{ marginLeft: 8, color: 'var(--accent-cyan)', fontWeight: 'normal' }}>
                    ({detailModal.parts.reduce((sum, p) => sum + (p.quantity || 0), 0)} 件)
                  </span>
                )}
              </h4>
              {detailModal.parts && detailModal.parts.length > 0 ? (
                <table className="table-compact" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>物品名称</th>
                      <th>物品编号</th>
                      <th>数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailModal.parts.map((p, i) => (
                      <tr key={i}>
                        <td>{p.part_name}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{p.part_no || '-'}</td>
                        <td>{p.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: '8px 0' }}>无更换零部件记录</div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" onClick={() => setDetailModal(null)}>关闭</button>
            </div>
          </div>
        </div>}
      </ModalPortal>

    {/* ===== 图片放大灯箱 ===== */}
    <ModalPortal visible={!!lightboxImage}>
    <div
      onClick={() => setLightboxImage(null)}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img src={lightboxImage!} alt="故障图片"
        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={() => setLightboxImage(null)}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          border: 'none', fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
    </ModalPortal>
    </div>
  );
}
