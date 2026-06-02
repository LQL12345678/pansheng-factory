import { useState, useCallback, useEffect, useRef } from 'react';

const USER_KEY = 'equip_user';

// 用户信息类型
export interface User {
  id: number;
  username: string;
  role: 'super_admin' | 'admin' | 'user' | 'operator';
  roleName: string;
}

// 角色名称映射
const roleNames: Record<string, string> = {
  'super_admin': '超级管理员',
  'admin': '设备管理员',
  'user': '生产干部',
  'operator': '设备报修员',
};

// 获取本地存储的用户
function getStoredUser(): User | null {
  try {
    const stored = localStorage.getItem(USER_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    localStorage.removeItem(USER_KEY);
  }
  return null;
}

// 保存用户到本地存储
function saveUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// 清除本地存储的用户
function clearUser(): void {
  localStorage.removeItem(USER_KEY);
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isConnected, setIsConnected] = useState(true); // 网络连接状态
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // 判断是否为管理员（super_admin 或 admin）
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  // 判断是否为超级管理员
  const isSuperAdmin = user?.role === 'super_admin';

  // 判断是否为操作员
  const isOperator = user?.role === 'operator';

  // ===== 心跳检测与会话续期 =====
  const startHeartbeat = useCallback(() => {
    // 清除已有的定时器
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    // 每 5 分钟发送一次心跳，检测连接状态并续期会话
    heartbeatTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/users/ping', {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.alive) {
          setIsConnected(true);
          reconnectAttemptsRef.current = 0;
        } else {
          setIsConnected(false);
        }
      } catch (e) {
        // 网络错误，尝试重连
        setIsConnected(false);
        reconnectAttemptsRef.current++;

        // 如果断开超过 30 分钟（6次心跳失败），清除登录状态
        if (reconnectAttemptsRef.current > 6) {
          clearUser();
          setUser(null);
          setAuthChecked(true);
          if (heartbeatTimerRef.current) {
            clearInterval(heartbeatTimerRef.current);
          }
        }
      }
    }, 5 * 60 * 1000); // 5分钟
  }, []);

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
      }
    };
  }, []);

  // 登录
  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setLoading(true);
    try {
      const res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || '登录失败' };
      }

      // 保存用户信息到 localStorage
      const userData: User = {
        id: data.user.id,
        username: data.user.username,
        role: data.user.role,
        roleName: data.user.roleName || roleNames[data.user.role] || data.user.role,
      };
      saveUser(userData);
      setUser(userData);
      setAuthChecked(true);
      setIsConnected(true);

      // 登录成功后启动心跳
      startHeartbeat();

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || '网络错误' };
    } finally {
      setLoading(false);
    }
  }, [startHeartbeat]);

  // 退出登录
  const logout = useCallback(async () => {
    // 停止心跳
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
    }

    try {
      // 调用后端 logout 接口清除服务器 session
      await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (e) {
      // 即使接口调用失败也继续清除本地状态
    }
    // 清除本地存储
    clearUser();
    setUser(null);
    setAuthChecked(false);
    setIsConnected(false);
    // 跳转到登录页
    window.location.href = '/login';
  }, []);

  // 更新用户信息
  const updateUser = useCallback((newUser: User) => {
    saveUser(newUser);
    setUser(newUser);
  }, []);

  // 检查是否已登录（从服务器验证）
  const checkAuth = useCallback(async (): Promise<boolean> => {
    // 如果已经有有效的用户数据，先显示本地数据
    const storedUser = getStoredUser();
    if (storedUser && storedUser.role) {
      // 从本地存储恢复用户数据
      setUser(storedUser);
      setAuthChecked(true);

      // 启动心跳检测
      startHeartbeat();

      // 同时验证服务器会话
      try {
        const res = await fetch('/api/users/me', {
          credentials: 'include',
        });
        if (res.ok) {
          const userData = await res.json();
          // 验证返回的数据是否完整
          if (userData.id && userData.username && userData.role) {
            const user: User = {
              id: userData.id,
              username: userData.username,
              role: userData.role,
              roleName: userData.roleName || roleNames[userData.role] || userData.role,
            };
            saveUser(user);
            setUser(user);
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            return true;
          }
        } else {
          // 服务器会话已过期，但保留本地数据用于显示
          // 启动心跳重连
          startHeartbeat();
          return true;
        }
      } catch (e) {
        // 网络错误时，保留本地存储的用户数据（允许离线访问）
        setIsConnected(false);
        startHeartbeat();
        return true;
      }
    }

    setAuthChecked(true);
    return false;
  }, [startHeartbeat]);

  return {
    user,
    isAdmin,
    isSuperAdmin,
    isOperator,
    login,
    logout,
    updateUser,
    checkAuth,
    loading,
    authChecked,
    isConnected, // 是否连接到服务器
  };
}
