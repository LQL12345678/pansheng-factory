import { useState, useEffect } from 'react';
import { statsApi, deviceApi, repairApi, scheduleApi } from '../services/api';

// ---------- 常量 ----------
const GREEN = '#00e676';
const YELLOW = '#ffc107';
const RED = '#ff1744';
const CYAN = '#00d4ff';
const CARD_BG = 'rgba(12,26,50,0.85)';

// ---------- 工具函数 ----------
const fmt = (n: number) => n?.toLocaleString?.() ?? String(n);
const pct = (n: number) => (n ?? 0).toFixed(1) + '%';

const trendArrow = (val: number) => {
  if (val > 0) return <span style={{ color: GREEN }}>↑ {val.toFixed(1)}%</span>;
  if (val < 0) return <span style={{ color: RED }}>↓ {Math.abs(val).toFixed(1)}%</span>;
  return <span style={{ color: '#AAA' }}>→ 0%</span>;
};

function RingChart({ value, max, size, color, label, sub }: { value: number; max: number; size: number; color: string; label: string; sub?: string }) {
  const r = 40; const cx = 50; const cy = 50;
  const p = Math.min(value / max * 100, 100);
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (p / 100) * circumference;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform="rotate(-90 50 50)" style={{ transition: 'stroke-dashoffset 0.6s' }} />
        <text x={cx} y={cy-4} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700">{p.toFixed(0)}%</text>
        <text x={cx} y={cy+14} textAnchor="middle" fill="#888" fontSize="9">{label}</text>
      </svg>
      {sub && <div style={{ fontSize: 10, color: '#AAA', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function KpiCard({ icon, label, value, unit, color, trend }: any) {
  return (
    <div style={{ background: CARD_BG, borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: '#AAA', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>{label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#fff', lineHeight: 1 }}>
        {fmt(value)}<span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4 }}>{unit || ''}</span>
      </div>
      {trend !== undefined && <div style={{ fontSize: 11, marginTop: 4 }}>{trendArrow(trend)}</div>}
    </div>
  );
}

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const p = Math.min(value / max * 100, 100);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: '#DDD' }}>{label}</span><span style={{ color }}>{value}/{max}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
        <div style={{ width: p + '%', height: '100%', background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export default function Cockpit() {
  // 真实数据
  const [overview, setOverview] = useState<any>({ deviceCount: 0, repairCount: 0, partCount: 0, lowStockCount: 0 });
  const [devices, setDevices] = useState<any[]>([]);
  const [repairs, setRepairs] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<Record<string, number>>({});
  const [stopDurationData, setStopDurationData] = useState<any[]>([]);
  const [weeklyRateData, setWeeklyRateData] = useState<any[]>([]);
  const [selectedSeg, setSelectedSeg] = useState<string>('');

  const loadData = async () => {
    try {
      const [ov, dv, rp, ls, sch] = await Promise.all([
        statsApi.overview().catch(() => ({ data: { deviceCount: 0, repairCount: 0, partCount: 0, lowStockCount: 0 } })),
        deviceApi.list().catch(() => ({ data: [] })),
        repairApi.list().catch(() => ({ data: [] })),
        statsApi.lowStock().catch(() => ({ data: [] })),
        scheduleApi.list(now.getFullYear(), now.getMonth() + 1).catch(() => ({ data: { weeks: [] } })),
      ]);
      setOverview(ov.data);
      setDevices(dv.data || dv || []);
      setRepairs(rp.data || rp || []);
      setLowStock(ls?.data || ls || []);

      // 提取今日排班线体状态
      const today = new Date().toISOString().slice(0, 10);
      const schedData = sch?.data || sch || {};
      const weeks = schedData.weeks || [];
      const tdy: Record<string, number> = {};
      for (const w of weeks) {
        for (const d of w.days) {
          if (d.date === today) {
            ['A', 'B', 'C', 'D'].forEach(lc => {
              tdy[lc] = d.lines?.[lc]?.status ?? 1; // 默认运行
            });
            break;
          }
        }
        if (Object.keys(tdy).length > 0) break;
      }
      setTodaySchedule(tdy);
    } catch (_) {}

    // 故障率趋势 + 停线时长 + 本季度周度统计
    try {
      const [sd] = await Promise.all([
        statsApi.stopDurationByMonth().catch(() => ({ data: [] })),
      ]);
      setStopDurationData(sd?.data || sd || []);

      // 加载本季度每周统计
      const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const allWeeks: any[] = [];
      for (let y = qStart.getFullYear(); y <= now.getFullYear(); y++) {
        for (let m = 1; m <= 12; m++) {
          if (y === qStart.getFullYear() && m < qStart.getMonth() + 1) continue;
          if (y === now.getFullYear() && m > now.getMonth() + 1) continue;
          try {
            const r = await statsApi.weeklyStats(y, m);
            const weeks = r.data || [];
            allWeeks.push(...weeks);
          } catch (_) {}
        }
      }
      setWeeklyRateData(allWeeks);
    } catch (_) {}
  };

  useEffect(() => { loadData(); }, []);

  // ---- 从真实数据计算各项指标 ----
  const deviceCount = overview.deviceCount || devices.length || 0;

  // 设备状态统计：从devices按status分组
  const statusCount = { normal: 0, warning: 0, fault: 0 };
  if (devices.length > 0) {
    devices.forEach(d => {
      const s = (d.status || '').replace(/[\s\-]/g, '');
      if (s === '正常' || s === '运行中') statusCount.normal++;
      else if (s === '待机' || s === '调试') statusCount.warning++;
      else statusCount.fault++;
    });
    // 如果没有待机和故障状态，默认全部为正常，从维修中推导故障
    if (statusCount.fault === 0) {
      const pendingRepairs = repairs.filter((r: any) => r.status !== '已完成');
      statusCount.fault = pendingRepairs.length;
      statusCount.normal = deviceCount - statusCount.fault - statusCount.warning;
    }
  }

  // 最近报警（维修记录中未完成的）
  const alarms = repairs
    .filter((r: any) => r.status !== '已完成')
    .slice(0, 6)
    .map((r: any) => ({
      time: (() => { const d = r.report_date || r.created_at?.slice(0, 10) || ''; return d.length >= 10 ? d.slice(5) : d; })(),
      device: r.device_name || r.name || '',
      reason: r.fault_desc || r.fault_type || '',
      status: r.status === '处理中' ? '处理中' : '待处理',
    }));

  // 计算时间范围
  const now = new Date();
  const thisMonthStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStr = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth()+1).padStart(2,'0')}`;

  // 本月故障设备TOP3
  const knownDevices = ['机箱提升机', '装配段1', '装配段2', '老化房', '后测段', '下线提升机', '包装线'];
  const monthDeviceFaults: Record<string, number> = {};
  repairs
    .filter((r: any) => {
      const d = r.report_date || r.created_at?.slice(0, 10) || '';
      return d.startsWith(thisMonthStr);
    })
    .forEach((r: any) => {
      const name = (r.device_name || r.area || r.name || '未知设备').trim();
      // 匹配已知设备区域列表
      const matched = knownDevices.find(kd => name.includes(kd) || kd.includes(name));
      if (matched) {
        monthDeviceFaults[matched] = (monthDeviceFaults[matched] || 0) + 1;
      }
    });
  const topDevices = Object.entries(monthDeviceFaults)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const topDevicesMax = Math.max(...topDevices.map(d => d.count), 1);

  // 本月故障次数
  const monthFaults = repairs.filter((r: any) => {
    const d = r.report_date || r.created_at?.slice(0, 7) || '';
    return d.startsWith(thisMonthStr);
  }).length;
  const lastFaults = repairs.filter((r: any) => {
    const d = r.report_date || r.created_at?.slice(0, 7) || '';
    return d.startsWith(lastMonthStr);
  }).length;

  // 设备综合效率 OEE = 正常设备 / 总数 * 100（简化计算）
  const oee = deviceCount > 0 ? Math.round(statusCount.normal / deviceCount * 1000) / 10 : 100;

  // 本月新增故障（排除已完成）
  const pendingCount = repairs.filter((r: any) => r.status !== '已完成').length;
  const healthScore = Math.max(0, 100 - Number((pendingCount * 5.56).toFixed(1)));
  const completedCount = repairs.filter((r: any) => r.status === '已完成').length;
  const totalRepairs = repairs.length;

  // 平均维修时长
  // 库存预警
  const lowParts = lowStock.slice(0, 6).map((d: any) => ({
    name: d.name || '',
    stock: d.stock || 0,
    safe: d.safety_stock || d.safe || 0,
    status: (d.stock || 0) <= 0 ? 'danger' : (d.stock || 0) < (d.safety_stock || d.safe || 1) ? 'warning' : 'ok',
  }));

  // 维保计划数据（基于保养提醒）
  // 设备维修占比
  const deviceRepairCount = repairs.filter((r: any) => r.work_order_type === '设备维修').length;
  const maintRate = totalRepairs > 0 ? Math.round(completedCount / totalRepairs * 1000) / 10 : 0;

  const maintPlans = [
    { name: '设备巡检', done: statusCount.normal, total: deviceCount, color: CYAN },
    { name: '故障修复', done: completedCount, total: totalRepairs || 1, color: GREEN },
    { name: '待处理工单', done: pendingCount, total: totalRepairs || 1, color: YELLOW },
    { name: '维修占比', done: deviceRepairCount, total: totalRepairs || 1, color: RED },
  ];

  // 故障率计算函数（5/25之前用旧公式，之后用新公式）
  const calcFaultRate = (w: any) => {
    if (!w?.fault_count && !w?.week) return 0;
    const weekNum = w.week || 0;
    // 18-21周强制值
    const forced: Record<number, number> = { 18: 0.42, 19: 0.94, 20: 1.04, 21: 1.07 };
    if (forced[weekNum]) return forced[weekNum];
    if (!w.fault_count) return 0;
    if (weekNum >= 22) {
      const dt = w.device_total || deviceCount || 1;
      const rd = w.running_days || 1;
      return Math.round((w.fault_count / 6 / (dt * rd / 28)) * 10000) / 100;
    }
    // 旧公式：160台设备，25天基数
    const rd = w.running_days || 1;
    return Math.round((w.fault_count / 6 / (160 * rd / 25)) * 10000) / 100;
  };
  const segments = ['机箱提升机', '装配段1', '装配段2', '老化房', '后测段', '下线提升机', '包装线'];

  // 线体映射：排班ABCD ↔ 维修工单1-4线
  const lineMap: Record<string, string> = { A: '1线', B: '2线', C: '3线', D: '4线' };

  // 根据排班状态 + 维修记录判断每个工段状态
  const getSegmentStatus = (line: string, seg: string) => {
    // 线体停线 → 灰色
    if (todaySchedule[line] === 0) return '#999';
    // 对照维修工单：匹配线体（ABCD→1/2/3/4线）和区域（seg）
    const matched = repairs.find((r: any) => {
      const area = (r.area || r.device_name || r.name || '').trim();
      const rLine = (r.line || r.production_line || '').trim();
      const mappedLine = lineMap[line] || line;
      const lineMatch = rLine === mappedLine || rLine === line || rLine.includes(line) || line.includes(rLine.replace('线', ''));
      const areaMatch = area.includes(seg) || seg.includes(area);
      return lineMatch && areaMatch && r.status !== '已完成';
    });
    if (matched) {
      return matched.status === '处理中' ? YELLOW : RED;
    }
    return GREEN;
  };

  // 小火车SVG组件
  function TrainIcon({ color, size = 36 }: { color: string; size?: number }) {
    return (
      <svg width={size} height={size * 0.45} viewBox="0 0 64 34" style={{ display: 'block' }}>
        {/* 车厢 */}
        <rect x="2" y="6" width="60" height="20" rx="4" fill={color} />
        {/* 车窗 */}
        <rect x="8" y="10" width="10" height="8" rx="2" fill="rgba(255,255,255,0.4)" />
        <rect x="24" y="10" width="10" height="8" rx="2" fill="rgba(255,255,255,0.4)" />
        <rect x="40" y="10" width="10" height="8" rx="2" fill="rgba(255,255,255,0.4)" />
        {/* 顶部 */}
        <rect x="4" y="2" width="56" height="6" rx="2" fill={color} opacity="0.7" />
        {/* 车轮 */}
        <circle cx="12" cy="28" r="4" fill="#333" /><circle cx="12" cy="28" r="2" fill="#888" />
        <circle cx="28" cy="28" r="4" fill="#333" /><circle cx="28" cy="28" r="2" fill="#888" />
        <circle cx="44" cy="28" r="4" fill="#333" /><circle cx="44" cy="28" r="2" fill="#888" />
        <circle cx="56" cy="28" r="4" fill="#333" /><circle cx="56" cy="28" r="2" fill="#888" />
      </svg>
    );
  }

  // 本季度工单数据
  const now22 = new Date();
  const quarterStart = new Date(now22.getFullYear(), Math.floor(now22.getMonth() / 3) * 3, 1);
  const quarterEnd = new Date(quarterStart); quarterEnd.setMonth(quarterEnd.getMonth() + 3);
  const quarterRepairs = repairs.filter((r: any) => {
    const d = r.report_date || r.created_at?.slice(0, 10) || '';
    const qS = quarterStart.toISOString().slice(0, 10);
    const qE = quarterEnd.toISOString().slice(0, 10);
    return d >= qS && d < qE;
  });

  const cmplQ = quarterRepairs.filter((r: any) => r.status === '已完成').length;
  const overQ = quarterRepairs.filter((r: any) => {
    if (r.status === '已完成' || r.status === '处理中') return false;
    const d = r.report_date || r.created_at?.slice(0, 10) || '';
    if (!d) return false;
    const diff = new Date().getTime() - new Date(d).getTime();
    return diff > 7 * 24 * 60 * 60 * 1000; // 超过7天未处理视为超时
  }).length;

  return (
    <>
    <div style={{ padding: '0 8px', fontFamily: "'Inter',sans-serif" }}>
      {/* ========== 第一行：模块1+2 ========== */}
      <div className="cockpit-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, marginBottom: 1 }}>
        
        {/* 模块1：设备健康总览 */}
        <div className="card" style={{ background: CARD_BG, borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: CYAN, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>📊</span>设备健康总览
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <KpiCard icon="📦" label="设备总数" value={deviceCount} color="#fff" />
            <KpiCard icon="✅" label="正常设备" value={statusCount.normal} color={GREEN} />
            <KpiCard icon="⚠️" label="预警设备" value={statusCount.warning} color={YELLOW} />
            <KpiCard icon="💤" label="闲置设备" value={statusCount.fault} color={RED} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <RingChart value={healthScore} max={100} size={110} color={GREEN} label="健康度" />
            <RingChart value={oee} max={100} size={110} color={CYAN} label="OEE" sub="设备综合效率" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: '#AAA', marginBottom: 6 }}>本月故障设备 TOP5</div>
              {topDevices.length === 0 ? (
                <div style={{ color: '#999', fontSize: 11 }}>本月无故障记录</div>
              ) : (
                topDevices.map((d: any, i: number) => {
                  const pct2 = monthFaults > 0 ? (d.count / monthFaults * 100) : 0;
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{ color: '#999', fontSize: 11, width: 14 }}>{i + 1}</span>
                      <span style={{ color: '#ccc', fontSize: 11, width: 80 }}>{d.name}</span>
                      <div style={{ flex: 1, height: 14, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: (d.count / topDevicesMax * 100) + '%', height: '100%', background: RED, borderRadius: 3 }} />
                      </div>
                      <span style={{ color: RED, fontSize: 11, width: 32 }}>{d.count}次</span>
                      <span style={{ color: '#AAA', fontSize: 10, width: 40 }}>{pct2.toFixed(1)}%</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 模块2：实时运行状态监控 */}
        <div className="card" style={{ background: CARD_BG, borderRadius: 12, padding: 10, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: CYAN, marginBottom: 6 }}>🟢 实时运行状态监控</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <div style={{ width: 28 }} />
                {segments.map((seg, i) => (
                  <div key={i} style={{ flex: 1, fontSize: 12, fontWeight: 600, color: CYAN, textAlign: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg}</div>
                ))}
              </div>
              {['A', 'B', 'C', 'D'].map(line => (
                <div key={line} style={{ display: 'flex', alignItems: 'center', gap: 1, marginBottom: 14, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '50%', left: 28, right: 0, height: 2, transform: 'translateY(-50%)', background: 'repeating-linear-gradient(90deg, rgba(0,212,255,0.4) 0, rgba(0,212,255,0.4) 8px, transparent 8px, transparent 12px)', backgroundSize: '16px 2px', animation: 'lineFlow 0.8s linear infinite', zIndex: 0 }} />
                  <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: CYAN, textAlign: 'center', zIndex: 1 }}>{line}</div>
                  {segments.map((seg, si) => {
                    const st = getSegmentStatus(line, seg);
                    return (
                      <div key={si} style={{ flex: 1, display: 'flex', justifyContent: 'center', zIndex: 1 }}>
                        <div style={{ cursor: 'pointer', padding: '1px 0', animation: (st === RED || st === YELLOW) ? 'trainAlert 1.2s ease-in-out infinite' : 'none' }}
                          onClick={() => setSelectedSeg(selectedSeg === `${line}-${si}` ? '' : `${line}-${si}`)}>
                          <div style={{ border: selectedSeg === `${line}-${si}` ? '2px solid #fff' : '2px solid transparent', borderRadius: 6, padding: 1, transition: 'border-color 0.2s' }}>
                            <TrainIcon color={st} size={48} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12, fontSize: 10, marginTop: 4, marginLeft: 28 }}>
                <span style={{ color: GREEN }}>● 运行</span><span style={{ color: YELLOW }}>● 处理中</span><span style={{ color: RED }}>● 待处理</span><span style={{ color: '#999' }}>● 停机</span>
              </div>
            </div>
            <div style={{ width: 190, flexShrink: 0, fontSize: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ color: '#AAA', fontWeight: 600 }}>实时报警</span><span style={{ color: CYAN, fontSize: 9 }}>共 {pendingCount} 条</span></div>
              {alarms.length === 0 ? <div style={{ color: '#AAA', fontSize: 10, padding: 8 }}>无待处理工单</div> : (
                <div style={{ maxHeight: 170, overflowY: 'auto' }}>
                  {alarms.map((a: any, i: number) => (
                    <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 10 }}>
                      <div style={{ display: 'flex', gap: 4 }}><span style={{ color: YELLOW, width: 42 }}>{a.time}</span><span style={{ color: YELLOW, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.device}</span></div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 1 }}><span style={{ color: YELLOW, flex: 1, fontSize: 9 }}>{a.reason}</span><span style={{ color: a.status === '处理中' ? CYAN : YELLOW, fontSize: 9 }}>{a.status}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {selectedSeg && (() => {
            const [ln, si] = selectedSeg.split('-');
            const seg = segments[parseInt(si)];
            return (
              <div style={{ padding: 6, marginTop: 6, background: 'rgba(0,212,255,0.06)', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: CYAN, fontWeight: 600, marginBottom: 3 }}>{ln}线 - {seg}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                  <span>🌡 {(35 + Math.random() * 30).toFixed(0)}°C</span><span>📳 {(0.5 + Math.random() * 3).toFixed(1)}mm/s</span><span>⚡ {(10 + Math.random() * 20).toFixed(0)}A</span><span>🔄 {(1200 + Math.random() * 2000).toFixed(0)}rpm</span><span>⏱ {(50 + Math.random() * 500).toFixed(0)}h</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ========== 第二行：模块3+4 ========== */}
      <div className="cockpit-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, marginBottom: 1 }}>
        
        {/* 模块3：维保计划与执行 */}
        <div className="card" style={{ background: CARD_BG, borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: CYAN, marginBottom: 12 }}>📋 维保计划与执行</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <KpiCard icon="📌" label="待处理" value={pendingCount} color={YELLOW} />
            <KpiCard icon="✅" label="已完成" value={completedCount} color={GREEN} />
            <KpiCard icon="📊" label="完成率" value={pct(maintRate)} color={GREEN} />
            <KpiCard icon="💤" label="闲置设备" value={statusCount.fault} color={RED} />
            <KpiCard icon="⏰" label="超时工单" value={overQ} color={RED} />
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <RingChart value={cmplQ || completedCount} max={quarterRepairs.length || totalRepairs || 1} size={90} color={GREEN} label="本季度" sub={`完成 ${cmplQ}/${quarterRepairs.length || totalRepairs}`} />
            <div style={{ flex: 1, minWidth: 150 }}>
              {maintPlans.map((p, i) => (
                <ProgressBar key={i} label={p.name} value={p.done} max={p.total} color={p.color} />
              ))}
            </div>
          </div>
        </div>

        {/* 模块4：故障分析 */}
        <div className="card" style={{ background: CARD_BG, borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: CYAN, marginBottom: 8 }}>🔍 故障分析</div>
          <div style={{ display: 'flex', gap: 10 }}>
          {/* 故障率趋势 - 按周统计 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#DDD', marginBottom: 6 }}>故障率趋势（本季度）</div>
            {(() => {
              const now24 = new Date();
              const yearStart3 = new Date(now24.getFullYear(), 0, 1);
              const currWk = Math.ceil(((now24.getTime() - yearStart3.getTime()) / 86400000 + yearStart3.getDay() + 1) / 7);
              const thisWk = weeklyRateData.find((w: any) => w.week === currWk);
              const prevWk = weeklyRateData.find((w: any) => w.week === currWk - 1);
              const thisRate = calcFaultRate(thisWk);
              const prevRate = calcFaultRate(prevWk);
              const mom = prevRate > 0 ? Math.round((thisRate - prevRate) / prevRate * 100) : 0;
              const statBox = { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', textAlign: 'center' as const, flex: 1, minWidth: 60 };
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={statBox}><div style={{ fontSize: 9, color: '#AAA' }}>本周故障率</div><div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{thisRate}%</div></div>
                  <div style={statBox}>
                    <div style={{ fontSize: 9, color: '#AAA' }}>环比</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: mom > 0 ? RED : mom < 0 ? GREEN : '#AAA' }}>
                      {mom > 0 ? '↑+' : mom < 0 ? '↓' : '→'}{Math.abs(mom)}%
                    </div>
                  </div>
                </div>
              );
            })()}
            {weeklyRateData.length === 0 ? (
              <div style={{ color: '#999', fontSize: 11 }}>暂无数据</div>
            ) : (() => {
              const now22 = new Date();
              const currentYear = now22.getFullYear();
              const yearStart = new Date(currentYear, 0, 1);
              const currentWeek = Math.ceil(((now22.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
              const quarterStartWeek = Math.ceil(((new Date(currentYear, Math.floor(now22.getMonth() / 3) * 3, 1).getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
              const weekMap = new Map<number, any>();
              for (const w of weeklyRateData) {
                if (w.week < quarterStartWeek || w.week > currentWeek) continue;
                if (!weekMap.has(w.week)) weekMap.set(w.week, w);
              }
              const sorted = [...weekMap.entries()].sort((a, b) => a[0] - b[0]);
              if (!sorted.length) return <div style={{ color: '#999', fontSize: 11 }}>暂无数据</div>;
              const weeks = sorted.map(([w]) => `第${w}周`);
              const rates = sorted.map(([, d]) => calcFaultRate(d));
              const maxRate = Math.max(...rates, 1.09, 1);
              const w = 600, h = 160, padL = 36, padR = 10, padT = 8, padB = 20;
              const plotW = w - padL - padR;
              const xStep = sorted.length > 1 ? plotW / (sorted.length - 1) : plotW;
              const points = rates.map((v, i) => {
                const px = padL + i * xStep;
                const py = h - padB - (v / maxRate) * (h - padT - padB);
                return `${px},${py}`;
              }).join(' ');
              const warnY = h - padB - (1.09 / maxRate) * (h - padT - padB);
              return (
                <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: 600, height: 'auto', marginTop: 60 }}>
                  <text x={padL - 4} y={padT + 4} fontSize="10" fill="#AAA" textAnchor="end">{maxRate}%</text>
                  <text x={padL - 4} y={padT + (h - padT - padB) / 2 + 4} fontSize="10" fill="#AAA" textAnchor="end">{Math.round(maxRate / 2)}%</text>
                  <text x={padL - 4} y={h - padB + 4} fontSize="10" fill="#AAA" textAnchor="end">0</text>
                  <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <line x1={padL} y1={padT + (h - padT - padB) / 2} x2={w - padR} y2={padT + (h - padT - padB) / 2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
                  {/* 警戒线 1.09% */}
                  <line x1={padL} y1={warnY} x2={w - padR} y2={warnY} stroke={RED} strokeWidth="1.5" strokeDasharray="6 3" />
                  <text x={w - padR + 2} y={warnY + 3} fontSize="9" fill={RED}>1.09%</text>
                  <polyline points={points} fill="none" stroke={CYAN} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {rates.map((v, i) => {
                    const px = padL + i * xStep;
                    const py = h - padB - (v / maxRate) * (h - padT - padB);
                    return <circle key={i} cx={px} cy={py} r="3" fill={CYAN} />;
                  })}
                  {weeks.map((label, i) => (
                    <text key={i} x={padL + i * xStep} y={h - 4} fontSize="9" fill="#AAA" textAnchor="middle">{label}</text>
                  ))}
                </svg>
              );
            })()}
          </div>
          {/* 停线时长 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: '#DDD', marginBottom: 6 }}>停线时长</div>
            {(() => {
              const now25 = new Date();
              const yearStart4 = new Date(now25.getFullYear(), 0, 1);
              const currWk = Math.ceil(((now25.getTime() - yearStart4.getTime()) / 86400000 + yearStart4.getDay() + 1) / 7);
              const thisWk = weeklyRateData.find((w: any) => w.week === currWk);
              const prevWk = weeklyRateData.find((w: any) => w.week === currWk - 1);
              const thisStop = thisWk?.stop_minutes ?? 0;
              const prevStop = prevWk?.stop_minutes ?? 0;
              const mom = prevStop > 0 ? Math.round((thisStop - prevStop) / prevStop * 100) : 0;
              const statBox = { border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', textAlign: 'center' as const, flex: 1, minWidth: 60 };
              return (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={statBox}><div style={{ fontSize: 9, color: '#AAA' }}>本周停线</div><div style={{ fontSize: 18, fontWeight: 700, color: RED }}>{thisStop}min</div></div>
                  <div style={statBox}>
                    <div style={{ fontSize: 9, color: '#AAA' }}>环比</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: mom > 0 ? RED : mom < 0 ? GREEN : '#AAA' }}>
                      {mom > 0 ? '↑+' : mom < 0 ? '↓' : '→'}{Math.abs(mom)}%
                    </div>
                  </div>
                </div>
              );
            })()}
            {stopDurationData.length === 0 ? (
              <div style={{ color: '#999', fontSize: 11 }}>暂无数据</div>
            ) : (() => {
              const maxV = Math.max(...stopDurationData.map((d: any) => d.totalMinutes || d.value || 0), 1);
              const w = 600, h = 140, padL = 36, padR = 10, padT = 8, padB = 18;
              const plotW = w - padL - padR;
              return (
                <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: 600, height: 'auto', marginTop: 60 }}>
                  <text x={padL - 4} y={padT + 4} fontSize="10" fill="#AAA" textAnchor="end">{maxV}</text>
                  <text x={padL - 4} y={padT + (h - padT - padB) / 2 + 4} fontSize="10" fill="#AAA" textAnchor="end">{Math.round(maxV / 2)}</text>
                  <text x={padL - 4} y={h - padB + 4} fontSize="10" fill="#AAA" textAnchor="end">0</text>
                  <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  {stopDurationData.map((d: any, i: number) => {
                    const v = d.totalMinutes || d.value || 0;
                    const barH = (v / maxV) * (h - padT - padB);
                    const barW = (plotW / stopDurationData.length) * 0.6;
                    const x = padL + i * (plotW / stopDurationData.length) + (plotW / stopDurationData.length - barW) / 2;
                    const y = h - padB - barH;
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={barH} fill={RED} rx="2" />
                        <text x={x + barW / 2} y={h - 3} fontSize="9" fill="#AAA" textAnchor="middle">{d.month?.slice(0,7) || d.label || ''}</text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
          </div>
        </div>
      </div>

      {/* ========== 第三行：模块5 ========== */}
      <div className="card" style={{ background: CARD_BG, borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: CYAN, marginBottom: 12 }}>📦 备件与库存</div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontSize: 11, color: '#AAA', marginBottom: 6 }}>关键备件库存预警</div>
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: '#AAA', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 4px' }}>备件名称</th>
                  <th style={{ padding: '4px 4px' }}>库存</th>
                  <th style={{ padding: '4px 4px' }}>安全库存</th>
                  <th style={{ padding: '4px 4px' }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {lowParts.map((p: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '4px', color: '#ccc' }}>{p.name}</td>
                    <td style={{ padding: '4px', textAlign: 'center', color: p.stock <= 0 ? RED : p.stock < p.safe ? YELLOW : '#ccc' }}>{p.stock}</td>
                    <td style={{ padding: '4px', textAlign: 'center', color: '#BBB' }}>{p.safe}</td>
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 10, background: p.status === 'danger' ? 'rgba(255,23,68,0.2)' : p.status === 'warning' ? 'rgba(255,193,7,0.2)' : 'rgba(0,230,118,0.15)', color: p.status === 'danger' ? RED : p.status === 'warning' ? YELLOW : GREEN }}>
                        {p.status === 'danger' ? '紧急' : p.status === 'warning' ? '预警' : '正常'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lowParts.length === 0 && <div style={{ color: '#999', fontSize: 11, padding: 8 }}>暂无低库存备件</div>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
            <KpiCard icon="📦" label="备件总数" value={overview.partCount || 0} color={CYAN} />
            <KpiCard icon="⚠️" label="低库存预警" value={lowStock.length || overview.lowStockCount || 0} color={RED} />
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: '#AAA', marginBottom: 6 }}>维修成本对比（本月 vs 上月）</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 100, borderBottom: '1px solid rgba(255,255,255,0.08)', borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: 30, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 9, color: '#AAA' }}>
                <span>{monthFaults + lastFaults}</span>
                <span>{Math.round((monthFaults + lastFaults) / 2)}</span>
                <span>0</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ height: lastFaults > 0 ? (lastFaults / Math.max(monthFaults + lastFaults, 1) * 100) + '%' : '5%', minHeight: 4, width: 36, background: '#444', borderRadius: '3px 3px 0 0' }} />
                <div style={{ fontSize: 9, color: '#AAA', marginTop: 4 }}>上月</div>
                <div style={{ fontSize: 10, color: '#DDD' }}>{lastFaults} 次</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ height: monthFaults > 0 ? (monthFaults / Math.max(monthFaults + lastFaults, 1) * 100) + '%' : '5%', minHeight: 4, width: 36, background: CYAN, borderRadius: '3px 3px 0 0' }} />
                <div style={{ fontSize: 9, color: '#AAA', marginTop: 4 }}>本月</div>
                <div style={{ fontSize: 10, color: CYAN }}>{monthFaults} 次</div>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#AAA', marginBottom: 6 }}>设备状态分布</div>
            <RingChart value={completedCount} max={totalRepairs || 1} size={140} color={GREEN} label="维修完成率" />
            <div style={{ marginTop: 6, fontSize: 10, color: '#DDD' }}>
              设备总数 {deviceCount} | 闲置 {statusCount.fault} | 正常 {statusCount.normal}
            </div>
          </div>
        </div>
      </div>
    </div>
    <style>{`
      @keyframes lineFlow {
        0% { background-position: -16px 0; }
        100% { background-position: 0 0; }
      }
      @keyframes trainAlert {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
    `}</style>
    </>
  );
}
