import { useState, useEffect, useMemo } from 'react';
import { scheduleApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const LINE_CODES = ['A', 'B', 'C', 'D'];
const LINE_LABELS: Record<string, string> = { A: 'A线', B: 'B线', C: 'C线', D: 'D线' };
const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEAR_OPTIONS = ['2024', '2025', '2026', '2027'];

interface LineData {
  status: number;
  staff: string[];
}

interface DayData {
  date: string;
  dayOfWeek: number;
  dayLabel: string;
  lines: Record<string, LineData>;
}

interface WeekStats {
  [line: string]: { runDays: number; totalDays: number };
}

interface WeekData {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  days: DayData[];
  stats: WeekStats;
}

export default function SchedulePage() {
  const { isOperator, isSuperAdmin, isAdmin } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const currentWeekIndex = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return weeks.findIndex(w => w.days.some(d => d.date === today));
  }, [weeks]);

  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const displayWeekIndex = isOperator ? Math.max(0, currentWeekIndex) : activeWeekIndex;
  const [sending, setSending] = useState(false);
  // 年统计
  const [yearStats, setYearStats] = useState<{ lines: Record<string, number>; staff: Record<string, number> }>({ lines: {}, staff: {} });

  // 加载年统计数据（当前年所有月）
  useEffect(() => {
    (async () => {
      const now = new Date();
      const y = parseInt(year);
      const upToMonth = y === now.getFullYear() ? now.getMonth() + 1 : 12;
      const lineStats: Record<string, number> = {};
      const staffStats: Record<string, number> = { '李庆良': 0, '王艾博': 0 };
      const processedDays = new Set<string>();
      for (let m = 1; m <= upToMonth; m++) {
        try {
          const res = await scheduleApi.list(y, m);
          const weeks = res.data?.weeks || [];
          for (const w of weeks) {
            for (const day of w.days) {
              // 同一天可能出现在多月交界处，去重
              if (processedDays.has(day.date)) continue;
              processedDays.add(day.date);
              LINE_CODES.forEach(lc => {
                if (day.lines[lc]?.status === 1) lineStats[lc] = (lineStats[lc] || 0) + 1;
              });
              // 当天所有线体的上班人员集合
              const dayStaffSet = new Set<string>();
              LINE_CODES.forEach(lc => {
                (day.lines[lc]?.staff || []).forEach((s: string) => dayStaffSet.add(s));
              });
              if (dayStaffSet.has('李庆良')) staffStats['李庆良']++;
              if (dayStaffSet.has('王艾博')) staffStats['王艾博']++;
            }
          }
        } catch (e) { console.error('年统计加载失败 month=' + m, e); }
      }
      setYearStats({ lines: lineStats, staff: staffStats });
    })();
  }, [year]);

  const currentYear = new Date().getFullYear();

  // 加载数据（含 loading 状态，用于切换年月时）
  const fetchData = async (y: string, m: number) => {
    setLoading(true);
    setError('');
    try {
      const res = await scheduleApi.list(parseInt(y), m);
      const loadedWeeks = res.data.weeks || [];
      setWeeks(loadedWeeks);

      // 自动定位到包含今天的周
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const currentIdx = loadedWeeks.findIndex((w: WeekData) => todayStr >= w.weekStart && todayStr <= w.weekEnd);
      setActiveWeekIndex(currentIdx >= 0 ? currentIdx : 0);
    } catch (e: any) {
      setError('加载排班数据失败：' + (e.response?.data?.error || e.message));
    } finally {
      setLoading(false);
    }
  };

  // 静默刷新数据（不带 loading 态，不影响 DOM 和滚动位置）
  const silentReload = async (y: string, m: number) => {
    setError('');
    try {
      const res = await scheduleApi.list(parseInt(y), m);
      const loadedWeeks = res.data.weeks || [];
      setWeeks(loadedWeeks);
    } catch (e: any) {
      setError('刷新排班数据失败：' + (e.response?.data?.error || e.message));
    }
  };

  useEffect(() => {
    fetchData(year, month);
  }, [year, month]);

  // 切换线体状态
  const handleToggle = async (date: string, lineCode: string) => {
    try {
      await scheduleApi.toggle(date, lineCode);
      await silentReload(year, month);
    } catch (e: any) {
      setError('切换状态失败：' + (e.response?.data?.error || e.message));
    }
  };

  // 切换人员排班（保留另一人的状态）
  const handleStaffToggle = async (date: string, name: string, currentlyOn: boolean, allStaff: string[]) => {
    const selected = currentlyOn
      ? allStaff.filter(s => s !== name)
      : [...allStaff, name];
    try {
      for (const lc of LINE_CODES) {
        await scheduleApi.updateStaff(date, lc, selected);
      }
      await silentReload(year, month);
    } catch (e: any) {
      setError('保存人员失败：' + (e.response?.data?.error || e.message));
    }
  };

  const weekLabel = (w: WeekData) => {
    const startDate = new Date(w.weekStart);
    const endDate = new Date(w.weekEnd);
    const sm = startDate.getMonth() + 1;
    const em = endDate.getMonth() + 1;
    const sd = startDate.getDate();
    const ed = endDate.getDate();
    return `${sm}月${sd}日~${em}月${ed}日`;
  };

  // 截图并发送（纯 Canvas 手绘，100% 可靠）
  const handleSendSnapshot = async () => {
    setSending(true);
    try {
      if (!weeks.length || displayWeekIndex >= weeks.length) { setSending(false); return; }
      const week = weeks[displayWeekIndex];
      const days = week.days;
      
      const pad = 16, headerH = 40, rowH = 40, statRowH = 38;
      const colWs = [100, ...LINE_CODES.map(() => 64), 80, 80];
      const cols = ['日期', ...LINE_CODES.map(l => l + '线'), '李庆良', '王艾博'];
      const totalW = colWs.reduce((a, b) => a + b, 0);
      const totalH = headerH + (days.length + 3) * rowH + pad;
      const xCol = (i: number) => colWs.slice(0, i).reduce((a, b) => a + b, 0);
      
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = totalW * scale;
      canvas.height = totalH * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#141E30';
      ctx.fillRect(0, 0, totalW, totalH);
      
      // 表头
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#ff69b4';
      ctx.textAlign = 'center';
      cols.forEach((c, i) => ctx.fillText(c, xCol(i) + colWs[i] / 2, 28));
      
      // 数据行
      const dnow = new Date();
      const todayDate = dnow.toISOString().slice(0, 10);
      const pastCutoff = dnow.getHours() * 60 + dnow.getMinutes() >= 17 * 60 + 50;
      days.forEach((day: any, ri: number) => {
        const y0 = headerH + ri * rowH;
        const dw = new Date(day.date + 'T00:00:00').getDay();
        const isWeekend = dw === 0 || dw === 6;
        const isPast = day.date < todayDate || (day.date === todayDate && pastCutoff);
        const allStaff = new Set<string>();
        LINE_CODES.forEach(lc => (day.lines[lc]?.staff || []).forEach((s: string) => allStaff.add(s)));
        
        // 日期
        ctx.textAlign = 'left';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = isWeekend ? '#faad14' : '#00d4ff';
        ctx.fillText(day.dayLabel, pad, y0 + 22);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#666';
        ctx.fillText(parseInt(day.date.slice(5, 7)) + '-' + day.date.slice(8), pad, y0 + 34);
        
        // 状态圆点
        ctx.textAlign = 'center';
        LINE_CODES.forEach((lc, li) => {
          const isRunning = day.lines[lc]?.status === 1;
          const cx = xCol(li + 1) + colWs[li + 1] / 2;
          const cy = y0 + rowH / 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 9, 0, Math.PI * 2);
          ctx.fillStyle = isRunning ? (isPast ? '#87ceeb' : '#228b22') : '#555';
          ctx.fill();
        });
        
        // 人员
        ['李庆良', '王艾博'].forEach((name, pi) => {
          const sx = xCol(LINE_CODES.length + 1 + pi) + 6;
          const sy = y0 + 6;
          const sw = colWs[LINE_CODES.length + 1 + pi] - 12;
          const sh = rowH - 12;
          ctx.textAlign = 'center';
          if (allStaff.has(name)) {
            ctx.fillStyle = 'rgba(0,180,255,0.25)';
            ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeStyle = 'rgba(0,180,255,0.5)';
            ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
          } else {
            ctx.fillStyle = '#2a2a2a';
            ctx.font = '11px sans-serif';
          }
          ctx.fillText(name, sx + sw / 2, sy + sh / 2 + 4);
        });
      });
      
      // 统计行辅助函数
      const drawStats = (ri: number, label: string, color: string, lines: Record<string,number>, staff: Record<string,number>, unit: string) => {
        const y0 = headerH + (days.length + ri) * rowH;
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = color;
        ctx.fillText(label, pad, y0 + rowH / 2 + 4);
        ctx.textAlign = 'center';
        LINE_CODES.forEach((lc, li) => {
          ctx.fillText((lines[lc] || 0) + unit, xCol(li + 1) + colWs[li + 1] / 2, y0 + rowH / 2 + 4);
        });
        ['李庆良', '王艾博'].forEach((name, pi) => {
          ctx.fillText((staff[name] || 0) + '天', xCol(LINE_CODES.length + 1 + pi) + colWs[LINE_CODES.length + 1 + pi] / 2, y0 + rowH / 2 + 4);
        });
      };
      
      // 周统计
      const wls: Record<string,number> = {};
      LINE_CODES.forEach(lc => { wls[lc] = week.stats?.[lc]?.runDays || 0; });
      const ws: Record<string,number> = { '李庆良': 0, '王艾博': 0 };
      days.forEach(day => { const s = new Set<string>(); LINE_CODES.forEach(lc => (day.lines[lc]?.staff||[]).forEach((n:string)=>s.add(n))); if(s.has('李庆良'))ws['李庆良']++; if(s.has('王艾博'))ws['王艾博']++; });
      drawStats(0, '周统计', '#52c41a', wls, ws, '/' + days.length + '天');
      
      // 月统计
      const mls: Record<string,number> = {};
      const ms: Record<string,number> = { '李庆良': 0, '王艾博': 0 };
      weeks.forEach(w => w.days.forEach((d: any) => {
        LINE_CODES.forEach(lc => { if(d.lines[lc]?.status===1) mls[lc]=(mls[lc]||0)+1; });
        const s = new Set<string>(); LINE_CODES.forEach(lc => (d.lines[lc]?.staff||[]).forEach((n:string)=>s.add(n)));
        if(s.has('李庆良'))ms['李庆良']++; if(s.has('王艾博'))ms['王艾博']++;
      }));
      drawStats(1, '月统计', '#4facfe', mls, ms, '天');
      
      // 年统计
      drawStats(2, '年统计', '#00d4ff', yearStats.lines, yearStats.staff, '天');
      
      // 保存到手机
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      const now = new Date();
      a.download = `排班表_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.png`;
      a.click();
      
      // 发送到企业微信
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      try {
        const res = await fetch('/api/schedule/send-snapshot', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ image: base64 }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await res.json();
        if (res.ok) { alert('✅ 已发送到企业微信'); }
        else if (data.error === '未配置企业微信Webhook地址') { alert('⚠️ 企业微信Webhook未配置'); }
        else { alert('⚠️ 发送失败：' + (data.error || '未知')); }
      } catch (_e: any) { alert('⚠️ 网络异常'); }
    } catch (e: any) {
      alert('截图失败：' + e.message);
    } finally {
      setSending(false);
    }
  };

  // 通用样式
  const thStyle: React.CSSProperties = {
    padding: '12px 6px', textAlign: 'center',
    color: '#ff69b4', fontWeight: 700, fontSize: 18,
    background: 'rgba(0,212,255,0.04)',
    letterSpacing: '0.5px',
  };
  const tdStyle: React.CSSProperties = {
    padding: '6px 4px', textAlign: 'center',
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: 0 }}>
      {/* 页面标题 */}
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: '#e0e0e0', display: 'flex', alignItems: 'center', gap: 10, letterSpacing: '0.5px' }}>
        <span style={{ background: 'linear-gradient(135deg, #00d4ff, #0099ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>设备排班管理</span>
        {isAdmin && (
        <button
          onClick={handleSendSnapshot}
          disabled={sending}
          style={{
            padding: '2px 10px', borderRadius: 6, border: '1px solid rgba(0,212,255,0.4)',
            background: 'rgba(0,212,255,0.08)', color: '#00d4ff', fontSize: 11, cursor: 'pointer',
            lineHeight: 1.4, backdropFilter: 'blur(8px)', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.15)'; e.currentTarget.style.boxShadow = '0 0 12px rgba(0,212,255,0.2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
        >{sending ? '📤 发送中...' : '📤 发送'}</button>
        )}
      </h2>

      {/* 操作员只读提示 */}
      {isOperator && (
        <div style={{
          padding: '8px 16px',
          background: 'rgba(79, 172, 254, 0.1)',
          border: '1px solid rgba(79, 172, 254, 0.25)',
          borderRadius: 8,
          color: '#4facfe',
          fontSize: 13,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span>👁️</span>
          <span>仅查看模式 — 你无权编辑排班状态和人员分配</span>
        </div>
      )}

      {/* 筛选器 + 周导航 */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
        <select
          value={year}
          onChange={e => { setYear(e.target.value); setActiveWeekIndex(0); }}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid rgba(0,212,255,0.2)',
            background: 'rgba(20,36,52,0.6)',
            backdropFilter: 'blur(10px)',
            color: '#b0cdff',
            fontSize: 13,
            outline: 'none',
            minWidth: 90,
          }}
        >
          {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}年</option>)}
        </select>
        <select
          value={month}
          onChange={e => { setMonth(Number(e.target.value)); setActiveWeekIndex(0); }}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            border: '1px solid rgba(0,212,255,0.2)',
            background: 'rgba(20,36,52,0.6)',
            backdropFilter: 'blur(10px)',
            color: '#b0cdff',
            fontSize: 13,
            outline: 'none',
            minWidth: 90,
          }}
        >
          {MONTH_OPTIONS.map(m => <option key={m} value={m}>{m}月</option>)}
        </select>
        </div>

        {/* 周导航 */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
          {!isOperator && (<>
          <button
            onClick={() => setActiveWeekIndex(prev => Math.max(0, prev - 1))}
            disabled={activeWeekIndex <= 0}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid rgba(0,212,255,0.2)',
              background: 'rgba(20,36,52,0.6)',
              backdropFilter: 'blur(10px)',
              color: activeWeekIndex <= 0 ? '#2a2a3a' : '#b0cdff',
              fontSize: 14, cursor: activeWeekIndex <= 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ◀
          </button>

          <span style={{
            padding: '6px 18px', fontSize: 15, fontWeight: 700,
            color: '#00d4ff',
            background: 'rgba(0,212,255,0.08)',
            borderRadius: 8, border: '1px solid rgba(0,212,255,0.25)',
            whiteSpace: 'nowrap', boxShadow: '0 0 16px rgba(0,212,255,0.08)',
          }}>
            <span className="week-prefix">第 </span>{weeks[displayWeekIndex] ? weeks[displayWeekIndex].weekNumber : '--'} 周
          </span>

          <button
            onClick={() => setActiveWeekIndex(prev => Math.min(weeks.length - 1, prev + 1))}
            disabled={activeWeekIndex >= weeks.length - 1}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid rgba(0,212,255,0.2)',
              background: 'rgba(20,36,52,0.6)',
              backdropFilter: 'blur(10px)',
              color: activeWeekIndex >= weeks.length - 1 ? '#2a2a3a' : '#b0cdff',
              fontSize: 14, cursor: activeWeekIndex >= weeks.length - 1 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            ▶
          </button>

          <button
            className="back-today-btn"
            onClick={() => {
              const now = new Date();
              setYear(now.getFullYear().toString());
              setMonth(now.getMonth() + 1);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              marginLeft: 4,
              border: '1px solid var(--accent-cyan, #00d4ff)',
              background: 'rgba(0, 212, 255, 0.1)',
              color: 'var(--accent-cyan, #00d4ff)',
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 212, 255, 0.2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0, 212, 255, 0.1)')}
          >
            回到本月
          </button>
          </>)}
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{
          padding: '10px 16px',
          background: 'rgba(255, 71, 87, 0.15)',
          border: '1px solid rgba(255, 71, 87, 0.3)',
          borderRadius: 8,
          color: '#ff6b7a',
          fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* 加载中 */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>加载排班数据中...</div>
        </div>
      )}

      {/* 排班表格 */}
      {!loading && weeks.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div>该月暂无排班数据</div>
        </div>
      )}

      {!loading && weeks.length > 0 && weeks[displayWeekIndex] && (() => {
        const week = weeks[displayWeekIndex];

        // 月统计汇总
        const monthLineStats: Record<string, number> = {};
        const monthStaffDays: Record<string, number> = { '李庆良': 0, '王艾博': 0 };
        weeks.forEach(w => {
          w.days.forEach(day => {
            LINE_CODES.forEach(lc => {
              if (day.lines[lc]?.status === 1) {
                monthLineStats[lc] = (monthLineStats[lc] || 0) + 1;
              }
            });
            // 统计当天所有线体的人员
            const dayStaff: string[] = [];
            LINE_CODES.forEach(lc => {
              (day.lines[lc]?.staff || []).forEach(s => {
                if (!dayStaff.includes(s)) dayStaff.push(s);
              });
            });
            if (dayStaff.includes('李庆良')) monthStaffDays['李庆良']++;
            if (dayStaff.includes('王艾博')) monthStaffDays['王艾博']++;
          });
        });

        return (
        <div
          key={week.weekStart}
          className="card"
          style={{
            borderRadius: 16, overflow: 'hidden', marginBottom: 20,
            background: 'rgba(20,36,52,0.6)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(0,212,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 60px rgba(0,212,255,0.04)',
          }}
        >
          {/* 周标题 */}
          <div style={{
            padding: '14px 20px',
            background: 'linear-gradient(135deg, rgba(0,212,255,0.08), rgba(0,136,204,0.04))',
            borderBottom: '1px solid rgba(0,212,255,0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#e0e0e0' }}>
              <span className="week-prefix">第 </span>{week.weekNumber} 周
              <span className="week-date-range" style={{ fontSize: 13, color: '#888', marginLeft: 8, fontWeight: 400 }}>
                ({weekLabel(week)})
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span><span style={{ color: '#52c41a' }}>●</span> 运行中{' '}<span style={{ color: '#666', marginLeft: 8 }}>○</span> 停线</span>
              <span style={{ color: '#555' }}>|</span>
              <span><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: 'rgba(82,196,26,0.5)', verticalAlign: 'middle', marginRight: 4 }}></span>上班</span>
              <span><span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: 'rgba(255,255,255,0.1)', verticalAlign: 'middle', marginRight: 4 }}></span>休息</span>
              <span style={{ color: '#555' }}>|</span>
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const todayStaff: string[] = [];
                if (weeks[displayWeekIndex]) {
                  for (const day of weeks[displayWeekIndex].days) {
                    if (day.date === today) {
                      const set = new Set<string>();
                      LINE_CODES.forEach(lc => (day.lines[lc]?.staff || []).forEach((s: string) => set.add(s)));
                      todayStaff.push(...Array.from(set));
                      break;
                    }
                  }
                }
                if (todayStaff.length === 0) return <span style={{ color: '#666', fontSize: 12 }}>今日无人排班</span>;
                const phones: Record<string, string> = { '李庆良': '13006300420', '王艾博': '17740651897' };
                return todayStaff.map(name => (
                  <a key={name} href={`tel:${phones[name]}`} style={{ color: '#00d4ff', textDecoration: 'none', fontSize: 12 }}>
                    📞 {name} {phones[name]}
                  </a>
                ));
              })()}
            </div>
          </div>

          {/* 表格 - 桌面端 */}
          <div className="schedule-table-desktop" style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 20,
              minWidth: 600,
              border: 'none',
            }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, background: '#0a1428', position: 'sticky', left: 0, zIndex: 2 }}>日期</th>
                  {LINE_CODES.map(lc => (
                    <th key={lc} style={thStyle}>{LINE_LABELS[lc]}</th>
                  ))}
                  <th style={{ ...thStyle, minWidth: 100 }} colSpan={2}>设备人员排班</th>
                </tr>
              </thead>
              <tbody>
                {week.days.map(day => {
                  // 当天突出显示
                  const todayDate = new Date().toISOString().slice(0, 10);
                  const nowTime = new Date();
                  const pastCutoff = nowTime.getHours() * 60 + nowTime.getMinutes() >= 17 * 60 + 50;
                  const isToday = day.date === todayDate && !pastCutoff;
                  const isPast = day.date < todayDate || (day.date === todayDate && pastCutoff);
                  const canEdit = isSuperAdmin || !isPast; // 超管可改任意，其他只能改今天及以后
                  // 合并当天所有线体的人员
                  const allStaff: string[] = [];
                  LINE_CODES.forEach(lc => {
                    (day.lines[lc]?.staff || []).forEach(s => {
                      if (!allStaff.includes(s)) allStaff.push(s);
                    });
                  });
                  return (
                    <tr key={day.date}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: '#aaa', position: 'sticky', left: 0, background: '#0a1428', zIndex: 1 }}>
                        {(() => {
                          const dw = new Date(day.date + 'T00:00:00').getDay();
                          const isWeekend = dw === 0 || dw === 6;
                          const labelColor = isWeekend ? '#faad14' : '#00d4ff';
                          return (
                            <>
                              <div style={{ color: labelColor, fontSize: 18 }}>{day.dayLabel}</div>
                              <div style={{ fontSize: 15, color: '#666' }}>{parseInt(day.date.slice(5, 7))}-{day.date.slice(8)}</div>
                            </>
                          );
                        })()}
                      </td>
                      {LINE_CODES.map(lc => {
                        const lineData = day.lines[lc];
                        const isRunning = lineData?.status === 1;
                        const iconColor = isRunning
                          ? (isPast ? '#87ceeb' : '#228b22')
                          : '#555';
                        const animStyle = (isRunning && isToday)
                          ? { animation: 'pulse-green 1.5s ease-in-out infinite' } : {};
                        return (
                          <td key={lc} style={tdStyle}>
                            <div
                              className="status-dot-cell"
                              onClick={() => !isOperator && canEdit && handleToggle(day.date, lc)}
                              title={isOperator ? '仅查看' : (!canEdit ? '仅超管可修改过往排班' : (isRunning ? '运行中 - 点击停线' : '停线 - 点击运行'))}
                              style={{
                                width: 36, height: 36, borderRadius: '50%', margin: '0 auto',
                                background: 'transparent',
                                cursor: (!isOperator && canEdit) ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                ...animStyle,
                              }}
                              onMouseEnter={e => {
                                if (isOperator || !canEdit) return;
                                e.currentTarget.style.opacity = '0.8';
                              }}
                              onMouseLeave={e => {
                                if (isOperator || !canEdit) return;
                                e.currentTarget.style.opacity = '1';
                              }}
                            >
                              <span style={{ fontSize: 30, color: iconColor, textShadow: `0 0 12px ${iconColor}` }}>●</span>
                            </div>
                          </td>
                        );
                      })}
                      {/* 人员1 - 李庆良 */}
                      <td style={{ ...tdStyle, width: 70 }}>
                        {(() => {
                          const isOn = allStaff.includes('李庆良');
                          if (!isOn) {
                            return (
                              <div
                                onClick={() => !isOperator && canEdit && handleStaffToggle(day.date, '李庆良', false, allStaff)}
                                style={{ padding: '4px 0', color: '#2a2a2a', fontSize: 13, textAlign: 'center', cursor: (!isOperator && canEdit) ? 'pointer' : 'default' }}
                              >李庆良</div>
                            );
                          }
                          const staffBg = 'rgba(0,180,255,0.25)';
                          const staffBorder = '1px solid rgba(0,180,255,0.5)';
                          const staffAnim = isToday ? { animation: 'pulse-green 1.5s ease-in-out infinite' } : {};
                          return (
                            <div
                              onClick={() => !isOperator && canEdit && handleStaffToggle(day.date, '李庆良', true, allStaff)}
                              title="李庆良 - 上班（点击切换）"
                              style={{
                                padding: '4px 0',
                                borderRadius: 6,
                                cursor: (!isOperator && canEdit) ? 'pointer' : 'default',
                                background: staffBg,
                                border: staffBorder,
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 15,
                                letterSpacing: 1,
                                textAlign: 'center',
                                ...staffAnim,
                              }}
                            >
                              李庆良
                            </div>
                          );
                        })()}
                      </td>
                      {/* 人员2 - 王艾博 */}
                      <td style={{ ...tdStyle, width: 70 }}>
                        {(() => {
                          const isOn = allStaff.includes('王艾博');
                          if (!isOn) {
                            return (
                              <div
                                onClick={() => !isOperator && canEdit && handleStaffToggle(day.date, '王艾博', false, allStaff)}
                                style={{ padding: '4px 0', color: '#2a2a2a', fontSize: 13, textAlign: 'center', cursor: (!isOperator && canEdit) ? 'pointer' : 'default' }}
                              >王艾博</div>
                            );
                          }
                          const staffBg = 'rgba(0,180,255,0.25)';
                          const staffBorder = '1px solid rgba(0,180,255,0.5)';
                          const staffAnim = isToday ? { animation: 'pulse-green 1.5s ease-in-out infinite' } : {};
                          return (
                            <div
                              onClick={() => !isOperator && canEdit && handleStaffToggle(day.date, '王艾博', true, allStaff)}
                              title="王艾博 - 上班（点击切换）"
                              style={{
                                padding: '4px 0',
                                borderRadius: 6,
                                cursor: (!isOperator && canEdit) ? 'pointer' : 'default',
                                background: staffBg,
                                border: staffBorder,
                                color: '#fff',
                                fontWeight: 600,
                                fontSize: 15,
                                letterSpacing: 1,
                                textAlign: 'center',
                                ...staffAnim,
                              }}
                            >
                              王艾博
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
                {/* 统计行 */}
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#7ecfff', fontSize: 16, position: 'sticky', left: 0, background: '#0a1428', zIndex: 1 }}>周统计</td>
                  {LINE_CODES.map(lc => (
                    <td key={lc} style={{ ...tdStyle, color: '#aaa', fontSize: 13 }}>
                      <span style={{ color: '#52c41a', fontWeight: 600 }}>{week.stats?.[lc]?.runDays || 0}</span>
                      <span style={{ color: '#555' }}>/{week.days.length}天</span>
                    </td>
                  ))}
                  <td style={{ ...tdStyle, color: '#52c41a', fontSize: 13 }}>
                    {(() => {
                      let days = 0;
                      week.days.forEach(day => {
                        const staff = new Set<string>();
                        LINE_CODES.forEach(lc => (day.lines[lc]?.staff || []).forEach((s: string) => staff.add(s)));
                        if (staff.has('李庆良')) days++;
                      });
                      return `${days}/5天`;
                    })()}
                  </td>
                  <td style={{ ...tdStyle, color: '#52c41a', fontSize: 13 }}>
                    {(() => {
                      let days = 0;
                      week.days.forEach(day => {
                        const staff = new Set<string>();
                        LINE_CODES.forEach(lc => (day.lines[lc]?.staff || []).forEach((s: string) => staff.add(s)));
                        if (staff.has('王艾博')) days++;
                      });
                      return `${days}/5天`;
                    })()}
                  </td>
                </tr>
                {/* 月统计行 */}
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#4facfe', fontSize: 16, position: 'sticky', left: 0, background: '#0a1428', zIndex: 1 }}>月统计</td>
                  {LINE_CODES.map(lc => (
                    <td key={lc} style={{ ...tdStyle, color: '#aaa', fontSize: 13 }}>
                      <span style={{ color: '#4facfe', fontWeight: 600 }}>{monthLineStats[lc] || 0}</span>
                      <span style={{ color: '#555' }}> 天</span>
                    </td>
                  ))}
                  <td style={{ ...tdStyle, color: '#4facfe', fontSize: 13 }}>{monthStaffDays['李庆良']}天</td>
                  <td style={{ ...tdStyle, color: '#4facfe', fontSize: 13 }}>{monthStaffDays['王艾博']}天</td>
                </tr>
                {/* 年统计行 */}
                <tr>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#00d4ff', fontSize: 16, position: 'sticky', left: 0, background: '#0a1428', zIndex: 1 }}>年统计</td>
                  {LINE_CODES.map(lc => (
                    <td key={lc} style={{ ...tdStyle, color: '#aaa', fontSize: 13 }}>
                      <span style={{ color: '#00d4ff', fontWeight: 600 }}>{yearStats.lines[lc] || 0}</span>
                      <span style={{ color: '#555' }}> 天</span>
                    </td>
                  ))}
                  <td style={{ ...tdStyle, color: '#00d4ff', fontSize: 13 }}>{yearStats.staff['李庆良'] || 0}天</td>
                  <td style={{ ...tdStyle, color: '#00d4ff', fontSize: 13 }}>{yearStats.staff['王艾博'] || 0}天</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      );
      })()}

      {/* 响应式样式 */}
      <style>{`
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 6px rgba(34,139,34,0.4); }
          50% { box-shadow: 0 0 18px rgba(34,139,34,0.9), 0 0 30px rgba(34,139,34,0.3); }
        }
        .staff-phone-link { transition: transform 0.15s; }
        .staff-phone-link:hover { transform: scale(1.2); }
        @media (max-width: 768px) {
          .schedule-table-desktop { display: block !important; }
          .week-date-range { display: none; }
          .stop-icon { display: none; }
          .week-prefix { display: none; }
          .back-today-btn { display: none; }
          .schedule-table-desktop table { font-size: 11px !important; min-width: auto !important; }
          .schedule-table-desktop th { font-size: 10px !important; padding: 4px 1px !important; }
          .schedule-table-desktop td { padding: 8px 1px !important; font-size: 10px !important; }
        }
        @media (min-width: 769px) {
          .status-dot-cell { width: 44px !important; height: 44px !important; }
          .status-dot-cell span { font-size: 30px !important; }
        }
        /* 表格完全扁平化：无视边框、背景、阴影 */
        .schedule-table-desktop table { border: none; }
        .schedule-table-desktop th,
        .schedule-table-desktop td { border: none !important; background: transparent !important; }
        .schedule-table-desktop tr { background: transparent !important; border: none !important; }
        .schedule-table-desktop tr:hover,
        .schedule-table-desktop tr:active,
        .schedule-table-desktop tr:focus { background: transparent !important; }
        .schedule-table-desktop td:hover,
        .schedule-table-desktop td:active,
        .schedule-table-desktop td:focus { background: transparent !important; }
        .schedule-table-desktop * { outline: none !important; -webkit-tap-highlight-color: transparent !important; }
        .schedule-table-desktop *:focus,
        .schedule-table-desktop *:focus-visible { outline: none !important; box-shadow: none !important; border-color: inherit !important; }
        .schedule-table-desktop *::selection { background: transparent !important; }
        .schedule-table-desktop td, .schedule-table-desktop th, .schedule-table-desktop div {
          -webkit-user-select: none; user-select: none;
        }
      `}</style>
    </div>
  );
}
