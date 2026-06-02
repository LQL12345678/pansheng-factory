import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useLocation } from 'react-router-dom';
import { partApi } from '../services/api';
import { Part } from '../types';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useAuth } from '../hooks/useAuth';

const PAGE_SIZE = 20;

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

// 预设线体选项
const LINE_OPTIONS = ['1线', '2线', '3线', '4线', 'VIP线', '紫外', '仓储', '其他'];

export default function PartList() {
  const location = useLocation();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [allList, setAllList] = useState<Part[]>([]);
  const [list, setList] = useState<Part[]>([]);
  const [keyword, setKeyword] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Part | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<Part>>({});
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Part | null>(null);
  const [submitting, setSubmitting] = useState(false);
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

  // 行内编辑库存
  const [inlineEditId, setInlineEditId] = useState<number | null>(null);
  const [inlineStockVal, setInlineStockVal] = useState<string>('');
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // 领用弹窗
  const [usageItem, setUsageItem] = useState<Part | null>(null);
  const [usageForm, setUsageForm] = useState<{
    handler: string; line: string; quantity: string;
    log_date: string; purpose: string; remarks: string;
  }>({ handler: '', line: '', quantity: '1', log_date: today(), purpose: '', remarks: '' });

  // 入库弹窗
  const [stockinItem, setStockinItem] = useState<Part | null>(null);
  const [stockinForm, setStockinForm] = useState<{
    quantity: string; log_date: string; handler: string; remarks: string;
  }>({ quantity: '1', log_date: today(), handler: '', remarks: '' });

  // 待审批弹窗
  const [showPending, setShowPending] = useState(false);
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState<{ visible: boolean; item: any }>({ visible: false, item: null });
  const [rejectReason, setRejectReason] = useState('');

  // 记录弹窗
  const [showLogs, setShowLogs] = useState(false);
  const [logsTab, setLogsTab] = useState<'usage' | 'stockin'>('usage');
  const [usageLogs, setUsageLogs] = useState<any[]>([]);
  const [stockinLogs, setStockinLogs] = useState<any[]>([]);
  const [logsKeyword, setLogsKeyword] = useState('');
  const [logsStartDate, setLogsStartDate] = useState('');
  const [logsEndDate, setLogsEndDate] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);

  // 超管：编辑领用/入库记录弹窗
  const [editLogItem, setEditLogItem] = useState<any | null>(null);
  const [editLogType, setEditLogType] = useState<'usage' | 'stockin'>('usage');
  const [editLogForm, setEditLogForm] = useState<any>({});
  const [editLogSubmitting, setEditLogSubmitting] = useState(false);
  // 超管：删除领用/入库记录确认
  const [deleteLogItem, setDeleteLogItem] = useState<any | null>(null);
  const [deleteLogType, setDeleteLogType] = useState<'usage' | 'stockin'>('usage');
  const [deleteLogSubmitting, setDeleteLogSubmitting] = useState(false);

  // 锁定背景滚动（弹窗打开时）
  useBodyScrollLock(showForm || !!confirmDelete || !!usageItem || !!stockinItem || showLogs || showPending || rejectModal.visible || !!editLogItem || !!deleteLogItem);

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // 计算分页数据
  const paginateData = useCallback((data: Part[], page: number) => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    setList(data.slice(start, end));
    setTotalCount(data.length);
  }, []);

  const load = (kw?: string, keepPage?: number) => {
    partApi.list(kw).then(r => {
      const data = [...r.data];
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

  useEffect(() => {
    load();
    if (location?.pathname === '/parts/add') {
      setShowForm(true);
      setEditItem(null);
      setFormData({ unit: '个', safety_stock: 5, stock: 0 });
      partApi.nextNo().then(r => setNextNo(r.data?.next_no || '')).catch(() => {});
    }
    if (location?.pathname === '/parts/withdraw') {
      setShowForm(false);
      setEditItem(null);
    }
  }, [location?.pathname]);

  // 定时刷新数据（保持当前页码）
  useEffect(() => {
    const interval = setInterval(() => {
      load(keyword, currentPageRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, [keyword]);

  useEffect(() => {
    if (editItem) setFormData({ ...editItem });
    else setFormData({ unit: '个', safety_stock: 5, stock: 0 });
  }, [editItem]);

  // ===== 搜索 =====
  const handleSearch = () => {
    const kw = keyword.toLowerCase();
    const filtered = allList.filter((d: Part) =>
      (d.part_no || '').toLowerCase().includes(kw) ||
      (d.name || '').toLowerCase().includes(kw) ||
      (d.spec || '').toLowerCase().includes(kw) ||
      (d.brand || '').toLowerCase().includes(kw) ||
      (d.storage_location || '').toLowerCase().includes(kw)
    );
    const newPage = 1;
    setCurrentPage(newPage);
    paginateData(filtered, newPage);
  };

  // ===== 行内库存编辑 =====
  const startInlineEdit = (item: Part) => {
    setInlineEditId(item.id!);
    setInlineStockVal(String(item.stock));
    setTimeout(() => inlineInputRef.current?.focus(), 30);
  };
  const commitInlineEdit = async (item: Part) => {
    const newStock = Number(inlineStockVal);
    if (isNaN(newStock) || newStock === item.stock) { setInlineEditId(null); return; }
    try {
      await partApi.patchStock(String(item.id), newStock);
      setList(prev => prev.map(p => p.id === item.id ? { ...p, stock: newStock } : p));
      showToast(`库存已更新：${item.name} → ${newStock} ${item.unit || '个'}`, 'success');
    } catch (err: any) {
      showToast('更新失败：' + (err.response?.data?.error || err.message), 'error');
    }
    setInlineEditId(null);
  };

  // ===== 新增/编辑表单 =====
  const handleInputChange = (e: ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEdit = !!editItem?.id;
    setSubmitting(true);
    try {
      const data: any = { ...formData };
      data.stock = Number(data.stock);
      data.safety_stock = Number(data.safety_stock);
      data.unit_price = data.unit_price ? Number(data.unit_price) : null;
      data.purchase_cycle_days = data.purchase_cycle_days ? Number(data.purchase_cycle_days) : null;
      if (isEdit) await partApi.update(String(editItem!.id), data);
      else await partApi.create(data);
      setShowForm(false); setEditItem(null); setFormData({});
      await load(keyword || undefined, currentPage); // 保持在当前页
      showToast(isEdit ? '更新成功！' : '创建成功！', 'success');
    } catch (err: any) {
      showToast('保存失败：' + (err.response?.data?.error || err.message || '未知错误'), 'error');
    } finally { setSubmitting(false); }
  };

  // ===== 删除 =====
  const doDelete = async () => {
    if (!confirmDelete?.id) return;
    setSubmitting(true);
    try {
      await partApi.delete(String(confirmDelete.id));
      setConfirmDelete(null);
      await load(keyword || undefined, currentPage); // 保持在当前页
      showToast('删除成功！', 'success');
    } catch (err: any) {
      showToast('删除失败：' + (err.response?.data?.error || err.message), 'error');
      setConfirmDelete(null);
    } finally { setSubmitting(false); }
  };

  // ===== 领用 =====
  const openUsage = (item: Part) => {
    setUsageItem(item);
    setUsageForm({ handler: getCurrentUsername(), line: '', quantity: '1', log_date: today(), purpose: '', remarks: '' });
  };
  const handleUsageChange = (e: ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setUsageForm(prev => ({ ...prev, [name]: value }));
  };
  const submitUsage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usageItem) return;
    const qty = Number(usageForm.quantity);
    if (!qty || qty <= 0) { showToast('领用数量必须大于 0', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await partApi.usage({
        part_id: usageItem.id,
        quantity: qty,
        handler: usageForm.handler,
        line: usageForm.line,
        log_date: usageForm.log_date,
        purpose: usageForm.purpose,
        remarks: usageForm.remarks,
      });
      setList(prev => prev.map(p => p.id === usageItem.id ? { ...p, stock: res.data.stock } : p));
      // 刷新全部数据以更新 allList（用于搜索）
      await load(keyword || undefined, currentPage); // 保持在当前页
      setUsageItem(null);
      showToast(`领用成功！${usageItem.name} 剩余库存：${res.data.stock} ${usageItem.unit || '个'}`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || '领用失败', 'error');
    } finally { setSubmitting(false); }
  };

  // ===== 入库 =====
  const openStockin = (item: Part) => {
    setStockinItem(item);
    setStockinForm({ quantity: '1', log_date: today(), handler: getCurrentUsername(), remarks: '' });
  };
  const handleStockinChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setStockinForm(prev => ({ ...prev, [name]: value }));
  };
  const submitStockin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockinItem) return;
    const qty = Number(stockinForm.quantity);
    if (!qty || qty <= 0) { showToast('入库数量必须大于 0', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await partApi.stockin({
        part_id: stockinItem.id,
        quantity: qty,
        handler: stockinForm.handler,
        log_date: stockinForm.log_date,
        remarks: stockinForm.remarks,
      });
      setList(prev => prev.map(p => p.id === stockinItem.id ? { ...p, stock: res.data.stock } : p));
      // 刷新全部数据以更新 allList（用于搜索）
      await load(keyword || undefined, currentPage); // 保持在当前页
      setStockinItem(null);
      showToast(`入库成功！${stockinItem.name} 当前库存：${res.data.stock} ${stockinItem.unit || '个'}`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || '入库失败', 'error');
    } finally { setSubmitting(false); }
  };

  // ===== 记录查询 =====
  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const params = {
        keyword: logsKeyword || undefined,
        start_date: logsStartDate || undefined,
        end_date: logsEndDate || undefined,
      };
      const [uRes, sRes] = await Promise.all([
        partApi.usageLogs(params),
        partApi.stockinLogs(params),
      ]);
      setUsageLogs(uRes.data);
      setStockinLogs(sRes.data);
    } catch (err: any) {
      showToast('加载记录失败', 'error');
    } finally { setLogsLoading(false); }
  };
  const openLogs = () => { setShowLogs(true); loadLogs(); };

  // ===== 超管：编辑记录 =====
  const openEditLog = (row: any, type: 'usage' | 'stockin') => {
    setEditLogType(type);
    setEditLogItem(row);
    if (type === 'usage') {
      setEditLogForm({
        part_id: row.part_id,
        part_name: row.part_name,
        quantity: String(row.quantity),
        handler: row.handler || '',
        line: row.line || '',
        log_date: row.log_date || today(),
        purpose: row.purpose || '',
        remarks: row.remarks || '',
      });
    } else {
      setEditLogForm({
        part_id: row.part_id,
        part_name: row.part_name,
        quantity: String(row.quantity),
        handler: row.handler || '',
        log_date: row.log_date || today(),
        remarks: row.remarks || '',
      });
    }
  };

  const submitEditLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editLogItem) return;
    const qty = Number(editLogForm.quantity);
    if (!qty || qty <= 0) { showToast('数量必须大于 0', 'error'); return; }
    setEditLogSubmitting(true);
    try {
      if (editLogType === 'usage') {
        await partApi.usageSuperUpdate(String(editLogItem.id), {
          part_id: editLogForm.part_id,
          quantity: qty,
          handler: editLogForm.handler,
          line: editLogForm.line,
          log_date: editLogForm.log_date,
          purpose: editLogForm.purpose,
          remarks: editLogForm.remarks,
        });
      } else {
        await partApi.stockinUpdate(String(editLogItem.id), {
          part_id: editLogForm.part_id,
          quantity: qty,
          handler: editLogForm.handler,
          log_date: editLogForm.log_date,
          remarks: editLogForm.remarks,
        });
      }
      setEditLogItem(null);
      showToast('记录已更新', 'success');
      loadLogs();
      load(keyword || undefined, currentPage);
    } catch (err: any) {
      showToast(err.response?.data?.error || '更新失败', 'error');
    } finally { setEditLogSubmitting(false); }
  };

  // ===== 超管：删除记录 =====
  const openDeleteLog = (row: any, type: 'usage' | 'stockin') => {
    setDeleteLogItem(row);
    setDeleteLogType(type);
  };

  const confirmDeleteLog = async () => {
    if (!deleteLogItem) return;
    setDeleteLogSubmitting(true);
    try {
      if (deleteLogType === 'usage') {
        await partApi.usageDelete(String(deleteLogItem.id));
      } else {
        await partApi.stockinDelete(String(deleteLogItem.id));
      }
      setDeleteLogItem(null);
      showToast('记录已删除', 'success');
      loadLogs();
      load(keyword || undefined, currentPage);
    } catch (err: any) {
      showToast(err.response?.data?.error || '删除失败', 'error');
    } finally { setDeleteLogSubmitting(false); }
  };

  // ===== 待审批 =====
  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const res = await partApi.usagePending();
      setPendingList(res.data);
    } catch (err: any) {
      showToast('加载待审批列表失败', 'error');
    } finally { setPendingLoading(false); }
  };
  const openPending = () => { setShowPending(true); loadPending(); };
  const handleApprove = async (item: any) => {
    try {
      await partApi.usageApprove(String(item.id));
      showToast(`已审批通过：${item.part_name} × ${item.quantity}`, 'success');
      loadPending();
      load(keyword || undefined, currentPage);
    } catch (err: any) {
      showToast(err.response?.data?.error || '审批失败', 'error');
    }
  };
  const openReject = (item: any) => { setRejectModal({ visible: true, item }); setRejectReason(''); };
  const handleReject = async () => {
    if (!rejectModal.item) return;
    try {
      await partApi.usageReject(String(rejectModal.item.id), rejectReason);
      showToast('已驳回该申请', 'success');
      setRejectModal({ visible: false, item: null });
      loadPending();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    }
  };

  // ===== 导入/导出 =====
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await partApi.importExcel(file);
      showToast(`导入完成！成功: ${result.data?.imported || 0}，跳过: ${result.data?.skipped || 0}`, 'success');
      load(keyword || undefined);
    } catch (err: any) {
      showToast('导入失败：' + (err.message || '文件格式错误'), 'error');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = () => {
    const exportData = list.map((item: Part) => ({
      '物品编号': item.part_no, '物品名称': item.name, '规格型号': item.spec,
      '品牌': item.brand, '适用设备': item.applicable_devices,
      '存放位置': item.storage_location, '当前库存': item.stock,
      '安全库存': item.safety_stock, '单位': item.unit, '单价': item.unit_price,
      '供应商': item.supplier, '采购周期(天)': item.purchase_cycle_days, '备注': item.remarks,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '物品台账');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '物品台账导出.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  // ===== 通用弹窗样式 =====
  const modalStyle: React.CSSProperties = { maxWidth: 480 };
  const fieldStyle: React.CSSProperties = { marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#666', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    border: '1px solid #d9d9d9', fontSize: 14, boxSizing: 'border-box',
  };
  const btnRowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* ===== Toast ===== */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8,
          background: toast.type === 'success' ? '#52c41a' : '#ff4d4f',
          color: '#fff', fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease', maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}

      {/* ===== 删除确认 ===== */}
      <DeleteConfirmModal
        visible={!!confirmDelete}
        itemName={confirmDelete?.name}
        loading={submitting}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ===== 领用弹窗 ===== */}
      {usageItem && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0 }}>领用申请</h3>
            <p style={{ margin: '4px 0 16px', color: '#555', fontSize: 13 }}>
              {usageItem.name}（{usageItem.spec}）&nbsp;&nbsp;
              当前库存：<strong style={{ color: usageItem.stock <= 0 ? '#ff4d4f' : '#1677ff' }}>
                {usageItem.stock} {usageItem.unit || '个'}
              </strong>
            </p>
            <form onSubmit={submitUsage}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>领用人 *</label>
                  <input style={inputStyle} name="handler" value={usageForm.handler}
                    onChange={handleUsageChange} required placeholder="请输入姓名" />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>领用数量 *</label>
                  <input style={inputStyle} name="quantity" type="number" min={1}
                    value={usageForm.quantity} onChange={handleUsageChange} required />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>线体 *</label>
                  <select style={inputStyle} name="line" value={usageForm.line}
                    onChange={handleUsageChange as any} required>
                    <option value="">请选择</option>
                    {LINE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>领用日期 *</label>
                  <input style={inputStyle} name="log_date" type="date"
                    value={usageForm.log_date} onChange={handleUsageChange} required />
                </div>
                <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                  <label style={labelStyle}>用途</label>
                  <input style={inputStyle} name="purpose" value={usageForm.purpose}
                    onChange={handleUsageChange} placeholder="领用原因描述（可选）" />
                </div>
                <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                  <label style={labelStyle}>备注</label>
                  <input style={inputStyle} name="remarks" value={usageForm.remarks}
                    onChange={handleUsageChange} placeholder="补充说明（可选）" />
                </div>
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setUsageItem(null)}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '提交中...' : '确认提交'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 入库弹窗 ===== */}
      {stockinItem && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0 }}>物品入库</h3>
            <p style={{ margin: '4px 0 16px', color: '#555', fontSize: 13 }}>
              {stockinItem.name}（{stockinItem.spec}）&nbsp;&nbsp;
              当前库存：<strong style={{ color: '#1677ff' }}>{stockinItem.stock} {stockinItem.unit || '个'}</strong>
            </p>
            <form onSubmit={submitStockin}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>入库数量 *</label>
                  <input style={inputStyle} name="quantity" type="number" min={1}
                    value={stockinForm.quantity} onChange={handleStockinChange} required />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>入库日期 *</label>
                  <input style={inputStyle} name="log_date" type="date"
                    value={stockinForm.log_date} onChange={handleStockinChange} required />
                </div>
                <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                  <label style={labelStyle}>录入人 *</label>
                  <input style={inputStyle} name="handler" value={stockinForm.handler}
                    onChange={handleStockinChange} required placeholder="请输入姓名" />
                </div>
                <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                  <label style={labelStyle}>备注</label>
                  <input style={inputStyle} name="remarks" value={stockinForm.remarks}
                    onChange={handleStockinChange} placeholder="补充说明（可选）" />
                </div>
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setStockinItem(null)}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '提交中...' : '确认入库'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 领用/入库记录弹窗 ===== */}
      {showLogs && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 1500, width: '98vw' }}>
            <style>{`
              #logs-usage-table td, #logs-stockin-table td {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }
              .log-action-cell {
                overflow: visible !important;
                text-overflow: unset !important;
              }
              #logs-usage-table th, #logs-stockin-table th {
                white-space: nowrap;
              }
            `}</style>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>领用申请 / 入库记录</h3>
              <button type="button" onClick={() => setShowLogs(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            {/* Tab */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 14, borderBottom: '2px solid #f0f0f0' }}>
              {(['usage', 'stockin'] as const).map(tab => (
                <button key={tab} type="button" onClick={() => setLogsTab(tab)}
                  style={{
                    padding: '8px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
                    background: 'none',
                    borderBottom: logsTab === tab ? '2px solid #1677ff' : '2px solid transparent',
                    color: logsTab === tab ? '#1677ff' : '#666',
                    marginBottom: -2,
                  }}>
                  {tab === 'usage' ? '领用记录' : '入库记录'}
                </button>
              ))}
            </div>
            {/* 筛选 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input placeholder="搜索物品名称/编号/人员" value={logsKeyword}
                onChange={e => setLogsKeyword(e.target.value)}
                style={{ ...inputStyle, width: 200 }} />
              <input type="date" value={logsStartDate} onChange={e => setLogsStartDate(e.target.value)}
                style={{ ...inputStyle, width: 150 }} title="开始日期" />
              <span style={{ lineHeight: '34px', color: '#999' }}>—</span>
              <input type="date" value={logsEndDate} onChange={e => setLogsEndDate(e.target.value)}
                style={{ ...inputStyle, width: 150 }} title="结束日期" />
              <button className="primary" onClick={loadLogs} style={{ padding: '7px 16px' }}>查询</button>
              <button onClick={() => { setLogsKeyword(''); setLogsStartDate(''); setLogsEndDate(''); }}
                style={{ padding: '7px 16px' }}>重置</button>
            </div>
            {/* 表格 */}
            {logsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
            ) : logsTab === 'usage' ? (
              <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', minWidth: 900, fontSize: 13, tableLayout: 'fixed' }} id="logs-usage-table">
                  <colgroup>
                    <col style={{ width: 120 }} />{/* 物品名称 */}
                    <col style={{ width: 110 }} />{/* 物品编号 */}
                    <col style={{ width: 110 }} />{/* 规格型号 */}
                    <col style={{ width: 70 }} />{/* 领用人 */}
                    <col style={{ width: 70 }} />{/* 线体 */}
                    <col style={{ width: 90 }} />{/* 领用日期 */}
                    <col style={{ width: 60 }} />{/* 数量 */}
                    <col style={{ width: 100 }} />{/* 用途 */}
                    <col style={{ width: 100 }} />{/* 备注 */}
                    <col style={{ width: 70 }} />{/* 审批状态 */}
                    {isSuperAdmin && <col style={{ width: 120 }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>物品名称</th><th>物品编号</th><th>规格型号</th><th>领用人</th><th>线体</th>
                      <th>领用日期</th><th>数量</th><th>用途</th><th>备注</th><th>审批状态</th>
                      {isSuperAdmin && <th style={{ width: 90 }}>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {usageLogs.length === 0 ? (
                      <tr><td colSpan={isSuperAdmin ? 11 : 10} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>暂无记录</td></tr>
                    ) : usageLogs.map(r => (
                      <tr key={r.id}>
                        <td>{r.part_name}</td>
                        <td className="monospace">{r.part_no_ref}</td>
                        <td>{r.part_spec || '-'}</td>
                        <td>{r.handler}</td>
                        <td>{r.line}</td>
                        <td>{r.log_date}</td>
                        <td>{r.quantity} {r.part_unit}</td>
                        <td>{r.purpose}</td>
                        <td>{r.remarks}</td>
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 12,
                            background: r.approval_status === 'pending' ? '#fff7e6' :
                                        r.approval_status === 'approved' ? '#f6ffed' : '#fff2f0',
                            color: r.approval_status === 'pending' ? '#fa8c16' :
                                   r.approval_status === 'approved' ? '#52c41a' : '#ff4d4f',
                          }}>
                            {r.approval_status === 'pending' ? '待审批' :
                             r.approval_status === 'approved' ? '已通过' : '已驳回'}
                          </span>
                        </td>
                        {isSuperAdmin && (
                          <td className="log-action-cell" style={{ whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => openEditLog(r, 'usage')}
                              style={{ fontSize: 12, padding: '2px 8px', marginRight: 4, cursor: 'pointer',
                                background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.3)',
                                borderRadius: 4, color: '#1677ff' }}>
                              编辑
                            </button>
                            <button
                              onClick={() => openDeleteLog(r, 'usage')}
                              style={{ fontSize: 12, padding: '2px 8px', cursor: 'pointer',
                                background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)',
                                borderRadius: 4, color: '#ff4d4f' }}>
                              删除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', minWidth: 700, fontSize: 13, tableLayout: 'fixed' }} id="logs-stockin-table">
                  <colgroup>
                    <col style={{ width: 140 }} />{/* 物品名称 */}
                    <col style={{ width: 120 }} />{/* 物品编号 */}
                    <col style={{ width: 120 }} />{/* 规格型号 */}
                    <col style={{ width: 90 }} />{/* 入库数量 */}
                    <col style={{ width: 100 }} />{/* 入库日期 */}
                    <col style={{ width: 80 }} />{/* 录入人 */}
                    <col style={{ width: 140 }} />{/* 备注 */}
                    {isSuperAdmin && <col style={{ width: 120 }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>物品名称</th><th>物品编号</th><th>规格型号</th><th>入库数量</th>
                      <th>入库日期</th><th>录入人</th><th>备注</th>
                      {isSuperAdmin && <th style={{ width: 90 }}>操作</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {stockinLogs.length === 0 ? (
                      <tr><td colSpan={isSuperAdmin ? 8 : 7} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>暂无记录</td></tr>
                    ) : stockinLogs.map(r => (
                      <tr key={r.id}>
                        <td>{r.part_name}</td>
                        <td className="monospace">{r.part_no_ref}</td>
                        <td>{r.part_spec || '-'}</td>
                        <td>{r.quantity} {r.part_unit}</td>
                        <td>{r.log_date}</td>
                        <td>{r.handler}</td>
                        <td>{r.remarks}</td>
                        {isSuperAdmin && (
                          <td className="log-action-cell" style={{ whiteSpace: 'nowrap' }}>
                            <button
                              onClick={() => openEditLog(r, 'stockin')}
                              style={{ fontSize: 12, padding: '2px 8px', marginRight: 4, cursor: 'pointer',
                                background: 'rgba(22,119,255,0.1)', border: '1px solid rgba(22,119,255,0.3)',
                                borderRadius: 4, color: '#1677ff' }}>
                              编辑
                            </button>
                            <button
                              onClick={() => openDeleteLog(r, 'stockin')}
                              style={{ fontSize: 12, padding: '2px 8px', cursor: 'pointer',
                                background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)',
                                borderRadius: 4, color: '#ff4d4f' }}>
                              删除
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ===== 超管：编辑领用/入库记录弹窗 ===== */}
      {editLogItem && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 style={{ marginTop: 0 }}>
              ✏️ 编辑{editLogType === 'usage' ? '领用' : '入库'}记录
            </h3>
            <form onSubmit={submitEditLog}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* 物品名称（只读，不允许换物品避免库存混乱） */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>物品名称</label>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>
                    {editLogItem.part_name}
                    {editLogItem.part_spec && <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>({editLogItem.part_spec})</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {editLogType === 'usage' ? '领用' : '入库'}数量 <span style={{ color: '#ff4d4f' }}>*</span>
                    </label>
                    <input
                      type="number" min="1" required
                      value={editLogForm.quantity}
                      onChange={e => setEditLogForm((p: any) => ({ ...p, quantity: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
                        background: 'var(--bg-card)', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>日期</label>
                    <input
                      type="date" required
                      value={editLogForm.log_date}
                      onChange={e => setEditLogForm((p: any) => ({ ...p, log_date: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
                        background: 'var(--bg-card)', color: 'var(--text)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {editLogType === 'usage' ? '领用人' : '录入人'}
                    </label>
                    <input
                      type="text"
                      value={editLogForm.handler}
                      onChange={e => setEditLogForm((p: any) => ({ ...p, handler: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
                        background: 'var(--bg-card)', color: 'var(--text)' }}
                    />
                  </div>
                  {editLogType === 'usage' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>线体</label>
                      <select
                        value={editLogForm.line}
                        onChange={e => setEditLogForm((p: any) => ({ ...p, line: e.target.value }))}
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                          border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
                          background: 'var(--bg-card)', color: 'var(--text)' }}
                      >
                        <option value="">请选择</option>
                        {LINE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  )}
                </div>
                {editLogType === 'usage' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>用途</label>
                    <input
                      type="text"
                      value={editLogForm.purpose}
                      onChange={e => setEditLogForm((p: any) => ({ ...p, purpose: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                        border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
                        background: 'var(--bg-card)', color: 'var(--text)' }}
                    />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>备注</label>
                  <input
                    type="text"
                    value={editLogForm.remarks}
                    onChange={e => setEditLogForm((p: any) => ({ ...p, remarks: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6,
                      border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
                      background: 'var(--bg-card)', color: 'var(--text)' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setEditLogItem(null)}
                  style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                  取消
                </button>
                <button type="submit" className="primary" disabled={editLogSubmitting}
                  style={{ padding: '8px 20px' }}>
                  {editLogSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 超管：删除记录确认弹窗 ===== */}
      {deleteLogItem && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0, color: '#ff4d4f' }}>⚠️ 确认删除</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
              确定要删除这条{deleteLogType === 'usage' ? '领用' : '入库'}记录吗？
            </p>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>
              <div><strong>物品：</strong>{deleteLogItem.part_name}{deleteLogItem.part_spec && <span style={{ color: 'var(--text-secondary)', marginLeft: 6, fontSize: 12 }}>({deleteLogItem.part_spec})</span>}</div>
              <div><strong>数量：</strong>{deleteLogItem.quantity} {deleteLogItem.part_unit}</div>
              <div><strong>日期：</strong>{deleteLogItem.log_date}</div>
              {deleteLogType === 'usage' && <div><strong>领用人：</strong>{deleteLogItem.handler}</div>}
            </div>
            {deleteLogType === 'usage' && deleteLogItem.approval_status === 'approved' && (
              <p style={{ color: '#fa8c16', fontSize: 13, margin: '0 0 16px' }}>
                ⚠️ 该记录已审批通过，删除后将自动归还对应库存。
              </p>
            )}
            {deleteLogType === 'stockin' && (
              <p style={{ color: '#fa8c16', fontSize: 13, margin: '0 0 16px' }}>
                ⚠️ 删除入库记录将自动扣减对应库存数量。
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setDeleteLogItem(null)}
                style={{ padding: '8px 20px', borderRadius: 6, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text)', cursor: 'pointer' }}>
                取消
              </button>
              <button type="button" disabled={deleteLogSubmitting} onClick={confirmDeleteLog}
                style={{ padding: '8px 20px', borderRadius: 6, border: 'none',
                  background: '#ff4d4f', color: '#fff', cursor: 'pointer' }}>
                {deleteLogSubmitting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 待审批列表弹窗（管理员）===== */}
      {showPending && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 800, width: '92vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>📋 待审批领用申请</h3>
              <button type="button" onClick={() => setShowPending(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            {pendingLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
            ) : pendingList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#52c41a', fontSize: 15 }}>
                ✅ 暂无待审批的领用申请
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>物品名称</th><th>物品编号</th><th>领用人</th><th>线体</th>
                      <th>领用日期</th><th>数量</th><th>用途</th><th>备注</th><th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingList.map(r => (
                      <tr key={r.id}>
                        <td>{r.part_name}</td>
                        <td className="monospace">{r.part_no_ref}</td>
                        <td>{r.handler}</td>
                        <td>{r.line}</td>
                        <td>{r.log_date}</td>
                        <td>
                          <span style={{ color: r.current_stock < r.quantity ? '#ff4d4f' : '#1677ff', fontWeight: 600 }}>
                            {r.quantity} {r.part_unit}
                          </span>
                          <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>
                            (库存{r.current_stock})
                          </span>
                        </td>
                        <td>{r.purpose}</td>
                        <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.remarks}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              onClick={() => handleApprove(r)}
                              style={{
                                padding: '4px 12px', borderRadius: 4, border: 'none',
                                background: '#52c41a', color: '#fff', cursor: 'pointer', fontSize: 12
                              }}
                            >通过</button>
                            <button
                              onClick={() => openReject(r)}
                              style={{
                                padding: '4px 12px', borderRadius: 4, border: 'none',
                                background: '#ff4d4f', color: '#fff', cursor: 'pointer', fontSize: 12
                              }}
                            >驳回</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ===== 驳回原因弹窗 ===== */}
      {rejectModal.visible && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3 style={{ marginTop: 0 }}>驳回领用申请</h3>
            <p style={{ margin: '4px 0 16px', color: '#555', fontSize: 13 }}>
              物品：{rejectModal.item?.part_name} × {rejectModal.item?.quantity}
            </p>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>驳回原因</label>
              <textarea
                style={{ ...inputStyle, height: 80, resize: 'vertical' }}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="请输入驳回原因（可选）"
              />
            </div>
            <div style={btnRowStyle}>
              <button type="button" onClick={() => setRejectModal({ visible: false, item: null })}>取消</button>
              <button
                type="button"
                onClick={handleReject}
                style={{ background: '#ff4d4f', color: '#fff', border: 'none' }}
              >确认驳回</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 工具栏 ===== */}
      {/* ===== 工具栏 - 所有元素同一行 ===== */}
      <div className="toolbar" style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, alignItems: 'center' }}>
        {isAdmin && (
          <button className="primary" style={{ whiteSpace: 'nowrap' }} onClick={() => {
            setEditItem(null); setFormData({ unit: '个', safety_stock: 5, stock: 0 }); partApi.nextNo().then(r => setNextNo(r.data?.next_no || '')).catch(() => {}); setShowForm(true);
          }}>＋ 新增物品</button>
        )}
        {isAdmin && (
          <button className="btn-outline-default" style={{ whiteSpace: 'nowrap' }} onClick={() => fileRef.current?.click()}>导入Excel</button>
        )}
        {isAdmin && (
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
        )}
        {isAdmin && (
          <button className="btn-outline-warning" style={{ whiteSpace: 'nowrap' }} onClick={openPending}>📋 待审批</button>
        )}
        {/* 搜索框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <input
            className="toolbar-search"
            placeholder="搜索编号/名称/规格/品牌/位置"
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="primary" style={{ minWidth: 56, padding: '8px 12px', whiteSpace: 'nowrap' }} onClick={handleSearch}>搜索</button>
        </div>
        <button className="btn-outline-primary" style={{ whiteSpace: 'nowrap' }} onClick={openLogs}>📋 领用申请/入库记录</button>
        <button className="btn-outline-default" style={{ whiteSpace: 'nowrap' }} onClick={handleExport}>导出Excel</button>
      </div>

      {/* ===== 主表格 ===== */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th style={{ width: 48, textAlign: 'center' }}>序号</th>
              <th>物品编号</th><th>名称</th><th>规格</th>
              <th title="点击数字可直接修改库存">库存 {isAdmin && '✏️'}</th>
              <th>安全库存</th><th>位置</th><th>品牌</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', color: '#aaa', padding: 32 }}>
                {keyword ? '未找到匹配物品，请尝试其他关键字' : '暂无物品数据'}
              </td></tr>
            ) : list.map((d, index) => (
              <tr key={d.id}>
                <td style={{ textAlign: 'center', color: '#888', fontSize: 12 }}>{index + 1}</td>
                <td className="monospace" data-label="编号">{d.part_no}</td>
                <td data-label="名称">{d.name}</td>
                <td data-label="规格">{d.spec}</td>
                <td
                  className={d.stock < d.safety_stock ? 'status-error' : ''}
                  data-label="库存"
                  style={{ minWidth: 70 }}
                >
                  {isAdmin ? (
                    inlineEditId === d.id ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          ref={inlineInputRef}
                          type="number"
                          value={inlineStockVal}
                          onChange={e => setInlineStockVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitInlineEdit(d);
                            if (e.key === 'Escape') setInlineEditId(null);
                          }}
                          onBlur={() => commitInlineEdit(d)}
                          style={{ width: 60, padding: '2px 6px', fontSize: 12,
                            border: '1px solid #1677ff', borderRadius: 4, outline: 'none' }}
                        />
                        <span style={{ fontSize: 11, color: '#888' }}>{d.unit}</span>
                      </span>
                    ) : (
                      <span onClick={() => startInlineEdit(d)} title="点击修改库存"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        {d.stock} {d.unit}
                        <span style={{ fontSize: 10, color: '#bbb' }}>✏</span>
                      </span>
                    )
                  ) : (
                    <span>{d.stock} {d.unit}</span>
                  )}
                </td>
                <td data-label="安全库存">{d.safety_stock}</td>
                <td data-label="位置">{d.storage_location}</td>
                <td data-label="品牌">{d.brand}</td>
                <td style={{ whiteSpace: 'nowrap', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button className="btn-action btn-usage" onClick={() => openUsage(d)}>领用</button>
                    {isAdmin && (
                      <>
                        <button className="btn-action btn-stockin" onClick={() => openStockin(d)}>入库</button>
                        <button className="btn-action btn-edit" onClick={() => { setEditItem(d); setShowForm(true); }}>编辑</button>
                        {isSuperAdmin && <button className="btn-action btn-delete" onClick={() => setConfirmDelete(d)}>删除</button>}
                      </>
                    )}
                  </div>
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

      {/* ===== 新增/编辑弹窗 ===== */}
      {showForm && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editItem ? '编辑物品' : '新增物品'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div><label>物品编号</label><input name="part_no" value={editItem ? (formData.part_no || '') : nextNo} onChange={handleInputChange} readOnly={!editItem} style={!editItem ? { backgroundColor: 'var(--bg-secondary, #f5f5f5)', color: 'var(--text-secondary)' } : {}} /></div>
                <div><label>物品名称 *</label><input name="name" value={formData.name || ''} onChange={handleInputChange} required /></div>
                <div><label>规格型号 *</label><input name="spec" value={formData.spec || ''} onChange={handleInputChange} required /></div>
                <div><label>存放位置 *</label><input name="storage_location" value={formData.storage_location || ''} onChange={handleInputChange} required /></div>
                <div><label>当前库存 *</label><input name="stock" type="number" value={formData.stock ?? 0} onChange={handleInputChange} required /></div>
                <div><label>安全库存 *</label><input name="safety_stock" type="number" value={formData.safety_stock ?? 5} onChange={handleInputChange} required /></div>
                <div><label>品牌</label><input name="brand" value={formData.brand || ''} onChange={handleInputChange} /></div>
                <div><label>单位</label><input name="unit" value={formData.unit || '个'} onChange={handleInputChange} /></div>
                <div><label>单价</label><input name="unit_price" type="number" value={formData.unit_price ?? ''} onChange={handleInputChange} /></div>
                <div><label>供应商</label><input name="supplier" value={formData.supplier || ''} onChange={handleInputChange} /></div>
                <div><label>适用设备</label><input name="applicable_devices" value={formData.applicable_devices || ''} onChange={handleInputChange} /></div>
                <div><label>采购周期(天)</label><input name="purchase_cycle_days" type="number" value={formData.purchase_cycle_days ?? ''} onChange={handleInputChange} /></div>
                <div style={{ gridColumn: '1/-1' }}><label>备注</label><input name="remarks" value={formData.remarks || ''} onChange={handleInputChange} /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
