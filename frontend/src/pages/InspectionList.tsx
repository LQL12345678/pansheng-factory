import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { inspectionApi } from '../services/api';
import { Html5Qrcode } from 'html5-qrcode';

interface InspectionItem {
  id: number;
  category: string;
  name: string;
  box_number: string;
  responsible_person: string;
  qr_token: string;
  sort_order: number;
}

interface DayStatus {
  date: string;
  status: string;
  remark: string;
  inspector: string;
  light: 'green' | 'yellow' | 'red' | 'gray';
}

interface ItemWithDays extends InspectionItem {
  days: DayStatus[];
}

interface WeekViewData {
  week_start: string;
  week_end: string;
  week_dates: string[];
  groups: Record<string, ItemWithDays[]>;
  items: ItemWithDays[];
}

interface TodayStats {
  date: string;
  total: number;
  checked: number;
  missed: number;
  normal: number;
  abnormal: number;
  rate: number;
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
}

export default function InspectionList() {
  const { user, isAdmin } = useAuth();

  const [data, setData] = useState<WeekViewData | null>(null);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const isFirstLoad = useRef(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [editItem, setEditItem] = useState<InspectionItem | null>(null);
  const [qrItem, setQrItem] = useState<InspectionItem | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [showScan, setShowScan] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const [formData, setFormData] = useState({
    category: '3楼电箱开关',
    name: '',
    box_number: '',
    responsible_person: '',
  });

  const fetchData = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const today = new Date();
      const monday = getWeekMonday(today);
      monday.setDate(monday.getDate() + weekOffset * 7);
      const dateStr = formatDate(monday);

      const [res1, res2] = await Promise.all([
        inspectionApi.weekView(dateStr),
        inspectionApi.todayStats(),
      ]);
      setData(res1.data);
      setStats(res2.data);
    } catch (e) {
      console.error('获取点检数据失败:', e);
    } finally {
      if (isFirstLoad.current) {
        setLoading(false);
        isFirstLoad.current = false;
      }
    }
  }, [weekOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 移动端检测
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 刷新（每隔30秒自动刷新）
  useEffect(() => {
    const timer = setInterval(fetchData, 30000);
    return () => clearInterval(timer);
  }, [fetchData]);

  function prevWeek() { setWeekOffset(o => o - 1); }
  function nextWeek() { setWeekOffset(o => o + 1); }
  function goThisWeek() { setWeekOffset(0); }

  function getLightEmoji(light: string): string {
    switch (light) {
      case 'green': return '🟢';
      case 'yellow': return '🟡';
      case 'red': return '🔴';
      default: return '⚪';
    }
  }

  function getLightColor(light: string): string {
    switch (light) {
      case 'green': return '#52c41a';
      case 'yellow': return '#faad14';
      case 'red': return '#ff4d4f';
      default: return '#444';
    }
  }

  // ===== 导出 CSV =====
  function exportCSV() {
    if (!data) return;
    const BOM = '\uFEFF';
    let csv = BOM + '点检项,电箱编号,';
    WEEKDAY_LABELS.forEach((d, i) => {
      csv += `${d}(${formatDateShort(data.week_dates[i])}),${d}状态,${d}点检人,`;
    });
    csv += '\n';

    for (const item of data.items) {
      csv += `${item.name},${item.box_number},`;
      for (const day of item.days) {
        csv += `${getLightEmoji(day.light)},${day.status || '-'},${day.inspector || '-'},`;
      }
      csv += '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `值班巡查_${data.week_start}_${data.week_end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== 二维码弹窗 =====
  async function showQR(item: InspectionItem) {
    setQrItem(item);
    try {
      const res = await inspectionApi.qrUrl(item.qr_token);
      setQrUrl(res.data.check_in_url);
    } catch {
      // fallback: construct URL locally
      setQrUrl(`${window.location.origin}/inspections/check-in?token=${item.qr_token}`);
    }
    setShowQrModal(true);
  }

  // ===== 新增/编辑 =====
  function openAddModal() { setEditItem(null); setFormData({ category: '3楼电箱开关', name: '', box_number: '', responsible_person: '' }); setShowAddModal(true); }
  function openEditModal(item: InspectionItem) { setEditItem(item); setFormData({ category: item.category, name: item.name, box_number: item.box_number, responsible_person: item.responsible_person }); setShowAddModal(true); }

  async function handleSave() {
    if (!formData.name.trim()) return alert('请填写点检项名称');
    try {
      if (editItem) {
        await inspectionApi.update(editItem.id, formData);
      } else {
        await inspectionApi.create(formData);
      }
      setShowAddModal(false);
      fetchData();
    } catch (e: any) {
      alert(e.response?.data?.error || '保存失败');
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('确定删除该点检项？关联的点检记录也会被删除。')) return;
    try {
      await inspectionApi.delete(id);
      fetchData();
    } catch (e: any) {
      alert(e.response?.data?.error || '删除失败');
    }
  }

  // ===== 连续扫码打卡（微信扫一扫体验，需 HTTPS）=====
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanningLock = useRef(false);
  const lastToken = useRef('');
  const audioCtx = useRef<AudioContext | null>(null);

  function playBeep() {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      // 双音叮咚效果（1秒）
      const now = ctx.currentTime;
      o.frequency.setValueAtTime(880, now);
      o.frequency.setValueAtTime(1100, now + 0.3);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 1);
      o.start(now); o.stop(now + 1);
    } catch { /* 静默忽略 */ }
  }

  function startScan() {
    setShowScan(true);
    setScanMsg('正在启动摄像头...');
    scanningLock.current = false;
    lastToken.current = '';
  }

  useEffect(() => {
    if (!showScan) return;
    const timer = setTimeout(async () => {
      const el = document.getElementById('scan-reader');
      if (!el) return;
      el.innerHTML = '';

      let cameraId: string | undefined;
      let useFileMode = false;
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras.length === 0) {
          setScanMsg('未检测到摄像头，使用拍照扫描');
          useFileMode = true;
        } else {
          const back = cameras.find(c => c.label.toLowerCase().includes('back') || c.label.includes('后置'));
          cameraId = back ? back.id : cameras[0].id;
        }
      } catch {
        setScanMsg('摄像头权限受限，使用拍照扫描');
        useFileMode = true;
      }

      const scanner = new Html5Qrcode('scan-reader');
      scannerRef.current = scanner;

      if (useFileMode) {
        setScanMsg('请点击下方按钮选择二维码图片...');
        return;
      }

      setScanMsg('请对准二维码...');

      scanner.start(
        cameraId!,
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // 防止重复扫描同一个码
          if (scanningLock.current) return;
          const token = extractToken(decodedText);
          if (!token || token === lastToken.current) return;
          scanningLock.current = true;
          lastToken.current = token;
          doCheckIn(token);
        },
        () => {}
      ).catch(() => {
        setScanMsg('摄像头启动失败，请确认已授权相机权限');
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [showScan]);

  function stopScan() {
    scannerRef.current = null;
    setShowScan(false);
    setScanMsg('');
  }

  function scanFromFile() {
    const input = document.getElementById('scan-file-input') as HTMLInputElement;
    if (input) input.click();
  }

  async function handleFileScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;
    try {
      setScanMsg('正在识别...');
      const decodedText = await scannerRef.current.scanFile(file, true);
      const token = extractToken(decodedText);
      if (token && token !== lastToken.current) {
        lastToken.current = token;
        doCheckIn(token);
      } else {
        setScanMsg('未识别到有效二维码');
      }
    } catch {
      setScanMsg('识别失败，请重试');
    }
  }

  function extractToken(text: string): string | null {
    // 尝试从 URL 中提取 token 参数
    try {
      const url = new URL(text);
      return url.searchParams.get('token');
    } catch {
      // 可能是纯 token 或其他格式
      const m = text.match(/token=([a-f0-9]+)/i);
      return m ? m[1] : null;
    }
  }

  async function doCheckIn(token: string) {
    setScanMsg('打卡中...');
    try {
      await inspectionApi.checkIn({ qr_token: token, status: '正常', remark: '' });
      setScanMsg('✅ 打卡成功！继续扫描下一个...');
      playBeep();
      fetchData();
    } catch (e: any) {
      setScanMsg('❌ ' + (e.response?.data?.error || '打卡失败'));
    }
    // 1.2 秒后恢复扫描状态
    setTimeout(() => {
      scanningLock.current = false;
      setScanMsg('请对准二维码...');
    }, 1200);
  }

  // ===== 未登录 =====
  if (!user) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>请先登录</div>;
  }

  const categories = data ? Object.keys(data.groups) : [];

  return (
    <div style={{ padding: isMobile ? '4px 0' : '8px 12px', maxWidth: 1400, margin: '0 auto' }}>
      {/* 头部 */}
      <div style={{ marginBottom: isMobile ? 2 : 6 }}>
        {/* 移动端：标题+统计一行；桌面端：保持原布局 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: isMobile ? 4 : 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 14 : 17, color: '#e0e0e0', whiteSpace: 'nowrap' }}>📋 值班巡查</h2>
            {stats && (
              <span style={{ fontSize: isMobile ? 10 : 12, color: '#888', whiteSpace: 'nowrap' }}>
                今日: {stats.checked}/{stats.total}
                <span style={{ color: '#52c41a', marginLeft: 4 }}>🟢{stats.normal}</span>
                <span style={{ color: '#faad14', marginLeft: 2 }}>🟡{stats.abnormal}</span>
                {stats.missed > 0 && <span style={{ color: '#ff4d4f', marginLeft: 2 }}>🔴{stats.missed}</span>}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 2 : 4, alignItems: 'center' }}>
            <button onClick={goThisWeek} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11 }}>本周</button>
            <button onClick={prevWeek} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11 }}>◀</button>
            <button onClick={nextWeek} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11 }}>▶</button>
            <button onClick={fetchData} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11 }}>🔄</button>
            <button onClick={exportCSV} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11 }}>📥</button>
            <button onClick={startScan} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11, background: '#00d4ff', color: '#000' }}>📷</button>
            {isAdmin && (
              <button onClick={openAddModal} className="btn" style={{ padding: isMobile ? '1px 4px' : '2px 8px', fontSize: isMobile ? 10 : 11, background: '#00d4ff', color: '#000' }}>+</button>
            )}
          </div>
        </div>
      </div>

      {/* 图例 */}
      {!isMobile && <div style={{ marginBottom: 4, display: 'flex', gap: 12, fontSize: 11, color: '#888' }}>
        <span>🟢 已点检正常</span>
        <span>🟡 已点检异常</span>
        <span>🔴 漏检/未点检</span>
        <span>⚪ 尚未开始</span>
      </div>}

      {/* 表格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>加载中...</div>
      ) : data ? (
        <div style={{ overflowX: 'auto', borderRadius: isMobile ? 0 : 10, border: '1px solid #1a2a4a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 9 : 12, minWidth: isMobile ? 340 : 1000 }}>
            <thead>
              <tr style={{ background: '#0d1b33' }}>
                <th style={{ padding: isMobile ? '1px 3px' : '4px 8px', textAlign: 'left', borderBottom: '1px solid #1a2a4a', whiteSpace: 'nowrap', color: '#aaa', minWidth: isMobile ? 85 : 130, fontSize: isMobile ? 9 : 12, position: 'sticky', left: 0, zIndex: 2, background: '#0d1b33' }}>点检项</th>
                {!isMobile && <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid #1a2a4a', whiteSpace: 'nowrap', color: '#aaa', minWidth: 70, fontSize: 12 }}>电箱编号</th>}
                {data.week_dates.map((d, i) => (
                  <th key={d} style={{
                    padding: isMobile ? '1px 0' : '3px 4px', textAlign: 'center', borderBottom: '1px solid #1a2a4a',
                    color: d === formatDate(new Date()) ? '#00d4ff' : '#aaa',
                    fontWeight: d === formatDate(new Date()) ? 700 : 400,
                    minWidth: isMobile ? 36 : 55
                  }}>
                    <div style={{ fontSize: isMobile ? 8 : 10 }}>{WEEKDAY_LABELS[i]}</div>
                    <div style={{ fontSize: isMobile ? 7 : 9, opacity: 0.7 }}>{isMobile ? (formatDateShort(d).split('/')[1] + '日') : formatDateShort(d)}</div>
                  </th>
                ))}
                {isAdmin && !isMobile && <th style={{ padding: 4, textAlign: 'center', borderBottom: '1px solid #1a2a4a', color: '#aaa', width: 75, fontSize: 12 }}>操作</th>}
              </tr>
            </thead>
            <tbody>
              {categories.map(cat => {
                const items = data.groups[cat];
                return (
                  <>
                    {/* 分类标题行 */}
                    <tr key={`cat-${cat}`} style={{ background: '#0a1627' }}>
                      <td colSpan={(isMobile ? 1 : 2) + 7 + (isAdmin && !isMobile ? 1 : 0)} style={{
                        padding: isMobile ? '1px 4px' : '3px 8px', color: '#00d4ff', fontWeight: 700, fontSize: isMobile ? 10 : 12,
                        borderBottom: '1px solid #1a2a4a', position: 'sticky', left: 0, zIndex: 1, background: '#0a1627'
                      }}>
                        📁 {cat} ({items.length}项)
                      </td>
                    </tr>
                    {items.map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #111d33' }}>
                        <td style={{ padding: isMobile ? '1px 3px' : '3px 8px', color: '#e0e0e0', fontSize: isMobile ? 9 : 12, position: 'sticky', left: 0, zIndex: 1, background: '#0d1b33' }}>{item.name}</td>
                        {!isMobile && <td style={{ padding: '3px 8px', color: '#999', fontSize: 11, fontFamily: 'monospace' }}>{item.box_number || '-'}</td>}
                        {item.days.map(day => (
                          <td key={day.date} style={{ padding: isMobile ? '0px 0px' : '1px 4px', textAlign: 'center' }}>
                            <div style={{ fontSize: isMobile ? 12 : 14 }}>{getLightEmoji(day.light)}</div>
                            <div style={{ fontSize: isMobile ? 7 : 9, color: getLightColor(day.light), marginTop: 0 }}>
                              {day.status === '未开始' ? '-' : day.status}
                            </div>
                            {!isMobile && day.inspector && (
                              <div style={{ fontSize: 8, color: '#666', marginTop: 0 }}>{day.inspector}</div>
                            )}
                          </td>
                        ))}
                        {isAdmin && !isMobile && (
                          <td style={{ padding: isMobile ? '1px 2px' : '2px 3px', textAlign: 'center' }}>
                            <button onClick={() => showQR(item)} className="btn btn-action" style={{ fontSize: isMobile ? 9 : 10, marginRight: isMobile ? 1 : 2, padding: '1px 2px' }} title="查看二维码">📱</button>
                            <button onClick={() => openEditModal(item)} className="btn btn-action" style={{ fontSize: isMobile ? 9 : 10, marginRight: isMobile ? 1 : 2, padding: '1px 2px' }} title="编辑">✏️</button>
                            <button onClick={() => handleDelete(item.id)} className="btn btn-action" style={{ fontSize: isMobile ? 9 : 10, color: '#ff4d4f', padding: '1px 2px' }} title="删除">🗑</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>暂无数据</div>
      )}

      {/* ===== 新增/编辑弹窗 ===== */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{editItem ? '编辑点检项' : '新增点检项'}</h3>
              <button onClick={() => setShowAddModal(false)} className="btn-close">✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>分类</label>
                <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                  <option value="对讲机">对讲机</option>
                  <option value="3楼电箱开关">3楼电箱开关</option>
                  <option value="1楼电箱">1楼电箱</option>
                  <option value="门窗">门窗</option>
                </select>
              </div>
              <div className="form-group">
                <label>点检内容</label>
                <input value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="如：A线体电源" />
              </div>
              <div className="form-group">
                <label>电箱编号</label>
                <input value={formData.box_number} onChange={e => setFormData({ ...formData, box_number: e.target.value })} placeholder="如：A-01（选填）" />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)} className="btn">取消</button>
              <button onClick={handleSave} className="btn" style={{ background: '#00d4ff', color: '#000' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 二维码弹窗 ===== */}
      {showQrModal && qrItem && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, textAlign: 'center' }}>
            <div className="modal-header">
              <h3>点检二维码</h3>
              <button onClick={() => setShowQrModal(false)} className="btn-close">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#e0e0e0', marginBottom: 8 }}>{qrItem.category} - {qrItem.name}</p>
              {/* 使用 QR API 生成二维码图片 */}
              <div style={{ background: '#fff', padding: 16, borderRadius: 8, display: 'inline-block', marginBottom: 12 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                  alt="点检二维码"
                  style={{ width: 200, height: 200 }}
                />
              </div>
              <p style={{ fontSize: 11, color: '#666', wordBreak: 'break-all', marginBottom: 8 }}>{qrUrl}</p>
              <button onClick={() => window.open(qrUrl, '_blank')} className="btn" style={{ fontSize: 12 }}>🔗 打开打卡页面</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 实时扫码打卡弹窗（Portal 到 body，确保居中）===== */}
      {showScan && createPortal(
        <div className="modal-overlay" onClick={stopScan} style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380, minWidth: 300, textAlign: 'center', position: 'relative', margin: 0 }}>
            <div className="modal-header">
              <h3>📷 扫码打卡</h3>
              <button onClick={stopScan} className="btn-close">✕</button>
            </div>
            <div className="modal-body" style={{ padding: '8px 8px 16px' }}>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>对准二维码自动打卡 · 连续扫描中 · 点遮罩关闭</p>
              <div id="scan-reader" style={{ width: '100%', maxWidth: 320, margin: '0 auto', minHeight: 240, borderRadius: 8, overflow: 'hidden' }} />
              <input type="file" id="scan-file-input" accept="image/*" style={{ display: 'none' }} onChange={handleFileScan} />
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button onClick={scanFromFile} style={{ padding: '6px 14px', borderRadius: 6, border: '1px dashed rgba(0,212,255,0.4)', background: 'transparent', color: '#00d4ff', fontSize: 12, cursor: 'pointer' }}>
                  📷 拍照选图扫码
                </button>
              </div>
              {scanMsg && (
                <p style={{
                  marginTop: 10, fontSize: 14, fontWeight: 600,
                  color: scanMsg.includes('✅') ? '#52c41a' : scanMsg.includes('❌') || scanMsg.includes('失败') ? '#ff4d4f' : '#00d4ff'
                }}>{scanMsg}</p>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}
