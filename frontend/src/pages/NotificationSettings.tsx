import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { notificationApi } from '../services/api';

interface AdminUser {
  id: number;
  username: string;
  role: string;
  roleName: string;
}

interface NotificationConfig {
  enabled: boolean;
  webhook_url: string;
  notify_immediately: boolean;
  notify_completed: boolean;
  notify_admin_ids: number[];
}

interface NotificationLog {
  id: number;
  notification_type: string;
  target_user: string;
  title: string;
  content: string;
  status: string;
  send_type: string;
  error_msg: string;
  sent_at: string;
  created_at: string;
}

export default function NotificationSettings() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [config, setConfig] = useState<NotificationConfig>({
    enabled: false,
    webhook_url: '',
    notify_immediately: true,
    notify_completed: true,
    notify_admin_ids: []
  });
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');

  // 页面权限检查（useAuth 从 localStorage 同步初始化，user 立即可用）
  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isSuperAdmin) {
      navigate('/', { replace: true });
      return;
    }
    loadData();
  }, [isSuperAdmin, user, navigate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, logsRes] = await Promise.all([
        notificationApi.getConfig(),
        notificationApi.logs(50)
      ]);
      setConfig(configRes.data.config);
      setAdmins(configRes.data.admins || []);
      setLogs(logsRes.data.logs || []);
    } catch (err: any) {
      console.error('加载数据失败:', err);
      alert('加载数据失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await notificationApi.updateConfig(config);
      alert('保存成功！');
    } catch (err: any) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await notificationApi.testSend();
      if (res.data.success) {
        alert('测试消息发送成功！请检查企业微信群是否收到通知。');
      } else {
        alert('发送失败: ' + res.data.message);
      }
      loadData();
    } catch (err: any) {
      alert('发送失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(false);
    }
  };

  const handleAdminToggle = (adminId: number) => {
    setConfig(prev => ({
      ...prev,
      notify_admin_ids: prev.notify_admin_ids.includes(adminId)
        ? prev.notify_admin_ids.filter(id => id !== adminId)
        : [...prev.notify_admin_ids, adminId]
    }));
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; color: string }> = {
      'sent': { bg: 'rgba(82, 196, 26, 0.2)', color: '#52c41a' },
      'failed': { bg: 'rgba(255, 71, 87, 0.2)', color: '#ff6b7a' },
      'pending': { bg: 'rgba(250, 173, 20, 0.2)', color: '#faad14' }
    };
    const style = styles[status] || styles['pending'];
    return (
      <span style={{ background: style.bg, color: style.color, padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
        {status === 'sent' ? '已发送' : status === 'failed' ? '失败' : '待发送'}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="page-container">
        <div className="loading-spinner">加载中...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* 页面标题 */}
      <div className="page-header">
        <div>
          <h2 className="page-title">📱 通知设置</h2>
          <p className="page-subtitle">配置企业微信工单通知</p>
        </div>
      </div>

      {/* 标签页 */}
      <div className="tab-nav" style={{ marginBottom: 24 }}>
        <button
          className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`}
          onClick={() => setActiveTab('config')}
        >
          基本配置
        </button>
        <button
          className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          通知日志
        </button>
      </div>

      {activeTab === 'config' ? (
        <div className="config-section">
          {/* 通知开关 */}
          <div className="card">
            <div className="card-header">
              <h3>通知开关</h3>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>

          {/* Webhook 配置 */}
          <div className="card">
            <div className="card-header">
              <h3>企业微信配置</h3>
            </div>
            <div className="card-body">
              <div className="form-group">
                <label>Webhook URL *</label>
                <input
                  type="text"
                  value={config.webhook_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, webhook_url: e.target.value }))}
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  disabled={!config.enabled}
                />
                <small className="form-hint">
                  在企业微信群中添加"群机器人"，复制 Webhook 地址粘贴至此
                </small>
              </div>
            </div>
          </div>

          {/* 通知类型 */}
          <div className="card">
            <div className="card-header">
              <h3>通知类型</h3>
            </div>
            <div className="card-body">
              <div className="checkbox-group">
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={config.notify_immediately}
                    onChange={(e) => setConfig(prev => ({ ...prev, notify_immediately: e.target.checked }))}
                    disabled={!config.enabled}
                  />
                  <div>
                    <span className="checkbox-title">🔔 新建工单通知</span>
                    <small className="checkbox-desc">当有新的设备维修工单时，立即发送通知到企业微信群</small>
                  </div>
                </label>
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={config.notify_completed}
                    onChange={(e) => setConfig(prev => ({ ...prev, notify_completed: e.target.checked }))}
                    disabled={!config.enabled}
                  />
                  <div>
                    <span className="checkbox-title">✅ 工单完结通知</span>
                    <small className="checkbox-desc">当维修工单完成处理时，发送完结通知到企业微信群</small>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* 通知对象 */}
          <div className="card">
            <div className="card-header">
              <h3>通知对象</h3>
            </div>
            <div className="card-body">
              <div className="admin-list">
                {admins.map(admin => (
                  <label key={admin.id} className="admin-item">
                    <input
                      type="checkbox"
                      checked={config.notify_admin_ids.includes(admin.id)}
                      onChange={() => handleAdminToggle(admin.id)}
                      disabled={!config.enabled}
                    />
                    <span className={`role-badge role-${admin.role}`}>
                      {admin.roleName}
                    </span>
                    <span className="admin-name">{admin.username}</span>
                  </label>
                ))}
                {admins.length === 0 && (
                  <div className="empty-hint">暂无设备管理员</div>
                )}
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="action-bar">
            <button
              className="btn btn-outline"
              onClick={handleTest}
              disabled={!config.enabled || !config.webhook_url || testing}
            >
              {testing ? '发送中...' : '🧪 发送测试'}
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? '保存中...' : '💾 保存配置'}
            </button>
          </div>
        </div>
      ) : (
        <div className="logs-section">
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>类型</th>
                    <th>发送方式</th>
                    <th>状态</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td>{log.created_at?.slice(0, 19).replace('T', ' ')}</td>
                      <td>{log.notification_type === 'repair' ? '工单通知' : log.notification_type === 'test' ? '测试' : log.notification_type}</td>
                      <td>{log.send_type === 'immediate' ? '立即' : log.send_type === 'scheduled' ? '定时' : log.send_type}</td>
                      <td>{getStatusBadge(log.status)}</td>
                      <td>
                        {log.error_msg ? (
                          <span style={{ color: '#ff6b7a', fontSize: 12 }}>{log.error_msg}</span>
                        ) : (
                          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.6)' }}>
                        暂无通知记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .page-container {
          padding: 24px;
          max-width: 900px;
        }
        .page-header {
          margin-bottom: 24px;
        }
        .page-title {
          font-size: 24px;
          font-weight: 600;
          color: #fff;
          margin: 0 0 4px;
        }
        .page-subtitle {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          margin: 0;
        }
        .tab-nav {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 12px;
        }
        .tab-btn {
          padding: 8px 16px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          cursor: pointer;
          border-radius: 6px;
          transition: all 0.2s;
        }
        .tab-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.8);
        }
        .tab-btn.active {
          background: rgba(79, 172, 254, 0.2);
          color: #4facfe;
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .card-header h3 {
          margin: 0;
          font-size: 16px;
          color: #fff;
        }
        .card-body {
          padding: 20px;
        }
        .form-group {
          margin-bottom: 16px;
        }
        .form-group:last-child {
          margin-bottom: 0;
        }
        .form-group label {
          display: block;
          margin-bottom: 8px;
          color: rgba(255, 255, 255, 0.8);
          font-size: 14px;
          font-weight: 500;
        }
        .form-group input[type="text"],
        .form-group select {
          width: 100%;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #fff;
          font-size: 14px;
          box-sizing: border-box;
        }
        .form-group input:focus,
        .form-group select:focus {
          outline: none;
          border-color: #4facfe;
        }
        .form-group input:disabled,
        .form-group select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .form-hint {
          display: block;
          margin-top: 6px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 12px;
        }
        .checkbox-group {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .checkbox-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          cursor: pointer;
        }
        .checkbox-item input[type="checkbox"] {
          width: 18px;
          height: 18px;
          margin-top: 2px;
          accent-color: #4facfe;
        }
        .checkbox-item input:disabled {
          opacity: 0.5;
        }
        .checkbox-title {
          display: block;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
        }
        .checkbox-desc {
          display: block;
          color: rgba(255, 255, 255, 0.5);
          font-size: 12px;
          margin-top: 4px;
        }
        .admin-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .admin-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          cursor: pointer;
        }
        .admin-item input {
          accent-color: #4facfe;
        }
        .admin-item input:disabled {
          opacity: 0.5;
        }
        .admin-name {
          color: #fff;
          font-size: 14px;
        }
        .role-badge {
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 500;
        }
        .role-super_admin {
          background: rgba(255, 215, 0, 0.2);
          color: #ffd700;
        }
        .role-admin {
          background: rgba(79, 172, 254, 0.2);
          color: #4facfe;
        }
        .empty-hint {
          color: rgba(255, 255, 255, 0.5);
          font-size: 13px;
          padding: 12px;
        }
        .action-bar {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 24px;
        }
        .btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-primary {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          color: #fff;
        }
        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: rgba(255, 255, 255, 0.8);
        }
        .btn-outline:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th,
        .data-table td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .data-table th {
          background: rgba(255, 255, 255, 0.05);
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
          font-size: 13px;
        }
        .data-table td {
          color: rgba(255, 255, 255, 0.9);
          font-size: 13px;
        }
        .data-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 26px;
          transition: 0.3s;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 3px;
          bottom: 3px;
          background: #fff;
          border-radius: 50%;
          transition: 0.3s;
        }
        input:checked + .slider {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }
        input:checked + .slider:before {
          transform: translateX(22px);
        }
        .loading-spinner {
          text-align: center;
          padding: 60px;
          color: rgba(255, 255, 255, 0.6);
        }
      `}</style>
    </div>
  );
}
