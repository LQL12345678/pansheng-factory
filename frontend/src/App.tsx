import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import DeviceList from './pages/DeviceList';
import RepairList from './pages/RepairList';
import PartList from './pages/PartList';
import MaintenancePlan from './pages/MaintenancePlan';
import ToolList from './pages/ToolList';
import StatsDashboard from './pages/StatsDashboard';
import Cockpit from './pages/Cockpit';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import UserManagement from './pages/UserManagement';
import NotificationSettings from './pages/NotificationSettings';
import ImprovementList from './pages/ImprovementList';
import SchedulePage from './pages/SchedulePage';
import InspectionList from './pages/InspectionList';
import InspectionCheckIn from './pages/InspectionCheckIn';
import { useAuth } from './hooks/useAuth';

const navs: [string, string, string][] = [
  ['/', '系统首页', '🏠'],
  ['/cockpit', '管理看板', '🖥️'],
  ['/devices', '设备台账', '📋'],
  ['/tools', '工具台账', '🛠️'],
  ['/parts', '库存管理', '🧩'],
  ['/repairs', '维修记录', '🔧'],
  ['/schedule', '设备排班', '📅'],
  ['/improvements', '现场改善', '💡'],
  ['/inspections', '值班巡查', '🔍'],
  ['/maintenance', '保养计划', '📅'],
  ['/stats', '绩效数据', '📊'],
];

// 操作员可见的导航（仅首页和设备排班）
const operatorNavs: [string, string, string][] = [
  ['/', '系统首页', '🏠'],
  ['/cockpit', '管理看板', '🖥️'],
  ['/schedule', '设备排班', '📅'],
];

// 移动端Tab导航配置
const mobileTabs: [string, string, string][] = [
  ['/', '系统首页', '🏠'],
  ['/repairs', '工单', '📋'],
  ['/improvements', '改善', '💡'],
  ['/inspections', '巡查', '🔍'],
  ['/parts', '物品', '🧩'],
  ['/schedule', '排班', '📅'],
  ['/stats', '数据', '📊'],
];

// 操作员移动端Tab（仅首页和排班）
const operatorMobileTabs: [string, string, string][] = [
  ['/', '系统首页', '🏠'],
  ['/schedule', '排班', '📅'],
];

// ===== 网络状态提示组件 =====
function NetworkStatusBanner({ isConnected }: { isConnected: boolean }) {
  if (isConnected) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      background: 'linear-gradient(135deg, #ff6b6b 0%, #ff4757 100%)',
      color: '#fff',
      padding: '12px 20px',
      textAlign: 'center',
      fontSize: '14px',
      zIndex: 9999,
      boxShadow: '0 2px 10px rgba(255, 71, 87, 0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
    }}>
      <span style={{ fontSize: '18px' }}>📡</span>
      <span>服务器连接已断开，请检查网络或确保电脑处于开机状态</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.3)',
          color: '#fff',
          padding: '4px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '12px',
          marginLeft: '10px',
        }}
      >
        重试
      </button>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(
    window.innerWidth > 768
  );
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const { user, isSuperAdmin, isOperator, logout, checkAuth, isConnected } = useAuth();

  // 修改密码弹窗
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [pwdError, setPwdError] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    if (!pwdForm.oldPassword) { setPwdError('请输入旧密码'); return; }
    if (!pwdForm.newPassword || pwdForm.newPassword.length < 6) { setPwdError('新密码至少6位'); return; }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) { setPwdError('两次密码不一致'); return; }
    setPwdSubmitting(true);
    try {
      const res = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.error || '修改失败'); return; }
      setShowPasswordModal(false);
      setPwdForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      alert('密码修改成功');
    } catch (err: any) {
      setPwdError(err.message || '网络错误');
    } finally {
      setPwdSubmitting(false);
    }
  };

  // 同步全屏状态
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 切换全屏
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn('全屏切换失败', e);
    }
  };

  // 页面加载时验证会话
  useEffect(() => {
    checkAuth();
  }, []);

  // 操作员路由守卫：只能访问首页和设备排班
  useEffect(() => {
    if (isOperator && pathname !== '/' && pathname !== '/schedule') {
      window.location.href = '/';
    }
  }, [isOperator, pathname]);

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 页面滚动进度
  useEffect(() => {
    const handleScroll = () => {
      if (isDragging) return; // 拖拽中不更新
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (scrollHeight > 0) {
        setScrollProgress(Math.min(scrollTop / scrollHeight, 1));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isDragging]);

  // 拖拽鼠标移出滑块区也能跟随
  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollTrackRef.current) return;
      const rect = scrollTrackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min((e.clientY - rect.top) / rect.height, 1));
      setScrollProgress(ratio);
      const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      window.scrollTo({ top: scrollHeight * ratio, behavior: 'auto' });
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  // 根据角色过滤导航
  const filteredNavs = isOperator ? operatorNavs : navs;
  const filteredMobileTabs = isOperator ? operatorMobileTabs : mobileTabs;

  // 判断是否需要显示登录页（未登录且不在登录页）
  const showLogin = !user && pathname !== '/login';

  // 未登录时显示登录页
  if (showLogin) {
    return (
      <>
        <NetworkStatusBanner isConnected={isConnected} />
        <LoginPage />
      </>
    );
  }

  // 登录页不再需要（已登录用户访问登录页自动跳转）
  if (pathname === '/login') {
    window.location.href = '/';
    return null;
  }

  return (
    <>
      {/* 网络状态提示 */}
      <NetworkStatusBanner isConnected={isConnected} />
      <div className="app-layout" style={{ paddingTop: isConnected ? 0 : '44px' }}>
      {/* 顶部栏 */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="menu-toggle" onClick={toggleSidebar}>
            <span className="menu-icon">☰</span>
          </button>
          <h1 className="logo">⚙️ 攀升工厂设备管理系统</h1>
        </div>
        <div className="topbar-right">
          {/* 全屏按钮 */}
          <button className="fullscreen-btn" onClick={toggleFullscreen} title={isFullscreen ? '退出全屏' : '进入全屏'}>
            {isFullscreen ? '📺' : '🖥️'}
          </button>
          {/* 用户信息 */}
          <div className="user-info">
            <span className="user-name">{user?.username}</span>
            <span className={`role-tag ${user?.role}`}>
              {user?.roleName}
            </span>
          </div>
          {/* 用户管理入口（仅超级管理员可见） */}
          {isSuperAdmin && (
            <>
              <Link to="/notifications" className="user-manage-btn">
                📱 通知设置
              </Link>
              <Link to="/users" className="user-manage-btn">
                👥 用户管理
              </Link>
            </>
          )}
          {/* 修改密码 */}
          <button className="change-pwd-btn" onClick={() => { setPwdError(''); setPwdForm({ oldPassword: '', newPassword: '', confirmPassword: '' }); setShowPasswordModal(true); }}>
            🔑 <span className="btn-text">修改密码</span>
          </button>
          {/* 退出按钮 */}
          <button className="logout-btn" onClick={logout}>
            🚪 <span className="btn-text">退出</span>
          </button>
        </div>
      </header>

      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'}`}>
        {/* 侧边栏遮罩 - 仅移动端 */}
        {isMobile && sidebarOpen && <div className="sidebar-overlay" onClick={closeSidebar} />}

        {/* 侧边栏 */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <span>导航菜单</span>
            <button className="sidebar-close" onClick={closeSidebar}>✕</button>
          </div>
          <nav className="sidebar-nav">
            {filteredNavs.map(([p, l, icon]) => (
              <Link
                key={p}
                to={p}
                className={`nav-item ${isActive(p as string) ? 'active' : ''}`}
                onDoubleClick={closeSidebar}
                title="双击收起侧边栏，内容区全屏显示"
              >
                <span className="nav-icon">{icon}</span>
                <span className="nav-label">{l}</span>
              </Link>
            ))}
          </nav>
        </aside>

        {/* 主内容区 */}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/devices/*" element={<DeviceList />} />
            <Route path="/repairs/*" element={<RepairList />} />
            <Route path="/tools/*" element={<ToolList />} />
            <Route path="/parts/*" element={<PartList />} />
            <Route path="/maintenance/*" element={<MaintenancePlan />} />
            <Route path="/stats" element={<StatsDashboard />} />
            <Route path="/cockpit" element={<Cockpit />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/notifications" element={<NotificationSettings />} />
            <Route path="/improvements" element={<ImprovementList />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/inspections" element={<InspectionList />} />
            <Route path="/inspections/check-in" element={<InspectionCheckIn />} />
          </Routes>
        </main>
      </div>

      {/* 移动端底部Tab导航 */}
      {isMobile && (
        <nav className="mobile-tab-nav">
          {filteredMobileTabs.map(([path, label, icon]) => {
            return (
              <Link
                key={path}
                to={path}
                className={`mobile-tab-item ${isActive(path) ? 'active' : ''}`}
              >
                <span className="mobile-tab-icon">{icon}</span>
                <span className="mobile-tab-label">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* 右侧滚动进度条 */}
      {!isMobile && (
        <div
          ref={scrollTrackRef}
          className="scroll-progress-track"
          onMouseDown={(e) => {
            setIsDragging(true);
            if (!scrollTrackRef.current) return;
            const rect = scrollTrackRef.current.getBoundingClientRect();
            const ratio = Math.max(0, Math.min((e.clientY - rect.top) / rect.height, 1));
            setScrollProgress(ratio);
            const scrollHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            window.scrollTo({ top: scrollHeight * ratio, behavior: 'auto' });
          }}
          title={`页面滚动 ${Math.round(scrollProgress * 100)}%`}
        >
          <div
            className="scroll-progress-thumb"
            style={{ height: `${Math.max(scrollProgress * 100, 0)}%` }}
          />
          <div
            className="scroll-progress-knob"
            style={{ bottom: `${(1 - scrollProgress) * 100}%` }}
          />
        </div>
      )}

      <style>{`
        .topbar-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
        .user-name {
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
        .role-tag {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
        }
        .role-tag.super_admin {
          background: rgba(255, 215, 0, 0.2);
          color: #ffd700;
        }
        .role-tag.admin {
          background: rgba(79, 172, 254, 0.2);
          color: #4facfe;
        }
        .role-tag.user {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
        }
        .role-tag.operator {
          background: rgba(82, 196, 26, 0.2);
          color: #52c41a;
        }
        .user-manage-btn {
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          text-decoration: none;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          transition: all 0.2s;
        }
        .user-manage-btn:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
        .logout-btn {
          background: rgba(255, 71, 87, 0.2);
          border: 1px solid rgba(255, 71, 87, 0.3);
          color: #ff6b7a;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .logout-btn:hover {
          background: rgba(255, 71, 87, 0.3);
        }
        .change-pwd-btn {
          background: rgba(79, 172, 254, 0.15);
          border: 1px solid rgba(79, 172, 254, 0.3);
          color: #4facfe;
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }
        .change-pwd-btn:hover {
          background: rgba(79, 172, 254, 0.25);
        }
        .fullscreen-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          line-height: 1;
        }
        .fullscreen-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
        }

        /* 右侧滚动进度条 */
        .scroll-progress-track {
          position: fixed;
          right: 0;
          top: 60px;
          width: 6px;
          height: calc(100vh - 60px);
          background: rgba(255, 255, 255, 0.06);
          cursor: pointer;
          z-index: 999;
          transition: background 0.2s;
        }
        .scroll-progress-track:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .scroll-progress-thumb {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          background: linear-gradient(180deg, #00d4ff, #0088cc);
          border-radius: 3px;
          transition: height 0.05s ease-out;
          box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);
        }
        .scroll-progress-knob {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #00d4ff;
          border: 2px solid #fff;
          box-shadow: 0 0 10px rgba(0, 212, 255, 0.6), 0 2px 6px rgba(0,0,0,0.3);
          cursor: grab;
          z-index: 10;
          transition: bottom 0.05s ease-out;
        }
        .scroll-progress-knob:active {
          cursor: grabbing;
          box-shadow: 0 0 16px rgba(0, 212, 255, 0.8);
        }

        /* 桌面端侧边栏布局 - 固定定位方案 */
        @media screen and (min-width: 769px) {
          .app-body {
            display: flex;
            margin-top: 60px;
            min-height: calc(100vh - 60px);
          }
          .sidebar {
            position: fixed;
            top: 60px;
            left: 0;
            width: 240px;
            height: calc(100vh - 60px);
            flex-shrink: 0;
            transition: width 0.3s ease, opacity 0.3s ease;
          }
          .app-body.no-sidebar .sidebar {
            width: 0;
            opacity: 0;
            overflow: hidden;
          }
          /* main-content 强制占满剩余空间 */
          .main-content {
            width: calc(100vw - 240px) !important;
            margin-left: 240px !important;
            flex: none !important;
          }
          .app-body.no-sidebar .main-content {
            width: 100vw !important;
            margin-left: 0 !important;
          }
          /* 首页铺满宽度 */
          .dashboard {
            max-width: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-sizing: border-box;
          }
          /* 双栏布局也铺满 */
          .dashboard-grid {
            width: 100% !important;
            display: flex !important;
            gap: 24px;
          }
          .dashboard-col {
            flex: 1 1 0 !important;
            min-width: 0 !important;
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          /* 确保 KPI 卡片也铺满 */
          .kpi-grid {
            width: 100% !important;
            display: flex !important;
            gap: 16px;
          }
          .kpi-grid .kpi-card {
            flex: 1 1 0 !important;
            min-width: 0 !important;
          }
          /* 工单统计卡片桌面端一行显示 */
          .repair-stats-grid {
            display: grid !important;
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 16px !important;
          }
        }

        /* 移动端适配 */
        @media screen and (max-width: 768px) {
          /* 顶部栏优化 */
          .topbar {
            padding: 0 12px;
            height: 56px;
          }
          .topbar h1.logo {
            font-size: 11px;
            white-space: nowrap;
            max-width: none;
          }
          .menu-toggle {
            padding: 6px;
            font-size: 18px;
          }
          .topbar-right {
            gap: 6px;
          }
          .user-info {
            display: flex !important;
            align-items: center;
            gap: 4px;
          }
          .user-name {
            font-size: 12px !important;
            color: #fff !important;
            max-width: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            display: inline-block;
          }
          .role-tag {
            display: none !important;
          }
          .user-manage-btn {
            display: none;
          }
          .fullscreen-btn {
            display: none;
          }
          .logout-btn,
          .change-pwd-btn {
            padding: 2px 5px;
            font-size: 11px;
            line-height: 1;
          }
          .btn-text {
            display: none;
          }

          /* 侧边栏布局修复 - Flex 无抖动方案 */
          .app-body {
            display: flex;
            margin-top: 56px;
            min-height: calc(100vh - 56px);
          }
          .sidebar {
            width: 260px;
            flex-shrink: 0;
            transition: transform 0.3s ease;
          }
          .app-body.no-sidebar .sidebar {
            transform: translateX(-260px);
          }
          .main-content {
            flex: 1;
            min-width: 0;
          }

          /* ===== 首页移动端优化 ===== */
          /* KPI 卡片改为2列网格 - 紧凑布局 */
          .kpi-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            margin-bottom: 12px;
          }
          .kpi-card {
            flex: none !important;
            padding: 10px 8px !important;
            gap: 6px !important;
            border-radius: 8px;
            min-height: auto !important;
          }
          .kpi-icon {
            font-size: 16px !important;
            width: 28px !important;
            height: 28px !important;
            border-radius: 6px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .kpi-value {
            font-size: 16px !important;
            line-height: 1.2 !important;
          }
          .kpi-label {
            font-size: 10px !important;
            line-height: 1.2 !important;
          }
          .kpi-info {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
          }

          /* 快捷操作按钮 - 2列网格 */
          .quick-actions {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
            margin-bottom: 16px;
          }
          .quick-btn {
            padding: 14px 16px !important;
            font-size: 13px !important;
            justify-content: center;
          }
          .quick-icon { font-size: 16px; }

          /* 工单页面统计看板 - 移动端紧凑布局 */
          .repair-stats-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
          }
          .repair-stats-grid .card {
            padding: 12px 8px !important;
            margin-bottom: 0 !important;
          }
          .repair-stats-grid .card [style*="fontSize: 14"] {
            font-size: 10px !important;
          }
          .repair-stats-grid .card [style*="fontSize: 32"] {
            font-size: 18px !important;
          }

          /* 双栏内容区改为单列 */
          .dashboard-grid {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
          }
          .dashboard-col {
            flex: none !important;
          }

          /* 卡片样式优化 */
          .dashboard-card {
            border-radius: 10px;
          }
          .card-header {
            padding: 12px 14px !important;
          }
          .card-header h3 {
            font-size: 14px !important;
          }
          .card-link {
            font-size: 12px !important;
            padding: 4px 6px !important;
          }

          /* 列表项优化 */
          .list-item {
            padding: 10px 14px !important;
          }
          .item-left {
            gap: 4px !important;
          }
          .item-title {
            font-size: 13px !important;
          }
          .item-sub {
            font-size: 11px !important;
          }
          .item-right {
            margin-left: 8px !important;
          }

          /* 移动端底部Tab导航优化 */
          .mobile-tab-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            height: 60px;
            background: rgba(15, 23, 42, 0.98);
            border-top: 1px solid var(--border-glow);
            z-index: 100;
            padding: 0;
            backdrop-filter: blur(12px);
          }
          .mobile-tab-item {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
            color: var(--text-muted);
            font-size: 11px;
            text-decoration: none;
            transition: all 0.2s;
            padding: 8px 0;
          }
          .mobile-tab-item.active {
            color: var(--accent-cyan);
          }
          .mobile-tab-item.active::before {
            content: '';
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 32px;
            height: 2px;
            background: var(--accent-cyan);
            border-radius: 0 0 2px 2px;
          }
          .mobile-tab-icon {
            font-size: 20px;
          }
          .mobile-tab-label {
            font-size: 11px;
          }

          /* 主内容区留出底部Tab空间 */
          .main-content {
            padding: 12px !important;
            padding-bottom: 80px !important;
            min-height: calc(100vh - 56px) !important;
          }
          .dashboard {
            padding-bottom: 80px !important;
          }

          /* 弹窗优化 */
          .modal-overlay {
            align-items: center !important;
            justify-content: center !important;
            padding: 16px;
          }
          .modal {
            width: 100% !important;
            max-width: 520px !important;
            min-width: unset !important;
            max-height: 90vh !important;
            border-radius: 16px !important;
            padding: 20px !important;
            margin: 0 !important;
            animation: modalFadeIn 0.25s ease-out both;
            /* 不要设置 top/left/transform，让 flex 居中生效 */
            position: relative;
          }
          @keyframes modalFadeIn {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }

          /* 表单网格保持两列 */
          .form-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 10px !important;
          }
          .form-grid > div {
            width: 100% !important;
          }
          .form-actions {
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            gap: 10px !important;
          }
          .form-actions button {
            flex: 1 !important;
            min-width: 0 !important;
            padding: 12px 10px !important;
            white-space: nowrap;
          }

          /* 工具栏优化 - 移动端紧凑布局 */
          .toolbar {
            display: flex !important;
            flex-wrap: wrap !important;
            flex-direction: row !important;
            gap: 6px !important;
            padding: 0 !important;
          }
          .toolbar > button {
            flex: 1 1 auto !important;
            width: auto !important;
            min-width: 0 !important;
            min-height: 36px;
            font-size: 11px !important;
            padding: 6px 8px !important;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .toolbar > button.primary {
            min-height: 40px;
          }
          /* 搜索框区域 - 搜索框和按钮同行 */
          .toolbar > div:has(input) {
            display: flex !important;
            gap: 6px !important;
            flex-wrap: nowrap !important;
            flex: 1 1 100% !important;
            min-width: 0 !important;
            order: -1;
          }
          .toolbar > div:has(input) input {
            flex: 1 !important;
            min-height: 36px;
            font-size: 12px !important;
          }
          .toolbar > div:has(input) button {
            flex: none !important;
            width: auto !important;
            min-width: 56px !important;
            min-height: 36px;
            font-size: 12px !important;
          }
          .toolbar-search {
            width: 100% !important;
            margin-left: 0 !important;
          }
          .toolbar-search .search-input {
            width: 100% !important;
          }

          /* 按钮优化 - 移动端触摸友好 */
          button {
            min-height: 44px !important;
            padding: 12px 16px !important;
            font-size: 14px !important;
          }
          button.primary {
            min-height: 48px !important;
          }
          .btn-action {
            min-height: 36px !important;
            padding: 8px 14px !important;
          }

          /* 全局字体优化 */
          body {
            font-size: 15px !important;
          }
        }
      `}</style>

      {/* ===== 修改密码弹窗 ===== */}
      {showPasswordModal && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowPasswordModal(false)}>
          <div className="modal" style={{ background: '#1a1a2e', borderRadius: 16, padding: 24, width: '90%', maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', color: '#fff' }}>🔑 修改密码</h3>
            <form onSubmit={handleChangePassword}>
              {pwdError && <div style={{ padding: '8px 12px', background: 'rgba(255,71,87,0.15)', borderRadius: 8, color: '#ff6b7a', fontSize: 13, marginBottom: 16 }}>{pwdError}</div>}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 6 }}>旧密码</label>
                <input type="password" value={pwdForm.oldPassword} onChange={e => setPwdForm(p => ({ ...p, oldPassword: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }}
                  autoFocus />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 6 }}>新密码（至少6位）</label>
                <input type="password" value={pwdForm.newPassword} onChange={e => setPwdForm(p => ({ ...p, newPassword: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 6 }}>确认新密码</label>
                <input type="password" value={pwdForm.confirmPassword} onChange={e => setPwdForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" onClick={() => setShowPasswordModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#888', fontSize: 14, cursor: 'pointer' }}>取消</button>
                <button type="submit" disabled={pwdSubmitting}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #4facfe, #00f2fe)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{pwdSubmitting ? '提交中...' : '确认修改'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
