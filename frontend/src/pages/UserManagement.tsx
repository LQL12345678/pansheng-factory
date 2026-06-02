import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, User } from '../hooks/useAuth';

// 角色名称映射
const roleLabels: Record<string, string> = {
  'super_admin': '超级管理员',
  'admin': '设备管理员',
  'user': '生产干部',
  'operator': '设备报修员',
};

// 角色选项（用于下拉选择）
const roleOptions = [
  { value: 'admin', label: '设备管理员' },
  { value: 'user', label: '生产干部' },
  { value: 'operator', label: '设备报修员' },
];

export default function UserManagement() {
  const navigate = useNavigate();
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 新增/编辑弹窗
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'user',
  });
  const [submitting, setSubmitting] = useState(false);

  // 页面权限检查（useAuth 从 localStorage 同步初始化，user 立即可用）
  useEffect(() => {
    if (!currentUser) {
      navigate('/login', { replace: true });
      return;
    }
    if (!isSuperAdmin) {
      navigate('/', { replace: true });
      return;
    }
    loadUsers();
  }, [isSuperAdmin, currentUser, navigate]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users', {
        credentials: 'include',
      });
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (res.status === 403) {
          setError('无权限访问');
          return;
        }
        throw new Error('获取用户列表失败');
      }
      const data = await res.json();
      // 按角色排序：超级管理员 → 设备管理员 → 生产干部 → 设备报修员
      const roleOrder: Record<string, number> = { super_admin: 0, admin: 1, production_leader: 2, operator: 3 };
      data.sort((a: User, b: User) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99));
      setUsers(data);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditUser(null);
    setFormData({ username: '', password: '', role: 'user' });
    setShowModal(true);
  };

  const handleEdit = (user: User) => {
    setEditUser(user);
    setFormData({ username: user.username, password: '', role: user.role });
    setShowModal(true);
  };

  const handleDelete = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('不能删除自己的账号！');
      return;
    }
    if (!confirm(`确定要删除用户 "${user.username}" 吗？`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '删除失败');
        return;
      }
      loadUsers();
      alert('删除成功');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username.trim()) {
      alert('用户名不能为空');
      return;
    }
    if (!editUser && !formData.password.trim()) {
      alert('密码不能为空');
      return;
    }
    if (formData.password && formData.password.length < 6) {
      alert('密码长度至少6位');
      return;
    }

    setSubmitting(true);
    try {
      let res: Response;
      let data: any;

      if (editUser) {
        // 编辑用户
        const body: Record<string, string> = {
          role: formData.role,
          status: 'active',
        };
        // 密码非空时才传入
        if (formData.password.trim()) {
          body.password = formData.password;
        }
        res = await fetch(`/api/users/${editUser.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
      } else {
        // 新增用户
        res = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            username: formData.username.trim(),
            password: formData.password,
            role: formData.role,
          }),
        });
      }

      data = await res.json();
      if (!res.ok) {
        alert(data.error || '操作失败');
        return;
      }

      setShowModal(false);
      loadUsers();
      alert(editUser ? '更新成功' : '创建成功');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (user: User) => {
    if (user.id === currentUser?.id) {
      alert('不能重置自己的密码！');
      return;
    }
    const newPassword = prompt(`为用户 "${user.username}" 设置新密码（至少6位）：`);
    if (!newPassword || newPassword.length < 6) {
      if (newPassword) alert('密码长度至少6位');
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '重置失败');
        return;
      }
      alert('密码重置成功');
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="page-container">
      {/* 页面标题 */}
      <div className="page-header">
        <div>
          <h2 className="page-title">👥 用户管理</h2>
          <p className="page-subtitle">管理系统用户账号和权限</p>
        </div>
        <button className="btn btn-primary" onClick={handleAdd}>
          + 新增用户
        </button>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">{error}</div>
      )}

      {/* 加载状态 */}
      {loading ? (
        <div className="loading-spinner">加载中...</div>
      ) : (
        <>
          {/* 用户列表 */}
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>用户名</th>
                  <th>角色</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.username}</td>
                    <td>
                      <span className={`role-badge role-${user.role}`}>
                        {roleLabels[user.role] || user.role}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => handleEdit(user)}
                        >
                          编辑
                        </button>
                        <button 
                          className="btn btn-sm btn-outline"
                          onClick={() => handleResetPassword(user)}
                        >
                          重置密码
                        </button>
                        {user.id !== currentUser?.id && (
                          <button 
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(user)}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                      暂无用户数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 新增/编辑弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editUser ? '编辑用户' : '新增用户'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>用户名</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    placeholder="请输入用户名"
                    disabled={!!editUser}
                    required={!editUser}
                  />
                  {editUser && <small style={{ color: '#666', fontSize: '12px' }}>用户名不可修改</small>}
                </div>

                {!editUser && (
                  <div className="form-group">
                    <label>密码</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      placeholder="请输入密码（至少6位）"
                      required
                    />
                  </div>
                )}

                {editUser && (
                  <div className="form-group">
                    <label>修改密码（留空则不修改）</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      placeholder="留空则不修改密码"
                      autoComplete="new-password"
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>角色</label>
                  <select
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                  >
                    {roleOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? '提交中...' : '确认'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .page-container {
          padding: 24px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
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
        .btn {
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
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
        .btn-outline:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .btn-danger {
          background: rgba(255, 71, 87, 0.2);
          border: 1px solid rgba(255, 71, 87, 0.4);
          color: #ff6b7a;
        }
        .btn-danger:hover {
          background: rgba(255, 71, 87, 0.3);
        }
        .btn-sm {
          padding: 6px 12px;
          font-size: 13px;
        }
        .error-banner {
          background: rgba(255, 71, 87, 0.2);
          border: 1px solid rgba(255, 71, 87, 0.4);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 20px;
          color: #ff6b7a;
        }
        .loading-spinner {
          text-align: center;
          padding: 40px;
          color: rgba(255, 255, 255, 0.6);
        }
        .card {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          overflow: hidden;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th,
        .data-table td {
          padding: 14px 16px;
          text-align: left;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .data-table th {
          background: rgba(255, 255, 255, 0.05);
          font-weight: 600;
          color: rgba(255, 255, 255, 0.8);
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .data-table td {
          color: rgba(255, 255, 255, 0.9);
          font-size: 14px;
        }
        .data-table tbody tr:hover {
          background: rgba(255, 255, 255, 0.03);
        }
        .role-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 12px;
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
        .role-user {
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
        }
        .role-operator {
          background: rgba(82, 196, 26, 0.2);
          color: #52c41a;
        }
        .action-buttons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: #1a1a2e;
          border-radius: 16px;
          width: 90%;
          max-width: 450px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .modal-header h3 {
          margin: 0;
          color: #fff;
          font-size: 18px;
        }
        .modal-close {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          line-height: 1;
        }
        .modal-close:hover {
          color: #fff;
        }
        .modal-body {
          padding: 24px;
        }
        .form-group {
          margin-bottom: 20px;
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
        .form-group input,
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
        .form-group input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px 24px;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  );
}
