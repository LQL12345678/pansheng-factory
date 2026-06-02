import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { maintenanceApi, partApi } from '../services/api';
import { MaintenancePlan as MaintenancePlanType } from '../types';
import ModalPortal from '../components/ModalPortal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useAuth } from '../hooks/useAuth';

const PAGE_SIZE = 20;

interface PartItem {
  part_id: string;
  part_name: string;
  quantity: number;
}

export default function MaintenancePlanPage() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [allList, setAllList] = useState<MaintenancePlanType[]>([]);
  const [list, setList] = useState<MaintenancePlanType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<MaintenancePlanType | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<MaintenancePlanType>>({});
  const [deleteTarget, setDeleteTarget] = useState<MaintenancePlanType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 页面访问权限检查
  useEffect(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
  }, [user]);

  // 更换零部件相关
  const [formParts, setFormParts] = useState<PartItem[]>([]);
  const [partSearch, setPartSearch] = useState('');
  const [partOptions, setPartOptions] = useState<any[]>([]);
  const [selectedPart, setSelectedPart] = useState<any>(null);
  const [nextNo, setNextNo] = useState('');

  // 锁定背景滚动（弹窗打开时）
  useBodyScrollLock(showForm || !!deleteTarget);

  // 物品搜索（防抖自动搜索）
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

  const addPart = () => {
    if (!selectedPart) return;
    setFormParts(prev => [...prev, { part_id: String(selectedPart.id), part_name: selectedPart.name, quantity: selectedPart.quantity || 1 }]);
    setSelectedPart(null);
    setPartSearch('');
    setPartOptions([]);
  };

  const removePart = (index: number) => {
    setFormParts(prev => prev.filter((_, i) => i !== index));
  };

  // 计算分页数据
  const paginateData = useCallback((data: MaintenancePlanType[], page: number) => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    setList(data.slice(start, end));
    setTotalCount(data.length);
  }, []);

  const load = () => {
    maintenanceApi.list().then(r => {
      const data = r.data;
      setAllList(data);
      const newPage = 1;
      setCurrentPage(newPage);
      paginateData(data, newPage);
    });
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (editItem) {
      setFormData({ ...editItem });
      // 解析已有零部件
      if (editItem.parts && editItem.parts.length > 0) {
        setFormParts(editItem.parts.map((p: any) => ({
          part_id: String(p.part_id),
          part_name: p.part_name,
          quantity: p.quantity
        })));
      } else {
        setFormParts([]);
      }
    } else {
      setFormData({ status: '待执行' });
      setFormParts([]);
    }
    setPartSearch('');
    setPartOptions([]);
    setSelectedPart(null);
  }, [editItem]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: any = { ...formData };
      data.estimated_duration = data.estimated_duration ? Number(data.estimated_duration) : null;
      // 附带零部件
      if (formParts.length > 0) {
        data.parts = formParts.map(p => ({ part_id: Number(p.part_id), quantity: p.quantity }));
      } else {
        data.parts = [];
      }

      if (editItem?.id) {
        await maintenanceApi.update(String(editItem.id), data);
      } else {
        await maintenanceApi.create(data);
      }
      setShowForm(false);
      setEditItem(null);
      setFormData({});
      setFormParts([]);
      load();
      alert(editItem ? '更新成功！' : '创建成功！');
    } catch (err: any) {
      alert('保存失败：' + (err.response?.data?.error || err.message));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const workbook = XLSX.read(file, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      let imported = 0, skipped = 0;
      for (let i = 4; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || !row[2] || !row[3] || !row[4]) {
          if (row && row[2]) skipped++;
          continue;
        }
        try {
          await maintenanceApi.create({
            maintenance_type: row[2] || '',
            task_desc: row[3] || '',
            plan_date: row[4] || '',
            responsible_person: row[5] || '',
            wechat_id: row[6] || '',
            required_parts: row[7] || '',
            estimated_duration: row[8] ? Number(row[8]) : null,
            status: row[9] || '待执行',
            executor: row[10] || '',
            actual_date: row[11] || '',
            remarks: row[12] || ''
          });
          imported++;
        } catch (e) { skipped++; }
      }
      alert(`导入完成！成功: ${imported}，跳过: ${skipped}`);
      load();
    } catch (err: any) {
      alert('导入失败：' + (err.message || '文件格式错误'));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleExport = () => {
    const exportData = list.map((item: MaintenancePlanType) => {
      const row: any = {};
      row['计划编号'] = item.plan_no;
      row['保养位置'] = item.maintenance_type;
      row['任务描述'] = item.task_desc;
      row['计划日期'] = item.plan_date;
      row['负责人'] = item.responsible_person;
      row['所需物品'] = item.required_parts;
      row['预计时长(分钟)'] = item.estimated_duration;
      row['状态'] = item.status;
      row['执行人'] = item.executor;
      row['实际执行日期'] = item.actual_date;
      row['备注'] = item.remarks;
      if (item.parts && item.parts.length > 0) {
        row['更换零部件'] = item.parts.map((p: any) => `${p.part_name} x${p.quantity}`).join('; ');
      } else {
        row['更换零部件'] = '';
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '保养计划');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '保养计划导出.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="toolbar">
        {isAdmin && (
          <button className="primary" onClick={async () => { setEditItem(null); setFormData({ status: '待执行' }); setFormParts([]); try { const r = await maintenanceApi.nextNo(); setNextNo(r.data?.next_no || ''); } catch(e){} setShowForm(true); }}>
            ＋ 新增计划
          </button>
        )}
        {isAdmin && (
          <>
            <button onClick={() => fileRef.current?.click()}>导入Excel</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImport} />
          </>
        )}
        <button onClick={handleExport}>导出Excel</button>
      </div>
      <div className="card">
        <table>
          <thead><tr>
            <th>计划编号</th><th>保养位置</th><th>计划日期</th>
            <th>负责人</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            {list.map(d => <tr key={d.id}>
              <td className="monospace" data-label="编号">{d.plan_no}</td>
              <td data-label="保养位置">{d.maintenance_type}</td>
              <td data-label="计划日期">{d.plan_date}</td>
              <td data-label="负责人">{d.responsible_person}</td>
              <td data-label="状态">
                <span className={`status-badge ${
                  d.status === '已完成' ? 'status-ok' :
                  d.status === '已延期' ? 'status-error' :
                  d.status === '执行中' ? 'status-warning' : ''
                }`}>{d.status}</span>
              </td>
              <td>
                <button className="btn-sm" onClick={() => { setEditItem(d); setShowForm(true); }}>编辑</button>
                {isSuperAdmin && <button className="danger btn-sm" onClick={() => setDeleteTarget(d)}>删除</button>}
              </td>
            </tr>)}
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
          <div className="modal" style={{ maxWidth: 640 }}>
            <h3>{editItem ? '编辑计划' : '新增计划'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                {!editItem && nextNo && <div><label>计划编号</label><input value={nextNo} readOnly style={{ backgroundColor: 'var(--bg-secondary, #f5f5f5)', color: 'var(--text-secondary)' }} /></div>}
                <div><label>保养位置*</label><input name="maintenance_type" value={formData.maintenance_type || ''} onChange={handleInputChange} placeholder="如：1线-3楼线体、1线-3楼线体+提升机" required /></div>
                <div><label>计划日期*</label><input name="plan_date" type="date" value={formData.plan_date || ''} onChange={handleInputChange} required /></div>
                <div style={{gridColumn:'1/-1'}}><label>任务描述*</label><input name="task_desc" value={formData.task_desc || ''} onChange={handleInputChange} required /></div>
                <div><label>负责人*</label><input name="responsible_person" value={formData.responsible_person || ''} onChange={handleInputChange} required /></div>
                <div><label>执行人</label><input name="executor" value={formData.executor || ''} onChange={handleInputChange} /></div>
                <div><label>状态</label>
                  <select name="status" value={formData.status || '待执行'} onChange={handleInputChange}>
                    <option>待执行</option><option>执行中</option><option>已完成</option><option>已延期</option><option>已取消</option>
                  </select>
                </div>
                <div><label>实际执行日期</label><input name="actual_date" type="date" value={formData.actual_date || ''} onChange={handleInputChange} /></div>
                <div><label>企业微信ID</label><input name="wechat_id" value={formData.wechat_id || ''} onChange={handleInputChange} /></div>
                <div><label>预计时长(分钟)</label><input name="estimated_duration" type="number" value={formData.estimated_duration ?? ''} onChange={handleInputChange} /></div>
                <div><label>所需物品</label><input name="required_parts" value={formData.required_parts || ''} onChange={handleInputChange} /></div>
                <div style={{gridColumn:'1/-1'}}><label>备注</label><input name="remarks" value={formData.remarks || ''} onChange={handleInputChange} /></div>
              </div>

              {/* 更换零部件 */}
              <div style={{ marginTop: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>更换零部件</label>
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
                    <button type="button" className="btn-sm" style={{ color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)' }} onClick={addPart}>添加</button>
                    <button type="button" className="btn-sm" onClick={() => { setSelectedPart(null); }}>取消</button>
                  </div>
                )}
                {formParts.length > 0 && (
                  <table className="table-compact" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>物品名称</th>
                        <th>数量</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formParts.map((p, i) => (
                        <tr key={i}>
                          <td>{p.part_name}</td>
                          <td>{p.quantity}</td>
                          <td><button className="danger btn-sm" type="button" onClick={() => removePart(i)}>移除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); setFormParts([]); }}>取消</button>
                <button type="submit" className="primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      <DeleteConfirmModal
        visible={!!deleteTarget}
        message="确定要删除这条保养计划吗？此操作不可撤销。"
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget?.id) return;
          setDeleting(true);
          try {
            await maintenanceApi.delete(String(deleteTarget.id));
            setDeleteTarget(null);
            load();
          } catch (err: any) {
            alert('删除失败：' + (err.response?.data?.error || err.message));
            setDeleteTarget(null);
          } finally { setDeleting(false); }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
