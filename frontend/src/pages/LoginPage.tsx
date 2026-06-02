import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [rememberUsername, setRememberUsername] = useState(false);
  const [rememberPassword, setRememberPassword] = useState(false);
  const { login } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 登录历史
  const [loginHistory, setLoginHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('login_history') || '[]');
    } catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);

  const addToHistory = (name: string) => {
    setLoginHistory(prev => {
      const next = [name, ...prev.filter(n => n !== name)].slice(0, 10);
      localStorage.setItem('login_history', JSON.stringify(next));
      return next;
    });
  };

  // 从 localStorage 加载保存的凭证
  useEffect(() => {
    const savedUsername = localStorage.getItem('remembered_username');
    const savedRememberUsername = localStorage.getItem('remember_username') === 'true';

    if (savedUsername) {
      setUsername(savedUsername);
      // 按用户名读取密码
      const savedPwd = localStorage.getItem(`saved_pwd_${savedUsername}`);
      if (savedPwd) setPassword(savedPwd);
    }
    setRememberUsername(savedRememberUsername);
    // remember_password 改为全局开关
    setRememberPassword(localStorage.getItem('remember_password') === 'true');
  }, []);

  // 检查是否已登录
  useEffect(() => {
    const stored = localStorage.getItem('equip_user');
    if (stored) {
      window.location.href = '/';
    }
  }, []);

  // 粒子动画背景
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      color: string;
    }> = [];

    const colors = ['#00d4ff', '#0099ff', '#00ff88', '#4facfe'];

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animationId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.fill();

        particles.forEach((p2, j) => {
          if (i === j) return;
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = 0.1 * (1 - dist / 150);
            ctx.stroke();
          }
        });
      });

      animationId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);

    if (result.success) {
      // 记入登录历史
      addToHistory(username.trim());
      // 保存凭证
      if (rememberUsername) {
        localStorage.setItem('remembered_username', username.trim());
        localStorage.setItem('remember_username', 'true');
      } else {
        localStorage.removeItem('remembered_username');
        localStorage.setItem('remember_username', 'false');
      }

      if (rememberPassword) {
        localStorage.setItem(`saved_pwd_${username.trim()}`, password);
        localStorage.setItem('remember_password', 'true');
      } else {
        localStorage.removeItem(`saved_pwd_${username.trim()}`);
        localStorage.setItem('remember_password', 'false');
      }

      window.location.href = '/';
    } else {
      setError(result.error || '登录失败');
    }
  };

  // 清除所有保存的凭证
  const handleClearSaved = () => {
    localStorage.removeItem('remembered_username');
    localStorage.removeItem('remembered_password');
    localStorage.removeItem('remember_username');
    localStorage.removeItem('remember_password');
    setUsername('');
    setPassword('');
    setRememberUsername(false);
    setRememberPassword(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0a0e17',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* 粒子背景 */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
        }}
      />

      {/* 网格背景 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px)
        `,
        backgroundSize: '50px 50px',
        zIndex: 0,
      }} />

      <style>{`
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(0, 212, 255, 0.3), inset 0 0 20px rgba(0, 212, 255, 0.05); }
          50% { box-shadow: 0 0 40px rgba(0, 212, 255, 0.5), inset 0 0 30px rgba(0, 212, 255, 0.1); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(0, 212, 255, 0.3); }
          50% { border-color: rgba(0, 212, 255, 0.6); }
        }
      `}</style>

      {/* 登录卡片 */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        background: 'linear-gradient(135deg, rgba(10, 14, 23, 0.95) 0%, rgba(20, 30, 48, 0.9) 100%)',
        backdropFilter: 'blur(20px)',
        borderRadius: '24px',
        padding: '48px 40px',
        width: '100%',
        maxWidth: '420px',
        border: '1px solid rgba(0, 212, 255, 0.2)',
        animation: 'borderGlow 3s ease-in-out infinite',
      }}>
        {/* 顶部装饰线 */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60%',
          height: '3px',
          background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
          borderRadius: '0 0 4px 4px',
        }} />

        {/* Logo 区域 */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          {/* 科技感图标 */}
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 16px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* 外圈 */}
            <div style={{
              position: 'absolute',
              width: '80px',
              height: '80px',
              border: '2px solid rgba(0, 212, 255, 0.3)',
              borderRadius: '50%',
              animation: 'pulse 2s ease-in-out infinite',
            }} />
            {/* 中圈 */}
            <div style={{
              position: 'absolute',
              width: '64px',
              height: '64px',
              border: '1px solid rgba(0, 212, 255, 0.5)',
              borderRadius: '50%',
            }} />
            {/* 核心图标 */}
            <div style={{
              fontSize: '36px',
              filter: 'drop-shadow(0 0 10px rgba(0, 212, 255, 0.5))',
            }}>⚙️</div>
          </div>

          <h1 style={{
            fontSize: '22px',
            fontWeight: '700',
            background: 'linear-gradient(135deg, #00d4ff 0%, #00ff88 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}>
            攀升智造
          </h1>
          <p style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.5)',
            margin: '6px 0 0',
            letterSpacing: '4px',
            textTransform: 'uppercase',
          }}>
            设备管理系统
          </p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleSubmit}>
          {/* 用户名输入框 */}
          <div style={{ marginBottom: '20px', position: 'relative' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: focused === 'username' ? '#00d4ff' : 'rgba(255, 255, 255, 0.6)',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'color 0.3s ease',
            }}>
              用户名
            </label>
            <div style={{ position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setShowHistory(false); }}
                placeholder="请输入用户名"
                autoComplete="username"
                onFocus={() => { setFocused('username'); setShowHistory(true); }}
                onBlur={() => { setFocused(null); }}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '15px',
                  background: focused === 'username'
                    ? 'rgba(0, 212, 255, 0.08)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${focused === 'username' ? 'rgba(0, 212, 255, 0.6)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '12px',
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.3s ease',
                }}
              />
              {/* 登录历史下拉 */}
              {showHistory && loginHistory.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 4,
                  background: 'rgba(15,25,45,0.98)',
                  border: '1px solid rgba(0,212,255,0.2)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  zIndex: 100,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
                }}
                onMouseDown={e => e.preventDefault()}>
                  <div style={{ padding: '6px 14px', fontSize: 11, color: '#666', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    最近登录
                  </div>
                  {loginHistory.map(name => (
                    <div key={name}
                      onMouseDown={() => {
                        setUsername(name);
                        // 按用户名加载密码
                        const savedPwd = localStorage.getItem(`saved_pwd_${name}`);
                        if (savedPwd) setPassword(savedPwd);
                        else setPassword('');
                        setShowHistory(false);
                      }}
                      style={{
                        padding: '10px 14px',
                        fontSize: 14,
                        color: '#ccc',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.12)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      👤 {name}
                    </div>
                  ))}
                  <div
                    onMouseDown={() => { localStorage.removeItem('login_history'); setLoginHistory([]); setShowHistory(false); }}
                    style={{
                      padding: '8px 14px',
                      fontSize: 11,
                      color: '#666',
                      cursor: 'pointer',
                      textAlign: 'center',
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ff6b7a'}
                    onMouseLeave={e => e.currentTarget.style.color = '#666'}
                  >
                    清除历史
                  </div>
                </div>
              )}
              {/* 输入框底部光效 */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: focused === 'username' ? '80%' : '0%',
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
                transition: 'width 0.3s ease',
                borderRadius: '2px',
              }} />
            </div>
          </div>

          {/* 密码输入框 */}
          <div style={{ marginBottom: '28px', position: 'relative' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              color: focused === 'password' ? '#00d4ff' : 'rgba(255, 255, 255, 0.6)',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              transition: 'color 0.3s ease',
            }}>
              密码
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                onFocus={() => setFocused('password')}
                onBlur={() => setFocused(null)}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: '15px',
                  background: focused === 'password'
                    ? 'rgba(0, 212, 255, 0.08)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${focused === 'password' ? 'rgba(0, 212, 255, 0.6)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '12px',
                  color: '#fff',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'all 0.3s ease',
                }}
              />
              {/* 输入框底部光效 */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: focused === 'password' ? '80%' : '0%',
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #00d4ff, transparent)',
                transition: 'width 0.3s ease',
                borderRadius: '2px',
              }} />
            </div>
          </div>

          {/* 记住密码选项 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* 记住用户名 */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: rememberUsername ? '#00d4ff' : 'rgba(255, 255, 255, 0.5)',
                transition: 'color 0.3s ease',
              }}>
                <div
                  onClick={() => setRememberUsername(!rememberUsername)}
                  style={{
                    width: '16px',
                    height: '16px',
                    border: `1px solid ${rememberUsername ? '#00d4ff' : 'rgba(255, 255, 255, 0.3)'}`,
                    borderRadius: '4px',
                    background: rememberUsername ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {rememberUsername && (
                    <span style={{ color: '#00d4ff', fontSize: '10px' }}>✓</span>
                  )}
                </div>
                记住用户名
              </label>

              {/* 记住密码 */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                color: rememberPassword ? '#00d4ff' : 'rgba(255, 255, 255, 0.5)',
                transition: 'color 0.3s ease',
              }}>
                <div
                  onClick={() => setRememberPassword(!rememberPassword)}
                  style={{
                    width: '16px',
                    height: '16px',
                    border: `1px solid ${rememberPassword ? '#00d4ff' : 'rgba(255, 255, 255, 0.3)'}`,
                    borderRadius: '4px',
                    background: rememberPassword ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {rememberPassword && (
                    <span style={{ color: '#00d4ff', fontSize: '10px' }}>✓</span>
                  )}
                </div>
                记住密码
              </label>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div style={{
              background: 'rgba(255, 71, 87, 0.15)',
              border: '1px solid rgba(255, 71, 87, 0.4)',
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '20px',
              color: '#ff6b7a',
              fontSize: '13px',
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}>
              <span>⚠️</span>
              {error}
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '15px',
              fontWeight: '600',
              background: loading
                ? 'rgba(0, 212, 255, 0.3)'
                : 'linear-gradient(135deg, #00d4ff 0%, #0099ff 50%, #00ff88 100%)',
              backgroundSize: '200% 200%',
              animation: loading ? 'none' : 'gradientShift 3s ease infinite',
              border: 'none',
              borderRadius: '12px',
              color: '#0a0e17',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              boxShadow: loading ? 'none' : '0 4px 20px rgba(0, 212, 255, 0.4)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 30px rgba(0, 212, 255, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 212, 255, 0.4)';
              }
            }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid rgba(10, 14, 23, 0.3)',
                  borderTopColor: '#0a0e17',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }} />
                验证中...
              </span>
            ) : '登 录'}
          </button>

          {/* 清除已保存信息按钮 */}
          {(localStorage.getItem('remember_username') === 'true' ||
            localStorage.getItem('remember_password') === 'true') && (
            <button
              type="button"
              onClick={handleClearSaved}
              style={{
                width: '100%',
                marginTop: '12px',
                padding: '10px',
                fontSize: '12px',
                background: 'transparent',
                border: '1px solid rgba(255, 71, 87, 0.3)',
                borderRadius: '10px',
                color: 'rgba(255, 107, 122, 0.7)',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 71, 87, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(255, 71, 87, 0.5)';
                e.currentTarget.style.color = '#ff6b7a';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'rgba(255, 71, 87, 0.3)';
                e.currentTarget.style.color = 'rgba(255, 107, 122, 0.7)';
              }}
            >
              🗑️ 清除已保存的登录信息
            </button>
          )}
        </form>

        {/* 底部装饰 */}
        <div style={{
          marginTop: '32px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            background: '#00d4ff',
            borderRadius: '50%',
            boxShadow: '0 0 10px #00d4ff',
          }} />
          <span style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.3)',
            letterSpacing: '2px',
          }}>
            SYSTEM ONLINE
          </span>
          <div style={{
            width: '6px',
            height: '6px',
            background: '#00ff88',
            borderRadius: '50%',
            boxShadow: '0 0 10px #00ff88',
          }} />
        </div>
      </div>

      {/* 额外动画样式 */}
      <style>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
