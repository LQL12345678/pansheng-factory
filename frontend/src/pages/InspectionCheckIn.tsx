import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inspectionApi } from '../services/api';

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Item {
  id: number;
  category: string;
  name: string;
  box_number: string;
  responsible_person: string;
  qr_token: string;
}

export default function InspectionCheckIn() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState<'正常' | '异常'>('正常');
  const [remark, setRemark] = useState('');
  const [inspector, setInspector] = useState('');
  const [todayRecord, setTodayRecord] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setError('缺少点检令牌');
      setLoading(false);
      return;
    }

    inspectionApi.getByToken(token)
      .then(res => {
        setItem(res.data);
        setLoading(false);
        // 查询今天是否已打卡
        return inspectionApi.weekView(fmtDate(new Date()));
      })
      .then(weekRes => {
        if (weekRes?.data?.items) {
          const today = fmtDate(new Date());
          for (const it of weekRes.data.items) {
            if (it.qr_token === token) {
              const dayRec = it.days?.find((d: any) => d.date === today);
              if (dayRec && dayRec.status !== '漏检' && dayRec.status !== '未开始') {
                setTodayRecord(dayRec);
                setStatus(dayRec.status || '正常');
                setRemark(dayRec.remark || '');
                setInspector(dayRec.inspector || '');
              }
              break;
            }
          }
        }
      })
      .catch((e: any) => {
        if (!item) setError('点检项目不存在: ' + (e.response?.data?.error || e.message));
        setLoading(false);
      });
  }, [token]);

  async function handleSubmit() {
    if (!item) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await inspectionApi.checkIn({
        qr_token: token,
        status,
        remark: status === '异常' ? remark : '',
        inspector: inspector.trim(),
      });
      if (res.data?.success) {
        setSuccess(true);
      } else {
        setError(res.data?.error || '提交失败');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || '网络错误，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a1428', display: 'flex',
        justifyContent: 'center', alignItems: 'center', color: '#666'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  if (error && !item) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a1428', display: 'flex',
        justifyContent: 'center', alignItems: 'center'
      }}>
        <div style={{
          background: '#0d1b33', borderRadius: 16, padding: 32, textAlign: 'center',
          border: '1px solid #ff4d4f', maxWidth: 320
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
          <div style={{ color: '#ff4d4f', fontSize: 16, marginBottom: 8 }}>出错了</div>
          <div style={{ color: '#999', fontSize: 13 }}>{error}</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a1428', display: 'flex',
        justifyContent: 'center', alignItems: 'center'
      }}>
        <div style={{
          background: '#0d1b33', borderRadius: 16, padding: 32, textAlign: 'center',
          border: '1px solid #52c41a', maxWidth: 360
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{status === '正常' ? '✅' : '⚠️'}</div>
          <div style={{ color: '#52c41a', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            {status === '正常' ? '点检完成！' : '已记录异常'}
          </div>
          <div style={{ color: '#e0e0e0', fontSize: 14, marginBottom: 4 }}>{item?.category} - {item?.name}</div>
          {inspector && <div style={{ color: '#888', fontSize: 12 }}>点检人: {inspector}</div>}
          {remark && <div style={{ color: '#faad14', fontSize: 12, marginTop: 4 }}>备注: {remark}</div>}
          <button
            onClick={() => { setSuccess(false); setRemark(''); }}
            className="btn"
            style={{ marginTop: 20, padding: '10px 32px', fontSize: 16, background: '#00d4ff', color: '#000' }}
          >
            继续点检
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0a1428', display: 'flex',
      justifyContent: 'center', alignItems: 'center', padding: 16
    }}>
      <div style={{
        background: '#0d1b33', borderRadius: 16, padding: 24, maxWidth: 400, width: '100%',
        border: '1px solid #1a2a4a'
      }}>
        {/* 项目信息 */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{item?.category}</div>
          <div style={{ fontSize: 20, color: '#e0e0e0', fontWeight: 700 }}>{item?.name}</div>
          {item?.box_number && (
            <div style={{ fontSize: 12, color: '#666', marginTop: 4, fontFamily: 'monospace' }}>
              编号: {item.box_number}
            </div>
          )}
          {item?.responsible_person && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              责任人: {item.responsible_person}
            </div>
          )}
          {todayRecord && (
            <div style={{ fontSize: 11, color: '#faad14', marginTop: 8, background: '#2a1f0a', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
              📝 今天已打卡 ({todayRecord.status})，重新提交将覆盖
            </div>
          )}
        </div>

        {/* 状态选择 */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button
            onClick={() => setStatus('正常')}
            style={{
              flex: 1, padding: '16px 12px', borderRadius: 12, border: status === '正常' ? '2px solid #52c41a' : '2px solid #1a2a4a',
              background: status === '正常' ? '#0a2a1a' : 'transparent', color: status === '正常' ? '#52c41a' : '#666',
              fontSize: 18, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            ✅ 正常
          </button>
          <button
            onClick={() => setStatus('异常')}
            style={{
              flex: 1, padding: '16px 12px', borderRadius: 12, border: status === '异常' ? '2px solid #ff4d4f' : '2px solid #1a2a4a',
              background: status === '异常' ? '#2a0a0a' : 'transparent', color: status === '异常' ? '#ff4d4f' : '#666',
              fontSize: 18, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >
            ⚠️ 异常
          </button>
        </div>

        {/* 异常说明 */}
        {status === '异常' && (
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label style={{ color: '#aaa', fontSize: 13 }}>异常说明</label>
            <textarea
              value={remark}
              onChange={e => setRemark(e.target.value)}
              placeholder="请描述异常情况..."
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        )}

        {/* 点检人 */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label style={{ color: '#aaa', fontSize: 13 }}>点检人</label>
          <input
            value={inspector}
            onChange={e => setInspector(e.target.value)}
            placeholder="请输入点检人姓名"
          />
        </div>

        {error && (
          <div style={{ color: '#ff4d4f', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>
        )}

        {/* 提交按钮 */}
        <button
          onClick={handleSubmit}
          disabled={submitting || !inspector.trim()}
          className="btn"
          style={{
            width: '100%', padding: '14px', fontSize: 17, fontWeight: 700,
            background: submitting || !inspector.trim() ? '#1a2a4a' : 'linear-gradient(135deg, #00d4ff, #0099cc)',
            color: submitting || !inspector.trim() ? '#555' : '#000',
            borderRadius: 12, border: 'none', cursor: submitting || !inspector.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '提交中...' : '✅ 确认点检'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#555' }}>
          提交后将记录到今日巡查台账
        </div>
      </div>
    </div>
  );
}
