import { useState, useEffect, useRef, useCallback, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { deviceApi } from '../services/api';
import { Device, DeviceChangeRecord } from '../types';
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
}; // 每页显示条数

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DeviceList() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [allDevices, setAllDevices] = useState<Device[]>([]); // 全部数据
  const [devices, setDevices] = useState<Device[]>([]); // 当前页数据
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<Device>>({});
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 页面访问权限检查
  useEffect(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
  }, [user]);

  // 搜索
  const [search, setSearch] = useState('');
  // 分页
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // 报废相关
  const [scrapTarget, setScrapTarget] = useState<Device | null>(null);
  const [scrapForm, setScrapForm] = useState({ scrap_date: today(), scrap_reason: '', scrap_person: user?.username || '' });
  const [scrapping, setScrapping] = useState(false);

  // 采购/报废记录
  const [showRecords, setShowRecords] = useState(false);
  const [records, setRecords] = useState<DeviceChangeRecord[]>([]);
  const [recordsFilter, setRecordsFilter] = useState<string>('全部');
  const [recordsKeyword, setRecordsKeyword] = useState('');
  const [recordsLoading, setRecordsLoading] = useState(false);

  // 锁定背景滚动（弹窗打开时）
  useBodyScrollLock(showForm || !!deleteTarget || !!scrapTarget || showRecords);

  // 计算分页数据
  const paginateData = useCallback((data: Device[], page: number) => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    setDevices(data.slice(start, end));
    setTotalCount(data.length);
  }, []);

  // 加载数据
  const load = useCallback((keepPage?: number) => {
    deviceApi.list().then(r => {
      const list = r.data;
      const filtered = search ? list.filter((d: Device) =>
        (d.device_no || '').includes(search) ||
        (d.name || '').includes(search) ||
        (d.category || '').includes(search) ||
        (d.model || '').includes(search) ||
        (d.location || '').includes(search) ||
        (d.production_line || '').includes(search)
      ) : list;
      setAllDevices(filtered);

      // 计算正确的页码：保持当前页，但如果超出范围则回退
      const totalAfterFilter = filtered.length;
      const maxPage = Math.ceil(totalAfterFilter / PAGE_SIZE) || 1;
      let targetPage = 1;
      if (keepPage !== undefined && totalAfterFilter > 0) {
        targetPage = Math.min(keepPage, maxPage);
      }
      setCurrentPage(targetPage);
      paginateData(filtered, targetPage);
    });
  }, [search, paginateData]);

  useEffect(() => { load(); }, [load]);

  // 搜索变化时重置到第一页
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  useEffect(() => {
    if (editDevice) {
      setFormData({ ...editDevice });
    } else {
      setFormData({});
    }
  }, [editDevice]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type } = target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) || 0 : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('表单提交开始', { editDevice, formData });
    try {
      if (editDevice?.id) {
        await deviceApi.update(String(editDevice.id), formData);
      } else {
        console.log('调用 deviceApi.create', formData);
        await deviceApi.create(formData);
      }
      setShowForm(false); setEditDevice(null); setFormData({}); load();
      alert(editDevice ? '更新成功！' : '创建成功！');
    } catch (err: any) {
      console.error('保存失败', err);
      alert('保存失败：' + (err.response?.data?.error || err.message));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const res = await deviceApi.importExcel(file);
      const { imported, skipped, errors } = res.data || {};
      let msg = `导入完成！新增 ${imported} 条`;
      if (skipped > 0) msg += `，跳过 ${skipped} 条`;
      if (errors && errors.length > 0) msg += `\n部分失败：\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? '\n...' : ''}`;
      alert(msg);
      load();
    } catch (err: any) {
      alert('导入失败：' + (err.response?.data?.error || err.message));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExport = () => {
    const exportData = devices.map((item: Device) => ({
      '设备编号': item.device_no,
      '设备名称': item.name,
      '设备类别': item.category,
      '型号规格': item.model,
      '安装位置': item.location,
      '所属产线': item.production_line,
      '供应商': item.supplier,
      '安装日期': item.install_date,
      '保养周期(天)': item.maintenance_cycle_days,
      '责任人': item.responsible_person,
      '状态': item.status,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '设备台账');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = '设备台账导出.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  // ===== 报废 =====
  const openScrap = (d: Device) => {
    setScrapTarget(d);
    setScrapForm({ scrap_date: today(), scrap_reason: '', scrap_person: getCurrentUsername() });
  };
  const handleScrapChange = (e: ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setScrapForm(prev => ({ ...prev, [name]: value }));
  };
  const submitScrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapTarget?.id) return;
    setScrapping(true);
    try {
      await deviceApi.scrap(String(scrapTarget.id), scrapForm);
      setScrapTarget(null);
      load(currentPage); // 保持在当前页
      alert('报废成功！');
    } catch (err: any) {
      alert('报废失败：' + (err.response?.data?.error || err.message));
    } finally { setScrapping(false); }
  };

  // ===== 采购/报废记录 =====
  const loadRecords = async () => {
    setRecordsLoading(true);
    try {
      const params: any = {};
      if (recordsFilter && recordsFilter !== '全部') params.type = recordsFilter;
      if (recordsKeyword) params.keyword = recordsKeyword;
      const res = await deviceApi.changeRecords(params);
      setRecords(res.data);
    } catch {
      setRecords([]);
    } finally { setRecordsLoading(false); }
  };
  const openRecords = () => { setShowRecords(true); setRecordsFilter('全部'); setRecordsKeyword(''); loadRecords(); };

  // ===== 启用 =====
  const handleRestore = async (d: Device) => {
    if (!confirm(`确定要启用设备「${d.name}」吗？\n启用后将删除报废记录。`)) return;
    try {
      await deviceApi.restore(String(d.id));
      load(currentPage);
      alert('启用成功！');
    } catch (err: any) {
      alert('启用失败：' + (err.response?.data?.error || err.message));
    }
  };

  // ===== 状态样式 =====
  const statusClass = (status?: string) => {
    switch (status) {
      case '正常': return 'status-badge status-ok';
      case '报废': return 'status-badge status-danger';
      case '闲置': return 'status-badge status-idle';
      default: return 'status-badge status-warning';
    }
  };

  // ===== 弹窗样式 =====
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
    <div>
      {/* ===== 工具栏 ===== */}
      <div className="toolbar">
        {isAdmin && (
          <>
            <button className="primary" onClick={() => { setEditDevice(null); setFormData({}); setShowForm(true); }}>＋ 新增设备</button>
            <button onClick={() => fileRef.current?.click()}>导入Excel</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={handleImport} />
            <button className="btn-outline-primary" onClick={openRecords}>📋 采购/报废记录</button>
          </>
        )}
        <button onClick={handleExport}>导出Excel</button>
        {/* 搜索框 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <input
            className="toolbar-search"
            placeholder="搜索编号/名称/类别/型号/位置/产线"
            value={search}
            onChange={e => { handleSearchChange(e.target.value); }}
            onKeyDown={e => { if (e.key === 'Enter') load(); }}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="primary" style={{ minWidth: 56, padding: '8px 12px' }} onClick={() => load()}>搜索</button>
        </div>
      </div>

      {/* ===== 主表格 ===== */}
      <div className="card">
        <table>
          <thead><tr>
            <th>设备编号</th><th>设备名称</th><th>类别</th><th>型号</th>
            <th>位置</th><th>产线</th><th>责任人</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            {devices.map(d => {
              const isScrapped = d.status === '报废';
              return (
                <tr key={d.id} style={isScrapped ? { opacity: 0.5 } : undefined}>
                  <td data-label="设备编号" className="monospace">{d.device_no || '-'}</td>
                  <td data-label="设备名称">{d.name}</td>
                  <td data-label="类别">{d.category || '-'}</td>
                  <td data-label="型号">{d.model || '-'}</td>
                  <td data-label="位置">{d.location || '-'}</td>
                  <td data-label="产线">{d.production_line || '-'}</td>
                  <td data-label="责任人">{d.responsible_person || '-'}</td>
                  <td data-label="状态"><span className={statusClass(d.status)}>{d.status}</span></td>
                  <td>
                    {isScrapped ? (
                      isAdmin && (
                        <button className="btn-sm" style={{ color: '#52c41a', borderColor: '#52c41a' }} onClick={() => handleRestore(d)}>启用</button>
                      )
                    ) : isAdmin ? (
                      <>
                        <button className="btn-sm" onClick={() => { setEditDevice(d); setShowForm(true); }}>编辑</button>
                        {isSuperAdmin && <button className="danger btn-sm" onClick={() => setDeleteTarget(d)}>删除</button>}
                        <button className="btn-sm" style={{ color: '#ff4d4f', borderColor: '#ff4d4f' }} onClick={() => openScrap(d)}>报废</button>
                      </>
                    ) : (
                      <span style={{ color: '#52c41a', fontSize: 12 }}>正常</span>
                    )}
                  </td>
                </tr>
              );
            })}
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
              paginateData(allDevices, newPage);
            }}
          >上一页</button>
          <span className="pagination-current">{currentPage} / {Math.ceil(totalCount / PAGE_SIZE)}</span>
          <button
            className="pagination-btn"
            disabled={currentPage === Math.ceil(totalCount / PAGE_SIZE)}
            onClick={() => {
              const newPage = currentPage + 1;
              setCurrentPage(newPage);
              paginateData(allDevices, newPage);
            }}
          >下一页</button>
        </div>
      )}

      {/* ===== 新增/编辑弹窗 ===== */}
      {showForm && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <h3>{editDevice ? '编辑设备' : '新增设备'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div><label>设备编号 *</label><input name="device_no" value={formData.device_no || ''} onChange={handleInputChange} required placeholder="如：D-001" /></div>
                <div><label>设备名称 *</label><input name="name" value={formData.name || ''} onChange={handleInputChange} required /></div>
                <div><label>设备类别 *</label><input name="category" value={formData.category || ''} onChange={handleInputChange} required placeholder="如：提升机" /></div>
                <div><label>型号规格</label><input name="model" value={formData.model || ''} onChange={handleInputChange} /></div>
                <div><label>安装位置</label><input name="location" value={formData.location || ''} onChange={handleInputChange} placeholder="如：产线A工位1" /></div>
                <div><label>所属产线</label><input name="production_line" value={formData.production_line || ''} onChange={handleInputChange} placeholder="如：A线" /></div>
                <div><label>供应商</label><input name="supplier" value={formData.supplier || ''} onChange={handleInputChange} /></div>
                <div><label>安装日期</label><input name="install_date" type="date" value={formData.install_date || ''} onChange={handleInputChange} /></div>
                <div><label>保养周期(天)</label><input name="maintenance_cycle_days" type="number" min="0" value={formData.maintenance_cycle_days ?? 30} onChange={handleInputChange} /></div>
                <div><label>责任人</label><input name="responsible_person" value={formData.responsible_person || ''} onChange={handleInputChange} /></div>
                <div><label>状态</label>
                  <select name="status" value={formData.status || '正常'} onChange={handleInputChange}>
                    <option>正常</option><option>维修中</option><option>闲置</option><option>停用</option>
                  </select>
                </div>
                <div style={{gridColumn:'1/-1'}}><label>备注</label><input name="remarks" value={formData.remarks || ''} onChange={handleInputChange} /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => { setShowForm(false); setEditDevice(null); }}>取消</button>
                <button type="submit" className="primary">保存</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 删除确认 ===== */}
      <DeleteConfirmModal
        visible={!!deleteTarget}
        itemName={deleteTarget?.name}
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget?.id) return;
          setDeleting(true);
          try {
            await deviceApi.delete(String(deleteTarget.id));
            setDeleteTarget(null);
            load(currentPage); // 保持在当前页
          } catch (err: any) {
            alert('删除失败：' + (err.response?.data?.error || err.message));
            setDeleteTarget(null);
          } finally { setDeleting(false); }
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ===== 报废弹窗 ===== */}
      {scrapTarget && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3 style={{ marginTop: 0 }}>设备报废</h3>
            <p style={{ margin: '4px 0 16px', color: '#555', fontSize: 13 }}>
              {scrapTarget.name}{scrapTarget.device_no ? `（${scrapTarget.device_no}）` : ''}&nbsp;&nbsp;
              当前状态：<strong style={{ color: scrapTarget.status === '正常' ? '#52c41a' : '#faad14' }}>{scrapTarget.status}</strong>
            </p>
            <form onSubmit={submitScrap}>
              <div style={fieldStyle}>
                <label style={labelStyle}>报废日期 *</label>
                <input style={inputStyle} name="scrap_date" type="date"
                  value={scrapForm.scrap_date} onChange={handleScrapChange} required />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>报废原因 *</label>
                <textarea name="scrap_reason" value={scrapForm.scrap_reason}
                  onChange={handleScrapChange as any} required rows={3}
                  placeholder="请描述报废原因"
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>报废人 *</label>
                <input style={inputStyle} name="scrap_person" value={scrapForm.scrap_person}
                  onChange={handleScrapChange} required placeholder="请输入报废人姓名" />
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setScrapTarget(null)}>取消</button>
                <button type="submit" className="danger" disabled={scrapping}>
                  {scrapping ? '提交中...' : '确认报废'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 采购/报废记录弹窗 ===== */}
      {showRecords && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 900, width: '92vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>采购 / 报废记录</h3>
              <button type="button" onClick={() => setShowRecords(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={recordsFilter} onChange={e => setRecordsFilter(e.target.value)}
                style={{ ...inputStyle, width: 120 }}>
                <option>全部</option><option>采购</option><option>报废</option>
              </select>
              <input placeholder="搜索设备名称/操作人/原因" value={recordsKeyword}
                onChange={e => setRecordsKeyword(e.target.value)}
                style={{ ...inputStyle, width: 200 }} />
              <button className="primary" onClick={loadRecords} style={{ padding: '7px 16px' }}>查询</button>
              <button onClick={() => { setRecordsFilter('全部'); setRecordsKeyword(''); loadRecords(); }} style={{ padding: '7px 16px' }}>重置</button>
            </div>
            {recordsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>设备名称</th><th>变更类型</th>
                      <th>变更日期</th><th>操作人</th><th>原因</th><th>备注</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.length === 0 ? (
                      <tr><td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 24 }}>暂无记录</td></tr>
                    ) : records.map(r => (
                      <tr key={r.id}>
                        <td>{r.device_name}</td>
                        <td>
                          <span className={r.change_type === '采购' ? 'status-badge status-ok' : 'status-badge status-danger'}>
                            {r.change_type}
                          </span>
                        </td>
                        <td>{r.change_date}</td>
                        <td>{r.operator || '-'}</td>
                        <td>{r.reason || '-'}</td>
                        <td>{r.remarks || '-'}</td>
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
    </div>
  );
}
