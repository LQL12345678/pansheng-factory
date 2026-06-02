const fs = require('fs');
const path = require('path');

const content = `import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { repairApi } from '../services/api';
import { Repair } from '../types';
import { useAuth } from '../hooks/useAuth';
import DeleteConfirmWithPassword from '../components/DeleteConfirmWithPassword';

const gridStyle = { gridColumn: '1/-1' } as React.CSSProperties;

function RepairList() {
  const { isSuperAdmin } = useAuth();
  const [list, setList] = useState<Repair[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Repair | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<Repair>>({});
  const [deleteTarget, setDeleteTarget] = useState<Repair | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => repairApi.list().then((r: any) => setList(r.data || r));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (editItem) {
      setFormData({ ...editItem });
    } else {
      setFormData({
        report_date: new Date().toISOString().slice(0, 10),
        status: '待处理'
      });
    }
  }, [editItem]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: any = { ...formData };
      data.device_id = Number(data.device_id);
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
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
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
      alert(\`导入完成！成功: \${imported}，跳过: \${skipped}\`);
      load();
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
    const a = document.createElement('a');
    a.href = url;
    a.download = '维修工单导出.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatWorkOrder = (no: string) => no?.replace('MIG-', '') || '';

  return (
    <div>
      <div className="toolbar">
        <button className="primary" onClick={() => { setEditItem(null); setFormData({ report_date: new Date().toISOString().slice(0, 10), status: '待处理' }); setShowForm(true); }}>
          ＋ 新增工单
        </button>
        <button onClick={() => fileRef.current?.click()}>导入Excel</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImport} />
        <button onClick={handleExport}>导出Excel</button>
      </div>
      <div className="card card-sm">
        <table className="table-compact">
          <thead><tr>
            <th className="th-wo">工单号</th>
            <th className="th-device">设备</th>
            <th className="th-line">线体</th>
            <th className="th-area">区域</th>
            <th className="th-fault">故障描述</th>
            <th className="th-solution">处理方式</th>
            <th className="th-repairman">维修人</th>
            <th className="th-date">日期</th>
            <th className="th-stop">停线</th>
            <th className="th-status">状态</th>
            <th className="th-action">操作</th>
          </tr></thead>
          <tbody>
            {list.map(d => <tr key={d.id} className="tr-detail">
              <td className="td-wo">{formatWorkOrder(d.work_order_no || '')}</td>
              <td className="td-device">{d.device_name}</td>
              <td className="td-line">{d.line ? \`线\${d.line}\` : '-'}</td>
              <td className="td-area">{d.area || '-'}</td>
              <td className="td-fault">
                <div className="fault-desc">{d.fault_desc || '-'}</div>
                {d.fault_cause && <div className="fault-cause">原因：{d.fault_cause}</div>}
              </td>
              <td className="td-solution">{d.solution || '-'}</td>
              <td className="td-repairman">{d.repairman || '-'}</td>
              <td className="td-date">{d.report_date?.slice(5) || ''}</td>
              <td className="td-stop">{d.stop_duration_minutes ? \`\${d.stop_duration_minutes}分\` : '-'}</td>
              <td className="td-status">
                <span className={\`status-badge \${d.status === '已完成' ? 'status-ok' : d.status === '处理中' ? 'status-warning' : ''}\`}>{d.status}</span>
              </td>
              <td className="td-action">
                <button className="btn-sm" onClick={() => { setEditItem(d); setShowForm(true); }}>编辑</button>
                {isSuperAdmin && <button className="danger btn-sm" onClick={() => setDeleteTarget(d)}>删除</button>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editItem ? '编辑工单' : '新增工单'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div><label>设备ID*</label><input name="device_id" type="number" value={formData.device_id || ''} onChange={handleInputChange} required /></div>
                <div><label>线体</label><input name="line" value={formData.line || ''} onChange={handleInputChange} /></div>
                <div><label>提报人</label><input name="reporter" value={formData.reporter || ''} onChange={handleInputChange} /></div>
                <div><label>异常区域</label><input name="area" value={formData.area || ''} onChange={handleInputChange} /></div>
                <div><label>报修日期*</label><input name="report_date" type="date" value={formData.report_date || ''} onChange={handleInputChange} required /></div>
                <div style={gridStyle}><label>故障描述*</label><input name="fault_desc" value={formData.fault_desc || ''} onChange={handleInputChange} required /></div>
                <div><label>维修人*</label><input name="repairman" value={formData.repairman || ''} onChange={handleInputChange} required /></div>
                <div><label>状态</label>
                  <select name="status" value={formData.status || '待处理'} onChange={handleInputChange}>
                    <option>待处理</option><option>处理中</option><option>已完成</option><option>挂起</option>
                  </select>
                </div>
                <div><label>故障类型</label><input name="fault_type" value={formData.fault_type || ''} onChange={handleInputChange} /></div>
                <div><label>故障原因</label><input name="fault_cause" value={formData.fault_cause || ''} onChange={handleInputChange} /></div>
                <div><label>处理方式</label><input name="solution" value={formData.solution || ''} onChange={handleInputChange} /></div>
                <div><label>用时(分钟)</label><input name="duration_minutes" type="number" value={formData.duration_minutes ?? ''} onChange={handleInputChange} /></div>
                <div><label>停线时长(分钟)</label><input name="stop_duration_minutes" type="number" value={formData.stop_duration_minutes ?? ''} onChange={handleInputChange} /></div>
                <div style={gridStyle}><label>备注</label><input name="remarks" value={formData.remarks || ''} onChange={handleInputChange} /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => { setShowForm(false); setEditItem(null); }}>取消</button>
                <button type="submit" className="primary">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <DeleteConfirmWithPassword
        visible={!!deleteTarget}
        message="确定要删除这条工单吗？此操作不可撤销。"
        loading={deleting}
        onConfirm={async () => {
          if (!deleteTarget?.id) return;
          setDeleting(true);
          try {
            await repairApi.delete(String(deleteTarget.id));
            setDeleteTarget(null);
            load();
          } catch (err) {
            alert('删除失败');
            setDeleteTarget(null);
          } finally { setDeleting(false); }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
export default RepairList;
`;

fs.writeFileSync(path.join(__dirname, 'RepairList.tsx'), content);
console.log('文件生成成功');
