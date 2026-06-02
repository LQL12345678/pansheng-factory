import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { repairApi, scheduleApi } from '../services/api';

interface ZoneData {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  pendingCount: number;
  repairingCount: number;
  status: 'normal' | 'repairing' | 'alert';
}

// 4线 × 4段 = 16热区，宽度比例 13:12:10:11，viewBox = "0 0 46 20"
const ZONES_CONFIG: ZoneData[] = [
  // 1线 (y: 0-5)
  { id: '1线-装配段1', label: '1线-装配段1', x: 0,  y: 0,  w: 13, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '1线-装配段2', label: '1线-装配段2', x: 13, y: 0,  w: 12, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '1线-老化房',  label: '1线-老化房',  x: 25, y: 0,  w: 10, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '1线-后测段',  label: '1线-后测段',  x: 35, y: 0,  w: 11, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  // 2线 (y: 5-10)
  { id: '2线-装配段1', label: '2线-装配段1', x: 0,  y: 5,  w: 13, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '2线-装配段2', label: '2线-装配段2', x: 13, y: 5,  w: 12, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '2线-老化房',  label: '2线-老化房',  x: 25, y: 5,  w: 10, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '2线-后测段',  label: '2线-后测段',  x: 35, y: 5,  w: 11, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  // 3线 (y: 10-15)
  { id: '3线-装配段1', label: '3线-装配段1', x: 0,  y: 10, w: 13, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '3线-装配段2', label: '3线-装配段2', x: 13, y: 10, w: 12, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '3线-老化房',  label: '3线-老化房',  x: 25, y: 10, w: 10, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '3线-后测段',  label: '3线-后测段',  x: 35, y: 10, w: 11, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  // 4线 (y: 15-20)
  { id: '4线-装配段1', label: '4线-装配段1', x: 0,  y: 15, w: 13, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '4线-装配段2', label: '4线-装配段2', x: 13, y: 15, w: 12, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '4线-老化房',  label: '4线-老化房',  x: 25, y: 15, w: 10, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
  { id: '4线-后测段',  label: '4线-后测段',  x: 35, y: 15, w: 11, h: 5, pendingCount: 0, repairingCount: 0, status: 'normal' },
];

export default function ZoneMap() {
  const navigate = useNavigate();
  const [zones, setZones] = useState<ZoneData[]>(ZONES_CONFIG);
  const [hoveredZone, setHoveredZone] = useState<string | null>(null);
  const [runningLines, setRunningLines] = useState<number[]>([]); // 运行中的线号 [1,2,3,4]

  const loadZoneStats = useCallback(async () => {
    try {
      const res = await repairApi.zoneStats();
      if (res.data) {
        setZones(prev => prev.map(z => {
          const d = (res.data as ZoneData[]).find((r: ZoneData) => r.id === z.id);
          return d ? { ...z, ...d } : z;
        }));
      }
    } catch (e) {
      console.error('加载区域统计失败:', e);
    }
  }, []);

  // 获取当天排班状态，确定运行线体
  const loadScheduleStatus = useCallback(async () => {
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const res = await scheduleApi.list(now.getFullYear(), now.getMonth() + 1);
      const weeks = res.data?.weeks || [];
      // A→1, B→2, C→3, D→4
      const lineMap: Record<string, number> = { A: 1, B: 2, C: 3, D: 4 };
      const running: number[] = [];
      for (const w of weeks) {
        for (const day of w.days) {
          if (day.date === today) {
            for (const lc of ['A','B','C','D']) {
              if (day.lines[lc]?.status === 1) running.push(lineMap[lc]);
            }
            break;
          }
        }
      }
      setRunningLines(running);
    } catch (e) {
      // 静默处理
    }
  }, []);

  useEffect(() => {
    loadZoneStats();
    loadScheduleStatus();

    // 定时刷新 - 每15秒拉取
    const timer = setInterval(() => { loadZoneStats(); loadScheduleStatus(); }, 5000);

    // 页面可见时立即刷新 - 切回标签页时
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadZoneStats();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 监听自定义事件 - 工单状态变化时即时刷新
    const handleZoneStatsUpdate = () => loadZoneStats();
    window.addEventListener('zone-stats-updated', handleZoneStatsUpdate);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('zone-stats-updated', handleZoneStatsUpdate);
    };
  }, [loadZoneStats]);

  const handleClick = (zoneId: string) => {
    const dashIdx = zoneId.indexOf('-');
    const line = dashIdx > 0 ? zoneId.slice(0, dashIdx) : '';
    const area = dashIdx > 0 ? zoneId.slice(dashIdx + 1) : zoneId;
    navigate(`/repairs?line=${encodeURIComponent(line)}&area=${encodeURIComponent(area)}`);
  };

  const getFill = (status: string) => {
    if (status === 'alert') return 'rgba(255, 77, 79, 0.55)';
    if (status === 'repairing') return 'rgba(255, 165, 0, 0.55)';
    return 'transparent';
  };

  return (
    <div className="zone-map-container" style={{ marginBottom: '12px' }}>
      {/* 标题栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>🏭</span>线体状态监控
        </h3>
        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ffa500', display: 'inline-block' }}></span>处理中
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff4d4f', display: 'inline-block' }}></span>待处理
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glow)' }}>
        {/* 背景图片 */}
        <img src="/zone-map.jpg" alt="设备布局图" style={{ width: '100%', height: 'auto', display: 'block' }} />

          {/* SVG 热区 */}
        <svg
          viewBox="0 0 46 20"
          preserveAspectRatio="none"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          {zones.map(zone => {
            const isAlert = zone.status === 'alert';
            return (
              <g key={zone.id}>
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  fill={getFill(zone.status)}
                  stroke="none"
                  style={{
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    transition: 'fill 0.3s',
                    animation: isAlert ? 'zonePulse 1.5s ease-in-out infinite' : 'none',
                  }}
                  onClick={() => handleClick(zone.id)}
                  onMouseEnter={() => setHoveredZone(zone.id)}
                  onMouseLeave={() => setHoveredZone(null)}
                />
                {/* 极细流动边线 */}
                <rect
                  x={zone.x}
                  y={zone.y}
                  width={zone.w}
                  height={zone.h}
                  fill="none"
                  stroke="rgba(0,200,255,0.15)"
                  strokeWidth="0.08"
                  strokeDasharray="0.6 1.2"
                  style={{ pointerEvents: 'none' }}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-3.6"
                    dur="3s"
                    repeatCount="indefinite"
                  />
                </rect>
                {/* 区域名（底部对齐，略微上移） */}
                <text
                  x={zone.x + zone.w / 2}
                  y={zone.y + zone.h - 0.5}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.85)"
                  fontSize="0.55"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}
                >
                  {zone.label}
                </text>
                {/* 待处理数量徽标 */}
                {zone.pendingCount > 0 && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect
                      x={zone.x + zone.w - 2.0}
                      y={zone.y + zone.h - 1.8}
                      width="1.6"
                      height="1.2"
                      rx="0.3"
                      fill="#ff4d4f"
                    />
                    <text
                      x={zone.x + zone.w - 1.2}
                      y={zone.y + zone.h - 1.2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize="0.5"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none' }}
                    >
                      {zone.pendingCount > 99 ? '99+' : zone.pendingCount}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 运行线体流动箭头 — lineHeights: [2.5, 7.5, 12.5, 17.5] */}
          <defs>
            <marker id="arrowHead" markerWidth="4" markerHeight="3" refX="2" refY="1.5" orient="auto">
              <polygon points="0,0 4,1.5 0,3" fill="#4cb81e" />
            </marker>
          </defs>
          {runningLines.map(lineNum => {
            const baseY = (lineNum - 1) * 5 + 2.4;
            const yOffsets: Record<number, number> = { 1: 0.25, 2: 0.1 };
            const y = baseY + (yOffsets[lineNum] || 0);
            return (
              <g key={`flow-${lineNum}`}>
                <line
                  x1="1" y1={y} x2="45" y2={y}
                  stroke="#4cb81e"
                  strokeWidth="0.15"
                  strokeDasharray="0.8 1.2"
                  strokeLinecap="round"
                  markerStart="url(#arrowHead)"
                  markerMid="url(#arrowHead)"
                  markerEnd="url(#arrowHead)"
                  style={{ pointerEvents: 'none' }}
                >
                  <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </line>
              </g>
            );
          })}
        </svg>

        {/* Tooltip */}
        {hoveredZone && (() => {
          const zone = zones.find(z => z.id === hoveredZone);
          if (!zone) return null;
          const titleColor = zone.status === 'alert' ? '#ff4d4f' : zone.status === 'repairing' ? '#ffa500' : 'var(--text-primary)';
          return (
            <div
              style={{
                position: 'absolute',
                top: `${(zone.y / 20) * 100 - 10}%`,
                left: `${(zone.x / 46) * 100 + (zone.w / 46) * 100 / 2 - 10}%`,
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid var(--border-glow)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                color: 'var(--text-primary)',
                whiteSpace: 'pre-line',
                zIndex: 100,
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                pointerEvents: 'none',
                minWidth: '150px',
              }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: titleColor }}>{zone.label}</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.7', fontSize: '12px' }}>
                {zone.status === 'alert' && `⚠️ 待处理工单: ${zone.pendingCount} 条`}
                {zone.status === 'repairing' && `🔧 处理中工单: ${zone.repairingCount} 条`}
                {zone.status === 'normal' && '✅ 暂无待处理工单'}
              </div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '6px' }}>点击查看该区域工单 →</div>
            </div>
          );
        })()}
      </div>

      <style>{`
        @keyframes zonePulse {
          0%   { stroke-opacity: 1;   fill-opacity: 0.55; }
          50%  { stroke-opacity: 0.3; fill-opacity: 0.2;  }
          100% { stroke-opacity: 1;   fill-opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
