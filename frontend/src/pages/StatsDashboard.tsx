import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { repairApi, statsApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const LINE_OPTIONS = ['全部', '1线', '2线', '3线', '4线', 'VIP线', '紫外', '紫外车间', '工艺', '工艺组', '设备', '设备组'];
const YEAR_OPTIONS = ['全部', '2024', '2025', '2026'];

export default function StatsDashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<any[]>([]);
  const [byLineData, setByLineData] = useState<any[]>([]);
  const [faultFreq, setFaultFreq] = useState<any[]>([]);
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [stopDurationData, setStopDurationData] = useState<any[]>([]);
  const [faultRateData, setFaultRateData] = useState<any[]>([]);
  const [weeklyRateData, setWeeklyRateData] = useState<any[]>([]);
  const [yearFilter, setYearFilter] = useState('2026');
  const [lineFilter, setLineFilter] = useState('全部');

  const fetchParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (yearFilter !== '全部') p.year = yearFilter;
    if (lineFilter !== '全部') p.line = lineFilter;
    return p;
  }, [yearFilter, lineFilter]);

  useEffect(() => {
    statsApi.overview().then(r => setOverview(r.data));
    statsApi.faultFrequency().then(r => setFaultFreq(r.data));
    statsApi.lowStock().then(r => setLowStock(r.data));
    statsApi.stopDurationByMonth(fetchParams).then((r: any) => setStopDurationData(r.data || r || [])).catch(console.error);
    statsApi.faultRateByMonth(fetchParams).then((r: any) => setFaultRateData(r.data || r || [])).catch(console.error);
    // 加载最近15周周度统计
    (async () => {
      const now = new Date();
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const currentWeek = Math.ceil(((now.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
      const minWeek = Math.max(1, currentWeek - 15);
      // 估算需要覆盖的月份
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 15 * 7);
      const allWeeks: any[] = [];
      for (let y = startDate.getFullYear(); y <= now.getFullYear(); y++) {
        for (let m = 1; m <= 12; m++) {
          if (y === startDate.getFullYear() && m < startDate.getMonth() + 1) continue;
          if (y === now.getFullYear() && m > now.getMonth() + 1) continue;
          try {
            const r = await statsApi.weeklyStats(y, m);
            const weeks = r.data || [];
            allWeeks.push(...weeks);
          } catch (_) {}
        }
      }
      setWeeklyRateData(allWeeks);
    })();
  }, []);

  useEffect(() => {
    repairApi.statsMonthlyTrend(fetchParams).then((r: any) => setMonthlyTrend(r.data || r || [])).catch(console.error);
    repairApi.statsByLine(fetchParams).then((r: any) => setByLineData(r.data || r || [])).catch(console.error);
    repairApi.statsSummary(fetchParams).then((r: any) => setSummary(r.data || r || [])).catch(console.error);
  }, [fetchParams]);

  // 汇总数据：设备维修 & 工具维修
  const deviceSummary = useMemo(() => summary.find((s: any) => s.work_order_type === '设备维修') || { total: 0, completed: 0, completionRate: 0 }, [summary]);
  const toolSummary = useMemo(() => summary.find((s: any) => s.work_order_type === '工具维修') || { total: 0, completed: 0, completionRate: 0 }, [summary]);

  // 月度趋势按月份分组
  const trendByMonth = useMemo(() => {
    const map: Record<string, { device: any; tool: any }> = {};
    for (const row of monthlyTrend) {
      if (!map[row.month]) map[row.month] = { device: null, tool: null };
      if (row.work_order_type === '设备维修') map[row.month].device = row;
      else if (row.work_order_type === '工具维修') map[row.month].tool = row;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [monthlyTrend]);

  const trendMax = useMemo(() => {
    if (!trendByMonth.length) return 10;
    let max = 0;
    for (const [, data] of trendByMonth) {
      max = Math.max(max, data.device?.total || 0, data.tool?.total || 0);
    }
    return Math.ceil(max * 1.2) || 10;
  }, [trendByMonth]);

  // 线体统计表格 - 按线体+类型合并展示
  const tableRows = useMemo(() => {
    const lineSet = new Set<string>();
    for (const r of byLineData) if (r.line) lineSet.add(r.line);
    const lines = Array.from(lineSet).sort((a, b) => a.localeCompare(b, 'zh'));

    const rows: any[] = [];
    for (const line of lines) {
      const dr = byLineData.find((r: any) => r.line === line && r.work_order_type === '设备维修');
      const tr = byLineData.find((r: any) => r.line === line && r.work_order_type === '工具维修');
      rows.push({
        line,
        deviceTotal: dr?.total || 0,
        deviceCompleted: dr?.completed || 0,
        deviceRate: dr?.completionRate || 0,
        toolTotal: tr?.total || 0,
        toolCompleted: tr?.completed || 0,
        toolRate: tr?.completionRate || 0,
      });
    }
    return rows;
  }, [byLineData]);

  // 合计行
  const totals = useMemo(() => {
    let dT = 0, dC = 0, tT = 0, tC = 0;
    for (const r of tableRows) { dT += r.deviceTotal; dC += r.deviceCompleted; tT += r.toolTotal; tC += r.toolCompleted; }
    return {
      deviceTotal: dT, deviceCompleted: dC,
      deviceRate: dT > 0 ? Math.round(dC / dT * 1000) / 10 : 0,
      toolTotal: tT, toolCompleted: tC,
      toolRate: tT > 0 ? Math.round(tC / tT * 1000) / 10 : 0,
    };
  }, [tableRows]);

  const rateColor = (rate: number) => rate < 60 ? '#ff4d4f' : '#52c41a';

  return (
    <div style={{ overflowX: 'hidden', maxWidth: '100%' }}>
      {/* 周度设备运行统计 */}
      <WeeklyStatsSection />

      {/* 月度设备运行统计 */}
      <MonthlyStatsSection />

      <div className="stats-two-col">
      {/* 月度趋势图 */}
      {trendByMonth.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, overflowX: 'hidden' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>故障次数</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 180, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', paddingLeft: 36, position: 'relative' }}>
            {/* Y轴刻度 */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
              <span>{trendMax}</span>
              <span>{Math.round(trendMax / 2)}</span>
              <span>0</span>
            </div>
            {trendByMonth.map(([month, data], i) => {
              const dv = data.device?.total || 0;
              const tv = data.tool?.total || 0;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                  <div style={{ width: '100%', display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'flex-end', height: '100%' }}>
                    {/* 设备维修柱 */}
                    <div title={`设备维修: ${dv}单`} style={{ width: 12, minHeight: dv > 0 ? 3 : 0, height: `${(dv / trendMax) * 100}%`, backgroundColor: 'var(--accent-cyan, #00d4ff)', borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }}>
                      {dv > 0 && <div style={{ fontSize: 10, color: '#fff', textAlign: 'center', lineHeight: '12px' }}>{dv}</div>}
                    </div>
                    {/* 工具维修柱 */}
                    <div title={`工具维修: ${tv}单`} style={{ width: 12, minHeight: tv > 0 ? 3 : 0, height: `${(tv / trendMax) * 100}%`, backgroundColor: '#faad14', borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }}>
                      {tv > 0 && <div style={{ fontSize: 10, color: '#fff', textAlign: 'center', lineHeight: '12px' }}>{tv}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: '#888', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{month}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#aaa' }}>
            <span><span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: 'var(--accent-cyan, #00d4ff)', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />设备维修</span>
            <span><span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: '#faad14', borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }} />工具维修</span>
          </div>
        </div>
      )}

      {/* 停线时长 */}
      {stopDurationData.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, overflowX: 'hidden' }}>
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>停线时长</h3>
          {(() => {
            const maxMinutes = Math.max(...stopDurationData.map(d => d.totalMinutes), 1);
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 160, borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', paddingLeft: 36, position: 'relative', marginBottom: 8 }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 11, color: '#888' }}>
                    <span>{maxMinutes}</span>
                    <span>{Math.round(maxMinutes / 2)}</span>
                    <span>0</span>
                  </div>
                  {stopDurationData.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                      <div title={`总停线: ${d.totalMinutes}分钟`}
                        style={{ width: '80%', minHeight: d.totalMinutes > 0 ? 3 : 0, height: `${(d.totalMinutes / maxMinutes) * 100}%`, backgroundColor: '#ff6b6b', borderRadius: '2px 2px 0 0', transition: 'height 0.3s' }}>
                        {d.totalMinutes > 0 && <div style={{ fontSize: 10, color: '#fff', textAlign: 'center', lineHeight: '12px' }}>{d.totalMinutes}</div>}
                      </div>
                      <div style={{ fontSize: 10, color: '#888', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.month}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#888', flexWrap: 'wrap', gap: 8 }}>
                  <span>总停线: <strong style={{ color: '#ff6b6b' }}>{stopDurationData.reduce((sum, d) => sum + d.totalMinutes, 0)}</strong> 分钟</span>
                  <span>月均: <strong>{Math.round(stopDurationData.reduce((sum, d) => sum + d.totalMinutes, 0) / stopDurationData.length)}</strong> 分钟</span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* 设备故障率折线图（当前周往前15周） */}
      {weeklyRateData.length > 0 && (() => {
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const currentWeek = Math.ceil(((now.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
        const minWeek = Math.max(1, currentWeek - 15);
        
        const weekMap = new Map<number, any>();
        for (const w of weeklyRateData) {
          if (w.running_days === null && !w.fault_count) continue;
          if (w.week < minWeek || w.week > currentWeek) continue;
          if (!weekMap.has(w.week)) weekMap.set(w.week, w);
        }
        const sorted = [...weekMap.entries()].sort((a, b) => a[0] - b[0]);
        if (!sorted.length) return null;
        const weeks = sorted.map(([w]) => `第${w}周`);
        const rates = sorted.map(([, d]) => {
          if (!d.running_days) return 0;
          const weekNum = d.week || 0;
          const forced: Record<number, number> = { 18: 0.42, 19: 0.94, 20: 1.04, 21: 1.07 };
          if (forced[weekNum]) return forced[weekNum];
          if (!d.fault_count) return 0;
          if (weekNum >= 22) {
            const dt = d.device_total || 1;
            const rd = d.running_days || 1;
            return Math.round((d.fault_count / 6 / (dt * rd / 28)) * 10000) / 100;
          }
          const rd = d.running_days || 1;
          return Math.round((d.fault_count / 6 / (160 * rd / 25)) * 10000) / 100;
        });
        const maxRate = Math.max(...rates, 1.09, 1);
        if (!sorted.length) return null;
        const w = 600, h = 180, padL = 36, padR = 10, padT = 8, padB = 20;
        const plotW = w - padL - padR;
        const xStep = sorted.length > 1 ? plotW / (sorted.length - 1) : plotW;
        const points = rates.map((v, i) => {
          const px = padL + i * xStep;
          const py = h - padB - (v / maxRate) * (h - padT - padB);
          return `${px},${py}`;
        }).join(' ');
        const warnY = h - padB - (1.09 / maxRate) * (h - padT - padB);
        
        return (
          <div className="card" style={{ padding: 16, marginBottom: 16, overflowX: 'hidden' }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>故障率趋势</h3>
            <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', maxWidth: 600, height: 'auto' }}>
              <text x={padL - 4} y={padT + 4} fontSize="10" fill="#888" textAnchor="end">{maxRate}%</text>
              <text x={padL - 4} y={padT + (h - padT - padB) / 2 + 4} fontSize="10" fill="#888" textAnchor="end">{Math.round(maxRate / 2)}%</text>
              <text x={padL - 4} y={h - padB + 4} fontSize="10" fill="#888" textAnchor="end">0</text>
              <line x1={padL} y1={padT} x2={padL} y2={h - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1={padL} y1={h - padB} x2={w - padR} y2={h - padB} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <line x1={padL} y1={padT + (h - padT - padB) / 2} x2={w - padR} y2={padT + (h - padT - padB) / 2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
              {/* 警戒线 1.09% */}
              <line x1={padL} y1={warnY} x2={w - padR} y2={warnY} stroke="#ff1744" strokeWidth="1.5" strokeDasharray="6 3" />
              <text x={w - padR + 2} y={warnY + 3} fontSize="9" fill="#ff1744">1.09%</text>
              <polyline points={points} fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {rates.map((v, i) => {
                const px = padL + i * xStep;
                const py = h - padB - (v / maxRate) * (h - padT - padB);
                return <circle key={i} cx={px} cy={py} r="4" fill="#00d4ff" stroke="#1a1a2e" strokeWidth="1" />;
              })}
              {weeks.map((label, i) => (
                <text key={i} x={padL + i * xStep} y={h - 4} fontSize="10" fill="#888" textAnchor="middle">{label}</text>
              ))}
            </svg>
          </div>
        );
      })()}

      {/* 维修数据统计表格 */}
      <div className="card" style={{ marginBottom: 16, padding: 12, overflowX: 'hidden' }}>
        <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>维修数据统计</h3>
        <div style={{ overflowX: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '8px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>线体</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>设备故障次数</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>设备维修完结率</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>工具维修次数</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>工具维修完结率</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#888' }}>暂无数据</td></tr>
              )}
              {tableRows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.06))' }}>
                  <td style={{ padding: '8px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>{r.line}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>{r.deviceTotal}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'center', color: rateColor(r.deviceRate), fontWeight: r.deviceRate < 60 ? 700 : 400 }}>{r.deviceRate}%</td>
                  <td style={{ padding: '8px 4px', textAlign: 'center' }}>{r.toolTotal}</td>
                  <td style={{ padding: '8px 4px', textAlign: 'center', color: rateColor(r.toolRate), fontWeight: r.toolRate < 60 ? 700 : 400 }}>{r.toolRate}%</td>
                </tr>
              ))}
            </tbody>
            {tableRows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--accent-cyan, #00d4ff)', fontWeight: 700 }}>
                  <td style={{ padding: '10px 6px', fontWeight: 700 }}>合计</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>{totals.deviceTotal}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center', color: rateColor(totals.deviceRate) }}>{totals.deviceRate}%</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center' }}>{totals.toolTotal}</td>
                  <td style={{ padding: '10px 4px', textAlign: 'center', color: rateColor(totals.toolRate) }}>{totals.toolRate}%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </div>

    </div>
  );
}

// ===== 月度设备运行统计子组件 =====
function MonthlyStatsSection() {
  const { user } = useAuth();
  const isOperator = user?.role === 'operator';
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const exportExcel = useCallback(() => {
    const cols = ['指标', ...data.map((d: any) => d.month_label)];
    const currentMonth = new Date().getMonth() + 1;
    const getVal = (d: any, key: string) => {
      if (d.month > currentMonth) return '';
      return d[key] ?? '';
    };
    const rows: any[][] = [
      ['设备总数', ...data.map(d => getVal(d, 'device_total'))],
      ['线体数量', ...data.map(d => getVal(d, 'line_count'))],
      ['排班天数', ...data.map(d => getVal(d, 'schedule_days'))],
      ['运行天数', ...data.map(d => getVal(d, 'running_days'))],
      ['故障次数', ...data.map(d => getVal(d, 'fault_count'))],
      ['停机时长', ...data.map(d => getVal(d, 'stop_minutes'))],
      ['重复故障数', ...data.map(d => getVal(d, 'repeat_fault_count'))],
      ['设备利用率', ...data.map(d => {
        if (d.month > currentMonth) return '';
        const v = FORCED_MONTHLY[d.month]?.utilization;
        return v != null ? v + '%' : '';
      })],
      ['故障重复率', ...data.map(d => {
        if (d.month > currentMonth) return '';
        const v = FORCED_MONTHLY[d.month]?.repeat_rate;
        return v != null ? v + '%' : '';
      })],
      ['设备故障率', ...data.map(d => {
        if (d.month > currentMonth) return '';
        const v = FORCED_MONTHLY[d.month]?.fault_rate;
        return v != null ? v + '%' : '';
      })],
    ];
    import('xlsx-js-style').then(XLSX => {
      const ws = XLSX.utils.aoa_to_sheet([cols, ...rows]);
      // 设置列宽：指标列100px，月份列90px
      ws['!cols'] = [{ wch: 14 }, ...data.map(() => ({ wch: 12 }))];
      // 设置行高和字体
      const headerStyle = { font: { sz: 15, bold: true }, alignment: { wrapText: true } };
      const dataStyle = { font: { sz: 15 } };
      const cellRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let r = cellRange.s.r; r <= cellRange.e.r; r++) {
        for (let c = cellRange.s.c; c <= cellRange.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (!ws[addr]) continue;
          if (!ws[addr].s) ws[addr].s = {};
          if (r === 0) {
            ws[addr].s = { ...ws[addr].s, font: { sz: 15, bold: true, color: { rgb: '00D4FF' } }, alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center', wrapText: true }, border: { top: { style: 'thin', color: { rgb: '333333' } }, bottom: { style: 'thin', color: { rgb: '00D4FF' } }, left: { style: 'thin', color: { rgb: '333333' } }, right: { style: 'thin', color: { rgb: '333333' } } }, fill: { fgColor: { rgb: '0A1428' } } };
          } else {
            ws[addr].s = { ...ws[addr].s, font: { sz: 15 }, alignment: { horizontal: c === 0 ? 'left' : 'center', vertical: 'center' }, border: { top: { style: 'thin', color: { rgb: '333333' } }, bottom: { style: 'thin', color: { rgb: '333333' } }, left: { style: 'thin', color: { rgb: '333333' } }, right: { style: 'thin', color: { rgb: '333333' } } } };
          }
        }
        // 行高
        const rowAddr = XLSX.utils.encode_cell({ r, c: 0 });
        if (!ws['!rows']) ws['!rows'] = [];
        ws['!rows'][r] = { hpt: r === 0 ? 28 : 24 };
      }
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '月度运行统计');
      XLSX.writeFile(wb, `月度设备运行统计_${year}.xlsx`);
    }).catch(() => {
      const csvContent = '\uFEFF' + [cols.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `月度设备运行统计_${year}.csv`; a.click();
      URL.revokeObjectURL(url);
    });
  }, [data, year]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const allWeeks: any[] = [];
    for (let m = 1; m <= 12; m++) {
      try {
        const r = await statsApi.weeklyStats(parseInt(year), m);
        const weeks = r.data || r || [];
        const filtered = weeks.filter((w: any) => w.week !== null && w.week !== undefined);
        allWeeks.push(...filtered.map((w: any) => ({ ...w, _month: m })));
      } catch (_) {}
    }
    // 按月份聚合
    const monthMap = new Map<number, any>();
    for (const w of allWeeks) {
      const m = w._month;
      if (!monthMap.has(m)) {
        monthMap.set(m, {
          month: m, month_label: `${m}月`,
          running_days: 0, fault_count: 0, stop_minutes: 0,
          repeat_fault_count: 0, device_total: w.device_total || 0,
        });
      }
      const agg = monthMap.get(m);
      agg.running_days += w.running_days || 0;
      agg.fault_count += w.fault_count || 0;
      agg.stop_minutes += w.stop_minutes || 0;
      agg.repeat_fault_count += w.repeat_fault_count || 0;
    }
    const sorted = [...monthMap.values()].sort((a, b) => a.month - b.month)
      .map((d: any) => FORCED_MONTHLY[d.month] ? { ...d, ...FORCED_MONTHLY[d.month] } : d);
    // 确保每月都有强制基础数据
    for (let m = 1; m <= 12; m++) {
      if (FORCED_MONTHLY[m] && !sorted.find((d: any) => d.month === m)) {
        sorted.push({ month: m, month_label: `${m}月`, ...FORCED_MONTHLY[m] });
      }
    }
    sorted.sort((a: any, b: any) => a.month - b.month);
    setData(sorted);
    setLoading(false);
  }, [year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const calcFaultRate = (d: any) => {
    if (!d.fault_count || !d.running_days) return 0;
    const rd = d.running_days || 1;
    return Math.round((d.fault_count / 6 / (d.device_total || 1 / rd * 28)) * 10000) / 100;
  };

  // 1-5月强制数据 + 排班天数（大小休+法定假期后）
  const FORCED_MONTHLY: Record<number, any> = {
    1: { running_days: 30, fault_count: 19, stop_minutes: 58, repeat_fault_count: 1, utilization: 34.09, fault_rate: 1.58, repeat_rate: Number((1 / 19 * 100).toFixed(2)), device_total: 160, line_count: 4, schedule_days: 23 },
    2: { running_days: 20, fault_count: 8, stop_minutes: 32, repeat_fault_count: 0, utilization: 27.78, fault_rate: 1.00, repeat_rate: 0, device_total: 160, line_count: 4, schedule_days: 18 },
    3: { running_days: 38, fault_count: 15, stop_minutes: 68, repeat_fault_count: 2, utilization: 39.58, fault_rate: 0.99, repeat_rate: Number((2 / 15 * 100).toFixed(2)), device_total: 160, line_count: 4, schedule_days: 25 },
    4: { running_days: 35, fault_count: 11, stop_minutes: 71, repeat_fault_count: 0, utilization: 36.46, fault_rate: 0.79, repeat_rate: 0, device_total: 160, line_count: 4, schedule_days: 22 },
    5: { running_days: 42, fault_count: 17, stop_minutes: 55, repeat_fault_count: 2, utilization: 43.75, fault_rate: 1.01, repeat_rate: Number((2 / 17 * 100).toFixed(2)), device_total: 160, line_count: 4, schedule_days: 21 },
    6: { device_total: 160, line_count: 4, schedule_days: 22 },
    7: { device_total: 160, line_count: 4, schedule_days: 25 },
    8: { device_total: 160, line_count: 4, schedule_days: 24 },
    9: { device_total: 160, line_count: 4, schedule_days: 21 },
    10: { device_total: 160, line_count: 4, schedule_days: 19 },
    11: { device_total: 160, line_count: 4, schedule_days: 23 },
    12: { device_total: 160, line_count: 4, schedule_days: 24 },
  };

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, overflowX: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>月度设备运行统计</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontSize: 13 }}>
            {['2024', '2025', '2026'].map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          {!isOperator && (
            <button onClick={exportExcel} className="primary"
              style={{ padding: '3px 10px', fontSize: 12, borderRadius: 6 }}>
              📥 导出
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>加载中...</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>暂无数据</div>
      ) : (
        <div style={{ overflowX: 'auto' }} ref={tableRef}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--accent-cyan, #00d4ff)' }}>
                <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-card-solid, #1E293B)', zIndex: 2, minWidth: 100, fontSize: 15, fontWeight: 600 }}>指标</th>
                {data.map((d: any) => (
                  <th key={d.month} style={{ padding: '12px 8px', textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>{d.month_label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { key: 'device_total', label: '设备总数' } as const,
                { key: 'line_count', label: '线体数量' } as const,
                { key: 'schedule_days', label: '排班天数' } as const,
                { key: 'running_days', label: '运行天数' } as const,
                { key: 'fault_count', label: '故障次数' } as const,
                { key: 'stop_minutes', label: '停机时长' } as const,
                { key: 'repeat_fault_count', label: '重复故障数' } as const,
              ] as any[]).map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card-solid, #1E293B)', zIndex: 1 }}>{row.label}</td>
                  {data.map((d: any) => (
                    <td key={d.month} style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {row.unit ? `${d[row.key] || 0}${row.unit}` : (d[row.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))}
              {[
                { key: 'utilization', label: '设备利用率', calc: (d: any) => FORCED_MONTHLY[d.month]?.utilization ?? (d.running_days ? Math.round(d.running_days / ((d.schedule_days || 1) * (d.line_count || 4)) * 10000) / 100 : 0) },
                { key: 'repeat_rate', label: '故障重复率', calc: (d: any) => FORCED_MONTHLY[d.month]?.repeat_rate ?? (d.fault_count ? Math.round((d.repeat_fault_count || 0) / d.fault_count * 1000) / 10 : 0) },
                { key: 'failure_rate', label: '设备故障率', calc: (d: any) => FORCED_MONTHLY[d.month]?.fault_rate ?? calcFaultRate(d) },
              ].map(row => (
                <tr key={row.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 600, position: 'sticky', left: 0, background: 'var(--bg-card-solid, #1E293B)', zIndex: 1 }}>{row.label}</td>
                  {data.map((d: any) => (
                    <td key={d.month} style={{ padding: '10px 8px', textAlign: 'center', color: row.key === 'failure_rate' ? (row.calc(d) > 1.09 ? '#ff4d4f' : '#00d4ff') : '#00d4ff' }}>
                      {row.calc(d)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===== 周度设备运行统计子组件 =====
interface WeeklyRow { key: string; label: string; unit?: string; editable?: boolean; autoCalc?: boolean; }
const ROWS: WeeklyRow[] = [
  { key: 'running_days', label: '排班运行天数', autoCalc: true },
  { key: 'fault_count', label: '故障次数' },
  { key: 'stop_minutes', label: '停机时长' },
  { key: 'repeat_fault_count', label: '重复故障数', editable: true },
  { key: 'utilization', label: '设备利用率' },
  { key: 'repeat_rate', label: '故障重复率' },
  { key: 'failure_rate', label: '设备故障率' },
];

function WeeklyStatsSection() {
  const { user } = useAuth();
  const isDeviceAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<string | null>(null); // "week_key"
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const showMsg = useCallback((msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await statsApi.weeklyStats(parseInt(year), parseInt(month));
      setData(res.data || []);
    } catch {
      showMsg('加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [year, month, showMsg]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 数据加载后自动滚动到当前周的列
  const tableRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (data.length === 0) return;
    const today = new Date();
    const dayOfWeek = today.getDay();
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const currentWeekStr = thisMonday.toISOString().slice(0, 10);
    const currentWeekIdx = data.findIndex((d: any) => d.start_date === currentWeekStr);
    const targetIdx = currentWeekIdx >= 0 ? currentWeekIdx : data.length - 1;
    setTimeout(() => {
      const table = tableRef.current;
      if (!table) return;
      const ths = table.querySelectorAll<HTMLTableCellElement>('thead th');
      if (ths[targetIdx + 1]) { // +1 因为第0列是"指标"
        ths[targetIdx + 1].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }, 100);
  }, [data]);

  // 单元格进入编辑模式
  const startEdit = useCallback((week: number, rowKey: string, currentValue: number | null) => {
    setEditingCell(`${week}_${rowKey}`);
    setEditValues(prev => ({ ...prev, [`${week}_${rowKey}`]: currentValue ?? '' }));
  }, []);

  // 单元格保存
  const saveEdit = useCallback(async (week: number, rowKey: string) => {
    const cellKey = `${week}_${rowKey}`;
    const rawVal = editValues[cellKey];
    const numVal = rawVal === '' ? null : parseFloat(rawVal);
    if (rawVal !== '' && isNaN(numVal!)) { showMsg('请输入有效数字', 'error'); return; }

    setSaving(prev => ({ ...prev, [week]: true }));
    try {
      if (rowKey === 'repeat_fault_count') {
        if (!isDeviceAdmin) { showMsg('仅设备管理员可修改重复故障数', 'error'); return; }
        await statsApi.saveWeeklyStats({ year: parseInt(year), month: parseInt(month), week, repeat_fault_count: numVal });
      }
      showMsg('保存成功');
      setEditingCell(null);
      fetchData();
    } catch {
      showMsg('保存失败', 'error');
    } finally {
      setSaving(prev => ({ ...prev, [week]: false }));
    }
  }, [editValues, year, month, fetchData, showMsg]);

  // 计算派生字段
  const calcRow = (item: any, key: string) => {
    if (!item) return null;
    if (key === 'running_days') {
      // 直接从 API 返回的 running_days（排班系统自动统计）拿值
      return item.running_days ?? null;
    }
    if (key === 'utilization') {
      // 设备利用率 = 排班运行天数 / (4条线 × 7天) × 100%
      if (item.running_days === null || item.running_days === undefined) return null;
      return Math.min(100, Math.round((item.running_days / 24) * 1000) / 10);
    }
    if (key === 'repeat_rate') {
      // repeat_fault_count=0 → 重复率 0%，fault_count=0 时无法计算
      if (item.repeat_fault_count === null || item.repeat_fault_count === undefined) return null;
      if (!item.fault_count) return item.repeat_fault_count === 0 ? 0 : null;
      return Math.round((item.repeat_fault_count / item.fault_count) * 1000) / 10;
    }
    if (key === 'failure_rate') {
      if (item.running_days === null || item.running_days === undefined) return null;
      if (item.running_days === 0) return null;
      const weekNum = item.week || 0;
      const forced: Record<number, number> = { 18: 0.42, 19: 0.94, 20: 1.04, 21: 1.07 };
      if (forced[weekNum]) return forced[weekNum];
      if (!item.fault_count) return 0;
      if (weekNum >= 22) {
        if (!item.device_total) return null;
        return Math.round((item.fault_count / 6 / (item.device_total * item.running_days / 28)) * 10000) / 100;
      }
      // 旧公式：160台，25天
      return Math.round((item.fault_count / 6 / (160 * item.running_days / 25)) * 10000) / 100;
    }
    return null;
  };

  const isPercentKey = (key: string) => key === 'utilization' || key === 'repeat_rate' || key === 'failure_rate';

  const getCellValue = (item: any, key: string) => {
    if (!item) return null;
    if (key === 'utilization' || key === 'repeat_rate' || key === 'failure_rate' || key === 'running_days') return calcRow(item, key);
    return (item as any)[key];
  };

  const formatCellValue = (val: any, key: string) => {
    if (val === null || val === undefined) return '-';
    return isPercentKey(key) ? `${val}%` : val;
  };

  const cellStyle = (item: any, key: string, editable: boolean) => ({
    padding: '12px 6px', textAlign: 'center' as const, fontSize: 15,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: editable ? 'rgba(0,212,255,0.04)' : 'transparent',
    cursor: editable ? 'text' : 'default',
    color: key === 'running_days' ? '#4facfe' : key === 'utilization' ? '#00d4ff' : key === 'repeat_rate' ? '#faad14' : key === 'failure_rate' ? (calcRow(item, 'failure_rate') > 1.09 ? '#ff6b6b' : '#00d4ff') : undefined,
    fontWeight: (key === 'running_days' || key === 'utilization' || key === 'repeat_rate' || key === 'failure_rate') ? 600 : 400,
  });

  // 导出Excel
  const exportExcel = () => {
    if (!data.length) { showMsg('无数据可导出', 'error'); return; }
    const headers = ['指标', ...data.map((d: any) => d.full_label)];
    const rows_data = ROWS.map(r => [
      r.label,
      ...data.map((d: any) => {
        const v = getCellValue(d, r.key);
        return formatCellValue(v, r.key);
      }),
    ]);
    const csv = [headers, ...rows_data].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `周度设备运行统计_${year}年${month}月.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showMsg('导出成功');
  };

  const isSaving = (week: number) => saving[week];

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>📊 周度设备运行统计</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontSize: 13 }}>
            {['2024','2025','2026'].map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)}
            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text)', fontSize: 13 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={String(m)}>{m}月</option>)}
          </select>
          <button onClick={exportExcel} className="primary"
            style={{ padding: '3px 10px', fontSize: 12, minHeight: 'auto', lineHeight: 1.4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            📥
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '10px 18px', borderRadius: 8,
          background: toast.type === 'success' ? '#52c41a' : '#ff4d4f',
          color: '#fff', fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>{toast.msg}</div>
      )}

      {/* 表格 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>加载中...</div>
      ) : data.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, color: '#888' }}>该月暂无数据</div>
      ) : (
        <div style={{ overflowX: 'auto' }} ref={tableRef}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--accent-cyan, #00d4ff)' }}>
                <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-card-solid, #1E293B)', zIndex: 2, minWidth: 120, fontSize: 15, fontWeight: 600 }}>
                  指标
                </th>
                {data.map((d: any) => {
                  const fmtDate = (s: string) => { const p = s.split('-'); return `${Number(p[1])}/${Number(p[2])}`; };
                  return (
                  <th key={d.week} style={{ padding: '12px 8px', textAlign: 'center', whiteSpace: 'nowrap', minWidth: 130 }}>
                    <div style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>{d.week_label}</div>
                    <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{fmtDate(d.start_date)}-{fmtDate(d.end_date)}</div>
                    <div style={{ fontSize: 12, color: '#faad14', marginTop: 1 }}>{d.month_label}</div>
                  </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map(row => (
                <tr key={row.key}>
                  <td style={{ ...cellStyle(null!, row.key, false!), textAlign: 'left', paddingLeft: 10, fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--bg-card-solid, #1E293B)', zIndex: 1, fontSize: 15 }}>
                    {row.label}
                  </td>
                  {data.map((d: any) => {
                    const cellKey = `${d.week}_${row.key}`;
                    const val = getCellValue(d, row.key);
                    const isEditing = editingCell === cellKey;
                    const isRowSaving = isSaving(d.week);

                    return (
                      <td key={d.week} style={cellStyle(d, row.key, !!row.editable)}>
                        {row.editable ? (
                          isEditing ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <input
                                autoFocus
                                type="number"
                                min="0"
                                step="0.1"
                                value={editValues[cellKey] ?? ''}
                                onChange={e => setEditValues(prev => ({ ...prev, [cellKey]: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') saveEdit(d.week, row.key); if (e.key === 'Escape') setEditingCell(null); }}
                                style={{ width: 70, padding: '4px 6px', borderRadius: 4, border: '1px solid #00d4ff', background: '#0d1b2e', color: '#00d4ff', fontSize: 14, textAlign: 'center' }}
                              />
                              <button
                                onClick={() => saveEdit(d.week, row.key)}
                                disabled={isRowSaving}
                                style={{ padding: '3px 8px', borderRadius: 3, border: 'none', background: '#52c41a', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                                {isRowSaving ? '...' : '✓'}
                              </button>
                              <button
                                onClick={() => setEditingCell(null)}
                                style={{ padding: '3px 8px', borderRadius: 3, border: 'none', background: '#555', color: '#fff', fontSize: 13, cursor: 'pointer' }}>
                                ✕
                              </button>
                            </div>
                          ) : (
                            <div
                              onClick={row.key !== 'repeat_fault_count' || isDeviceAdmin ? () => startEdit(d.week, row.key, val) : undefined}
                              title={row.key === 'repeat_fault_count' && !isDeviceAdmin ? '仅设备管理员可编辑' : '点击编辑'}
                              style={{ cursor: row.key === 'repeat_fault_count' && !isDeviceAdmin ? 'default' : 'pointer', padding: '4px 6px', borderRadius: 4, border: row.key === 'repeat_fault_count' && !isDeviceAdmin ? '1px solid rgba(255,255,255,0.06)' : '1px dashed rgba(0,212,255,0.3)', color: val !== null ? '#00d4ff' : '#555', fontSize: 15, opacity: row.key === 'repeat_fault_count' && !isDeviceAdmin ? 0.5 : 1 }}>
                              {val !== null && val !== undefined ? formatCellValue(val, row.key) : <span style={{ fontSize: 13, color: '#555' }}>点击填写</span>}
                            </div>
                          )
                        ) : (
                          <span style={{ fontFamily: 'monospace' }}>
                            {formatCellValue(val, row.key)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

