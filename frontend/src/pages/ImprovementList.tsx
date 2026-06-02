import { useState, useEffect, useCallback, useRef, ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { improvementApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

// 状态映射
const STATUS_MAP: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: '待反馈', color: '#fa8c16', bg: 'rgba(250,140,22,0.15)' },
  1: { label: '行动中', color: '#1677ff', bg: 'rgba(22,119,255,0.15)' },
  2: { label: '待确认', color: '#722ed1', bg: 'rgba(114,46,209,0.15)' },
  3: { label: '已完成', color: '#52c41a', bg: 'rgba(82,196,26,0.15)' },
  4: { label: '退回', color: '#ff4d4f', bg: 'rgba(255,77,79,0.15)' },
  5: { label: '已挂起', color: '#999', bg: 'rgba(153,153,153,0.15)' },
};

interface ImprovementItem {
  id: number;
  request_no: string;
  title: string;
  requirement_desc: string;
  expected_result: string;
  deadline: string;
  applicant_id: number;
  applicant_name: string;
  assigned_to_id: number | null;
  assigned_to_name: string;
  status: number;
  created_at: string;
  updated_at: string;
}

interface FeedbackItem {
  id: number;
  request_id: number;
  action_plan: string;
  action_records: string;
  planned_completion: string;
  feedback_user_id: number;
  feedback_user_name: string;
  feedback_time: string;
  acceptance_opinion: string;
  rejection_reason: string;
  completion_confirmed_at: string;
  created_at: string;
}

interface DetailData extends ImprovementItem {
  feedbacks: FeedbackItem[];
}

export default function ImprovementList() {
  const { user, isSuperAdmin } = useAuth();

  // 列表数据
  const [myList, setMyList] = useState<ImprovementItem[]>([]);
  const [todoList, setTodoList] = useState<ImprovementItem[]>([]);
  const [allList, setAllList] = useState<ImprovementItem[]>([]);
  const [activeTab, setActiveTab] = useState<'my' | 'todo' | 'all'>('my');
  const [loading, setLoading] = useState(false);

  // 弹窗
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<DetailData | null>(null);
  const [showAssign, setShowAssign] = useState<ImprovementItem | null>(null);
  const [showFeedback, setShowFeedback] = useState<ImprovementItem | null>(null);
  const [showConfirm, setShowConfirm] = useState<ImprovementItem | null>(null);
  const [showEdit, setShowEdit] = useState<ImprovementItem | null>(null);

  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<ImprovementItem | null>(null);

  // 用户列表
  const [userList, setUserList] = useState<{ id: number; username: string }[]>([]);

  // 表单
  const [createForm, setCreateForm] = useState({
    title: '',
    requirement_desc: '',
    expected_result: '',
    deadline: '',
    assigned_to_id: '',
  });
  const [editForm, setEditForm] = useState({
    title: '',
    requirement_desc: '',
    expected_result: '',
    deadline: '',
    assigned_to_id: '',
  });
  const [assignForm, setAssignForm] = useState({ action_plan: '', action_records: '', planned_completion: '' });
  const [feedbackForm, setFeedbackForm] = useState({ action_plan: '', action_records: '', planned_completion: '' });
  const [confirmAction, setConfirmAction] = useState<'complete' | 'reject'>('complete');
  const [acceptanceOpinion, setAcceptanceOpinion] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // 状态筛选
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const anyModalOpen = showCreate || !!showDetail || !!showAssign || !!showFeedback || !!showConfirm || !!showEdit || !!deleteTarget;
  useBodyScrollLock(anyModalOpen);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users/list', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUserList(data);
      }
    } catch (_) {}
  }, []);

  // 加载我的申请
  const loadMyList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { tab: 'my' };
      if (statusFilter !== '') params.status = statusFilter;
      const res = await improvementApi.list(params);
      setMyList(res.data);
    } catch (err: any) {
      showToast('加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // 加载我的待办
  const loadTodoList = useCallback(async () => {
    try {
      const res = await improvementApi.list({ tab: 'todo' });
      setTodoList(res.data);
    } catch (_) {}
  }, []);

  // 加载全部数据（超级管理员）
  const loadAllList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { tab: 'all' };
      if (statusFilter !== '') params.status = statusFilter;
      const res = await improvementApi.list(params);
      setAllList(res.data);
    } catch (err: any) {
      showToast('加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadUsers();
    loadMyList();
    loadTodoList();
    if (isSuperAdmin) loadAllList();
  }, []);

  useEffect(() => {
    if (activeTab === 'my') loadMyList();
    if (activeTab === 'all') loadAllList();
  }, [activeTab, statusFilter]);

  // 定时刷新
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'my') loadMyList();
      if (activeTab === 'all') loadAllList();
      loadTodoList();
    }, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // ===== 下拉刷新（移动端） =====
  const [pullRefreshState, setPullRefreshState] = useState<'idle' | 'pulling' | 'releasing' | 'refreshing'>('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartY = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const PULL_THRESHOLD = 80;
  const MAX_PULL = 120;

  const doRefresh = useCallback(async () => {
    setPullRefreshState('refreshing');
    try {
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
      await new Promise(r => setTimeout(r, 600));
    } finally {
      setPullRefreshState('idle');
      setPullDistance(0);
    }
  }, [isSuperAdmin]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (pullRefreshState !== 'idle') return;
    const target = e.target as HTMLElement;
    if (target.closest('.modal, .modal-overlay')) return;
    if (e.currentTarget.scrollTop > 0) return;
    pullStartY.current = e.touches[0].clientY;
  }, [pullRefreshState]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (pullRefreshState === 'refreshing') return;
    if (e.currentTarget.scrollTop > 0) {
      setPullRefreshState('idle');
      setPullDistance(0);
      return;
    }
    const delta = e.touches[0].clientY - pullStartY.current;
    if (delta > 0) {
      const damped = Math.min(delta * 0.4, MAX_PULL);
      setPullDistance(damped);
      setPullRefreshState(damped >= PULL_THRESHOLD ? 'releasing' : 'pulling');
    }
  }, [pullRefreshState]);

  const handleTouchEnd = useCallback(() => {
    if (pullRefreshState === 'refreshing' || pullRefreshState === 'idle') return;
    if (pullDistance >= PULL_THRESHOLD) {
      doRefresh();
    } else {
      setPullRefreshState('idle');
      setPullDistance(0);
    }
  }, [pullRefreshState, pullDistance, doRefresh]);

  // ===== 新建申请 =====
  const handleCreateChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCreateForm(prev => ({ ...prev, [name]: value }));
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim() || !createForm.requirement_desc.trim()) {
      showToast('请填写申请标题和需求说明', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await improvementApi.create({
        title: createForm.title.trim(),
        requirement_desc: createForm.requirement_desc.trim(),
        expected_result: createForm.expected_result.trim(),
        deadline: createForm.deadline,
        assigned_to_id: createForm.assigned_to_id ? Number(createForm.assigned_to_id) : undefined,
      });
      setShowCreate(false);
      setCreateForm({ title: '', requirement_desc: '', expected_result: '', deadline: '', assigned_to_id: '' });
      showToast('申请提交成功', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 编辑申请 =====
  const openEdit = (item: ImprovementItem) => {
    setShowEdit(item);
    setEditForm({
      title: item.title,
      requirement_desc: item.requirement_desc,
      expected_result: item.expected_result,
      deadline: item.deadline,
      assigned_to_id: item.assigned_to_id ? String(item.assigned_to_id) : '',
    });
  };

  const handleEditChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.title.trim() || !editForm.requirement_desc.trim()) {
      showToast('请填写申请标题和需求说明', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await improvementApi.update(showEdit!.id, {
        title: editForm.title.trim(),
        requirement_desc: editForm.requirement_desc.trim(),
        expected_result: editForm.expected_result.trim(),
        deadline: editForm.deadline,
        assigned_to_id: editForm.assigned_to_id ? Number(editForm.assigned_to_id) : undefined,
      });
      setShowEdit(null);
      showToast('编辑成功，需要重新提交给指定人反馈', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '编辑失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 查看详情 =====
  const openDetail = async (item: ImprovementItem) => {
    try {
      const res = await improvementApi.getDetail(item.id);
      setShowDetail(res.data);
    } catch (_) {
      showToast('加载详情失败', 'error');
    }
  };

  // ===== 制定方案 =====
  const openAssign = (item: ImprovementItem) => {
    setShowAssign(item);
    setAssignForm({ action_plan: '', action_records: '', planned_completion: '' });
  };

  const handleAssignChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAssignForm(prev => ({ ...prev, [name]: value }));
  };

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.action_plan.trim()) {
      showToast('请填写行动方案', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await improvementApi.assign(showAssign!.id, assignForm);
      setShowAssign(null);
      showToast('方案已制定', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 提交反馈 =====
  const openFeedbackModal = (item: ImprovementItem) => {
    setShowFeedback(item);
    setFeedbackForm({ action_plan: '', action_records: '', planned_completion: '' });
  };

  const handleFeedbackChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFeedbackForm(prev => ({ ...prev, [name]: value }));
  };

  const submitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackForm.action_plan.trim()) {
      showToast('请填写行动方案', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await improvementApi.feedback(showFeedback!.id, feedbackForm);
      setShowFeedback(null);
      showToast('反馈已提交', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 确认完成 / 退回 =====
  const openConfirmModal = (item: ImprovementItem) => {
    setShowConfirm(item);
    setConfirmAction('complete');
    setAcceptanceOpinion('');
    setRejectionReason('');
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmAction === 'reject' && !rejectionReason.trim()) {
      showToast('退回时请填写退回原因', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await improvementApi.confirm(showConfirm!.id, {
        action: confirmAction,
        acceptance_opinion: acceptanceOpinion.trim(),
        rejection_reason: rejectionReason.trim(),
      });
      setShowConfirm(null);
      showToast(confirmAction === 'complete' ? '已确认完成' : '已退回', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== 申请人直接结束 =====
  const handleCompleteDirect = async (item: ImprovementItem) => {
    if (!window.confirm(`确定直接结束"${item.title}"吗？`)) return;
    try {
      await improvementApi.completeDirect(item.id);
      showToast('申请已结束', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    }
  };

  // ===== 申请人挂起 =====
  const handleSuspend = async (item: ImprovementItem) => {
    if (!window.confirm(`确定挂起"${item.title}"吗？挂起后可随时恢复。`)) return;
    try {
      await improvementApi.suspend(item.id);
      showToast('申请已挂起', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    }
  };

  // ===== 申请人恢复 =====
  const handleResume = async (item: ImprovementItem) => {
    if (!window.confirm(`确定恢复"${item.title}"吗？恢复后将回到待反馈状态。`)) return;
    try {
      await improvementApi.resume(item.id);
      showToast('申请已恢复', 'success');
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '操作失败', 'error');
    }
  };

  // ===== 删除 =====
  const handleDelete = async (item: ImprovementItem) => {
    try {
      await improvementApi.delete(item.id);
      showToast('删除成功', 'success');
      setDeleteTarget(null);
      loadMyList();
      loadTodoList();
      if (isSuperAdmin) loadAllList();
    } catch (err: any) {
      showToast(err.response?.data?.error || '删除失败', 'error');
    }
  };

  // ===== 状态标签 =====
  const StatusTag = ({ status }: { status: number }) => {
    const s = STATUS_MAP[status] || { label: '未知', color: '#999', bg: 'rgba(0,0,0,0.1)' };
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 12, fontWeight: 600,
        color: s.color, background: s.bg,
      }}>{s.label}</span>
    );
  };

  // 判断申请人是否可以操作的状态
  const isEditable = (s: number) => s !== 3; // 除已完成外都不可编辑（后端控制具体哪些可以）
  const isSuspended = (s: number) => s === 5;

  // ===== 渲染卡片列表 =====
  const renderCard = (item: ImprovementItem) => {
    const isAssignee = user?.id === item.assigned_to_id;
    const isApplicant = user?.id === item.applicant_id;
    const s = item.status;
    const isUnfinished = s !== 3 && s !== 5; // 未完结：不是已完成也不是已挂起

    return (
      <div key={item.id} className="improvement-card" onClick={() => openDetail(item)}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-glow)', borderRadius: 10,
          padding: '14px 16px', marginBottom: 10, cursor: 'pointer',
          transition: 'all 0.2s', position: 'relative',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-cyan)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-glow)'; }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
              {item.request_no}
            </span>
            <StatusTag status={s} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* ===== 申请人操作按钮 ===== */}
            {isApplicant && (
              <>
                {/* 编辑（未完结状态） */}
                {s !== 3 && (
                  <button className="btn-action" onClick={e => { e.stopPropagation(); openEdit(item); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-glow)',
                      background: 'var(--bg-card)', color: 'var(--accent-cyan)', cursor: 'pointer' }}>
                    编辑
                  </button>
                )}
                {/* 挂起（未完结且非已挂起） */}
                {isUnfinished && (
                  <button className="btn-action" onClick={e => { e.stopPropagation(); handleSuspend(item); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(153,153,153,0.4)',
                      background: 'transparent', color: '#999', cursor: 'pointer' }}>
                    挂起
                  </button>
                )}
                {/* 结束（未完结） */}
                {isUnfinished && (
                  <button className="btn-action" onClick={e => { e.stopPropagation(); handleCompleteDirect(item); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(82,196,26,0.4)',
                      background: 'transparent', color: '#52c41a', cursor: 'pointer' }}>
                    结束
                  </button>
                )}
                {/* 恢复（已挂起） */}
                {isSuspended(s) && (
                  <button className="btn-action" onClick={e => { e.stopPropagation(); handleResume(item); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-glow)',
                      background: 'var(--bg-card)', color: '#1677ff', cursor: 'pointer' }}>
                    恢复
                  </button>
                )}
                {/* 待确认 → 确认/退回 */}
                {s === 2 && (
                  <button className="btn-action" onClick={e => { e.stopPropagation(); openConfirmModal(item); }}
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-glow)',
                      background: 'var(--bg-card)', color: '#52c41a', cursor: 'pointer' }}>
                    确认处理
                  </button>
                )}
              </>
            )}
            {/* ===== 指定人操作按钮 ===== */}
            {isAssignee && (s === 0 || s === 4) && (
              <button className="btn-action" onClick={e => { e.stopPropagation(); openAssign(item); }}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-glow)',
                  background: 'var(--bg-card)', color: 'var(--accent-cyan)', cursor: 'pointer' }}>
                制定方案
              </button>
            )}
            {isAssignee && s === 1 && (
              <button className="btn-action" onClick={e => { e.stopPropagation(); openFeedbackModal(item); }}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border-glow)',
                  background: 'var(--bg-card)', color: '#fa8c16', cursor: 'pointer' }}>
                提交反馈
              </button>
            )}
            {/* ===== 超级管理员删除按钮（不限状态） ===== */}
            {isSuperAdmin && (
              <button onClick={e => { e.stopPropagation(); setDeleteTarget(item); }}
                style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, border: '1px solid rgba(255,77,79,0.4)',
                  background: 'rgba(255,77,79,0.08)', color: '#ff4d4f', cursor: 'pointer', zIndex: 2, position: 'relative' }}>
                删除
              </button>
            )}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, lineHeight: 1.4 }}>
          {item.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.requirement_desc}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <span>申请人: {item.applicant_name}</span>
          {item.assigned_to_name && <span>指定人: {item.assigned_to_name}</span>}
          <span>{item.created_at?.slice(0, 16)}</span>
        </div>
      </div>
    );
  };

  // ===== 表单/弹窗通用样式 =====
  const modalStyle: React.CSSProperties = { maxWidth: 520, width: '92vw' };
  const fieldStyle: React.CSSProperties = { marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', borderRadius: 6,
    border: '1px solid var(--border-glow)', fontSize: 14, boxSizing: 'border-box',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
  };
  const textareaStyle: React.CSSProperties = { ...inputStyle, resize: 'vertical' };
  const btnRowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20,
  };

  const tabKeys = isSuperAdmin
    ? ([
        { key: 'my', label: '我的申请', count: myList.length },
        { key: 'todo', label: '我的待办', count: todoList.length },
        { key: 'all', label: '全部数据', count: allList.length },
      ] as const)
    : ([
        { key: 'my', label: '我的申请', count: myList.length },
        { key: 'todo', label: '我的待办', count: todoList.length },
      ] as const);

  const getCurrentList = () => {
    if (activeTab === 'my') return myList;
    if (activeTab === 'todo') return todoList;
    return allList;
  };

  return (
    <div ref={pageRef} className="page-container"
      style={{ padding: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ===== 下拉刷新指示器 ===== */}
      {pullRefreshState !== 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: pullRefreshState === 'refreshing' ? 50 : pullDistance,
          overflow: 'hidden', transition: pullRefreshState === 'refreshing' ? 'height 0.2s' : 'none',
          fontSize: 13, color: 'var(--text-muted)', gap: 8,
        }}>
          <span style={{
            display: 'inline-block', fontSize: 16,
            animation: pullRefreshState === 'refreshing' ? 'spin 0.8s linear infinite' : 'none',
            transform: pullRefreshState === 'releasing' ? 'rotate(180deg)' : pullDistance > 20 ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}>{'↻'}</span>
          <span>
            {pullRefreshState === 'pulling' ? '下拉刷新...' :
             pullRefreshState === 'releasing' ? '释放刷新' :
             pullRefreshState === 'refreshing' ? '刷新中...' : ''}
          </span>
        </div>
      )}

      {/* ===== Toast ===== */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8,
          background: toast.type === 'success' ? '#52c41a' : '#ff4d4f',
          color: '#fff', fontWeight: 600, fontSize: 14,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'fadeIn 0.2s ease', maxWidth: 360,
        }}>
          {toast.msg}
        </div>
      )}

      {/* ===== 页面标题 + 工具栏 ===== */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, marginBottom: 16,
      }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>现场改善</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, width: 110, padding: '5px 8px', fontSize: 13 }}>
            <option value="">全部状态</option>
            <option value="0">待反馈</option>
            <option value="1">行动中</option>
            <option value="2">待确认</option>
            <option value="3">已完成</option>
            <option value="4">退回</option>
            <option value="5">已挂起</option>
          </select>
          <button className="primary" onClick={() => setShowCreate(true)}
            style={{ padding: '7px 16px', whiteSpace: 'nowrap' }}>
            + 新建申请
          </button>
        </div>
      </div>

      {/* ===== Tab 切换 ===== */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 16,
        borderBottom: '1px solid var(--border-glow)',
      }}>
        {tabKeys.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              background: 'none', color: activeTab === tab.key ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              marginBottom: -1, transition: 'all 0.2s', position: 'relative',
            }}>
            {tab.label}
            <span style={{
              marginLeft: 6, fontSize: 11, padding: '1px 6px', borderRadius: 8,
              background: activeTab === tab.key ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.08)',
              color: activeTab === tab.key ? 'var(--accent-cyan)' : 'var(--text-muted)',
            }}>{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ===== 内容区 ===== */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>加载中...</div>
      ) : activeTab === 'todo' ? (
        /* 我的待办 */
        <>
          {todoList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              ✅ 暂无待办事项
            </div>
          ) : (
            <>
              {(() => {
                const items = todoList.filter(i => i.status === 0 || i.status === 4);
                if (items.length > 0) return (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#fa8c16', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📝 需要制定方案</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
                    </h4>
                    {items.map(renderCard)}
                  </div>
                );
                return null;
              })()}
              {(() => {
                const items = todoList.filter(i => i.status === 1);
                if (items.length > 0) return (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#1677ff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>🔄 行动中</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({items.length})</span>
                    </h4>
                    {items.map(renderCard)}
                  </div>
                );
                return null;
              })()}
            </>
          )}
        </>
      ) : (
        /* 我的申请 / 全部数据 - 按状态分组 */
        <>
          {(() => {
            const list = getCurrentList();
            const pendingConfirm = list.filter(i => i.status === 2);
            const completed = list.filter(i => i.status === 3);
            const suspended = list.filter(i => i.status === 5);
            const others = list.filter(i => i.status !== 2 && i.status !== 3 && i.status !== 5);

            if (list.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  {activeTab === 'all' ? '暂无数据' : '暂无申请，点击"新建申请"发起'}
                </div>
              );
            }

            return (
              <>
                {pendingConfirm.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#722ed1', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⏳ 待确认</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({pendingConfirm.length})</span>
                    </h4>
                    {pendingConfirm.map(renderCard)}
                  </div>
                )}
                {others.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>📋 进行中</span>
                      <span style={{ fontSize: 12, fontWeight: 400 }}>({others.length})</span>
                    </h4>
                    {others.map(renderCard)}
                  </div>
                )}
                {suspended.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#999', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⏸️ 已挂起</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({suspended.length})</span>
                    </h4>
                    {suspended.map(renderCard)}
                  </div>
                )}
                {completed.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ margin: '0 0 10px', color: '#52c41a', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>✅ 已完成</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>({completed.length})</span>
                    </h4>
                    {completed.map(renderCard)}
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* ===== 新建申请弹窗 ===== */}
      {showCreate && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>新建申请</h3>
            <form onSubmit={submitCreate}>
              <div style={fieldStyle}>
                <label style={labelStyle}>申请标题 *</label>
                <input style={inputStyle} name="title" value={createForm.title}
                  onChange={handleCreateChange} required placeholder="简短描述改善事项" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>需求说明 *</label>
                <textarea style={{ ...textareaStyle, minHeight: 70 }} name="requirement_desc"
                  value={createForm.requirement_desc} onChange={handleCreateChange}
                  required placeholder="详细描述需要改善的问题或需求" rows={3} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>期望结果</label>
                  <textarea style={{ ...textareaStyle, minHeight: 50 }} name="expected_result"
                    value={createForm.expected_result} onChange={handleCreateChange}
                    placeholder="期望达成的效果" rows={2} />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>期望完成时间</label>
                  <input style={inputStyle} name="deadline" type="date"
                    value={createForm.deadline} onChange={handleCreateChange} />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>指定处理人</label>
                <select style={inputStyle} name="assigned_to_id" value={createForm.assigned_to_id}
                  onChange={handleCreateChange}>
                  <option value="">不指定（可选）</option>
                  {userList.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setShowCreate(false)}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '提交中...' : '提交申请'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 编辑申请弹窗 ===== */}
      {showEdit && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>编辑申请</h3>
            <p style={{ fontSize: 13, color: '#fa8c16', marginBottom: 12 }}>
              {showEdit.request_no} — {showEdit.title}
              <br />编辑后状态将回到"待反馈"，需要重新提交给指定人反馈。
            </p>
            <form onSubmit={submitEdit}>
              <div style={fieldStyle}>
                <label style={labelStyle}>申请标题 *</label>
                <input style={inputStyle} name="title" value={editForm.title}
                  onChange={handleEditChange} required placeholder="简短描述改善事项" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>需求说明 *</label>
                <textarea style={{ ...textareaStyle, minHeight: 70 }} name="requirement_desc"
                  value={editForm.requirement_desc} onChange={handleEditChange}
                  required placeholder="详细描述需要改善的问题或需求" rows={3} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>期望结果</label>
                  <textarea style={{ ...textareaStyle, minHeight: 50 }} name="expected_result"
                    value={editForm.expected_result} onChange={handleEditChange}
                    placeholder="期望达成的效果" rows={2} />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>期望完成时间</label>
                  <input style={inputStyle} name="deadline" type="date"
                    value={editForm.deadline} onChange={handleEditChange} />
                </div>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>指定处理人</label>
                <select style={inputStyle} name="assigned_to_id" value={editForm.assigned_to_id}
                  onChange={handleEditChange}>
                  <option value="">不指定（可选）</option>
                  {userList.map(u => (
                    <option key={u.id} value={u.id}>{u.username}</option>
                  ))}
                </select>
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setShowEdit(null)}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '提交中...' : '保存并重新提交'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 详情弹窗 ===== */}
      {showDetail && createPortal(
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal" style={{ ...modalStyle, maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16 }}>申请详情</h3>
              <button type="button" onClick={() => setShowDetail(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* 基本信息 */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                  {showDetail.request_no}
                </span>
                <StatusTag status={showDetail.status} />
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                {showDetail.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap' }}>
                {showDetail.requirement_desc}
              </div>
              {showDetail.expected_result && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                  期望结果：{showDetail.expected_result}
                </div>
              )}
              {showDetail.deadline && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
                  期望完成时间：{showDetail.deadline}
                </div>
              )}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                <span>申请人：{showDetail.applicant_name}</span>
                {showDetail.assigned_to_name && <span>指定人：{showDetail.assigned_to_name}</span>}
                <span>提交时间：{showDetail.created_at?.slice(0, 16)}</span>
              </div>
            </div>

            {/* 反馈历史 */}
            {showDetail.feedbacks && showDetail.feedbacks.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, color: 'var(--text-primary)', margin: '0 0 10px' }}>反馈记录</h4>
                {showDetail.feedbacks.map((fb, idx) => (
                  <div key={fb.id} style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 12, marginBottom: 8,
                    borderLeft: '3px solid var(--accent-cyan)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      #{idx + 1} {fb.feedback_user_name} · {fb.feedback_time?.slice(0, 16)}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                      <strong>行动方案：</strong>{fb.action_plan}
                    </div>
                    {fb.action_records && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <strong>行动记录：</strong>{fb.action_records}
                      </div>
                    )}
                    {fb.planned_completion && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        计划完成：{fb.planned_completion}
                      </div>
                    )}
                    {fb.acceptance_opinion && (
                      <div style={{ fontSize: 13, color: '#52c41a', marginTop: 4 }}>
                        ✅ 验收意见：{fb.acceptance_opinion}
                      </div>
                    )}
                    {fb.rejection_reason && (
                      <div style={{ fontSize: 13, color: '#ff4d4f', marginTop: 4 }}>
                        ↩️ 退回原因：{fb.rejection_reason}
                      </div>
                    )}
                    {fb.completion_confirmed_at && (
                      <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>
                        确认完成时间：{fb.completion_confirmed_at}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 操作按钮 */}
            <div style={btnRowStyle}>
              {showDetail.applicant_id === user?.id && showDetail.status !== 3 && (
                <button style={{ ...btnActionStyle }}
                  onClick={() => { const d = showDetail; setShowDetail(null); openEdit(d); }}>
                  编辑
                </button>
              )}
              {showDetail.assigned_to_id === user?.id && (showDetail.status === 0 || showDetail.status === 4) && (
                <button className="primary" onClick={() => { const d = showDetail; setShowDetail(null); openAssign(d); }}>
                  制定方案
                </button>
              )}
              {showDetail.assigned_to_id === user?.id && showDetail.status === 1 && (
                <button className="primary" style={{ background: '#fa8c16', borderColor: '#fa8c16' }}
                  onClick={() => { const d = showDetail; setShowDetail(null); openFeedbackModal(d); }}>
                  提交反馈
                </button>
              )}
              {showDetail.applicant_id === user?.id && showDetail.status === 2 && (
                <button className="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}
                  onClick={() => { const d = showDetail; setShowDetail(null); openConfirmModal(d); }}>
                  确认处理
                </button>
              )}
              {isSuperAdmin && (
                <button
                  style={{
                    fontSize: 13, padding: '6px 12px', borderRadius: 6,
                    border: '1px solid rgba(255,77,79,0.4)',
                    background: 'rgba(255,77,79,0.15)', color: '#ff4d4f', cursor: 'pointer',
                    fontWeight: 500,
                  }}
                  onClick={() => {
                    const d = showDetail;
                    setShowDetail(null);
                    setDeleteTarget(d);
                  }}>
                  🗑 删除此申请
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 制定方案弹窗 ===== */}
      {showAssign && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>制定方案</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {showAssign.request_no} — {showAssign.title}
              {showAssign.status === 4 && <span style={{ color: '#ff4d4f', marginLeft: 8 }}>（已退回，请重新制定）</span>}
            </p>
            <form onSubmit={submitAssign}>
              <div style={fieldStyle}>
                <label style={labelStyle}>行动方案 *</label>
                <textarea style={{ ...textareaStyle, minHeight: 80 }} name="action_plan"
                  value={assignForm.action_plan} onChange={handleAssignChange}
                  required placeholder="详细描述实施方案" rows={4} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>行动记录</label>
                  <textarea style={{ ...textareaStyle, minHeight: 60 }} name="action_records"
                    value={assignForm.action_records} onChange={handleAssignChange}
                    placeholder="实际执行记录" rows={3} />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>计划完成时间</label>
                  <input style={inputStyle} name="planned_completion" type="date"
                    value={assignForm.planned_completion} onChange={handleAssignChange} />
                </div>
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setShowAssign(null)}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '提交中...' : '确认制定'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 提交反馈弹窗 ===== */}
      {showFeedback && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>提交反馈</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {showFeedback.request_no} — {showFeedback.title}
            </p>
            <form onSubmit={submitFeedback}>
              <div style={fieldStyle}>
                <label style={labelStyle}>行动方案 *</label>
                <textarea style={{ ...textareaStyle, minHeight: 80 }} name="action_plan"
                  value={feedbackForm.action_plan} onChange={handleFeedbackChange}
                  required placeholder="详细描述实施方案" rows={4} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={fieldStyle}>
                  <label style={labelStyle}>行动记录</label>
                  <textarea style={{ ...textareaStyle, minHeight: 60 }} name="action_records"
                    value={feedbackForm.action_records} onChange={handleFeedbackChange}
                    placeholder="实际执行记录" rows={3} />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>计划完成时间</label>
                  <input style={inputStyle} name="planned_completion" type="date"
                    value={feedbackForm.planned_completion} onChange={handleFeedbackChange} />
                </div>
              </div>
              <div style={btnRowStyle}>
                <button type="button" onClick={() => setShowFeedback(null)}>取消</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? '提交中...' : '确认提交'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 确认完成 / 退回弹窗 ===== */}
      {showConfirm && createPortal(
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>确认处理结果</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              {showConfirm.request_no} — {showConfirm.title}
            </p>
            <form onSubmit={submitConfirm}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="radio" name="confirmAction" checked={confirmAction === 'complete'}
                    onChange={() => setConfirmAction('complete')} />
                  ✅ 确认完成
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="radio" name="confirmAction" checked={confirmAction === 'reject'}
                    onChange={() => setConfirmAction('reject')} />
                  ↩️ 退回
                </label>
              </div>

              {confirmAction === 'complete' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>验收意见（可选）</label>
                  <textarea style={{ ...textareaStyle, minHeight: 60 }} value={acceptanceOpinion}
                    onChange={e => setAcceptanceOpinion(e.target.value)}
                    placeholder="对完成情况的评价" rows={3} />
                </div>
              )}

              {confirmAction === 'reject' && (
                <div style={fieldStyle}>
                  <label style={labelStyle}>退回原因 *</label>
                  <textarea style={{ ...textareaStyle, minHeight: 60 }} value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    required placeholder="请说明退回原因，以便指定人重新制定方案" rows={3} />
                </div>
              )}

              <div style={btnRowStyle}>
                <button type="button" onClick={() => setShowConfirm(null)}>取消</button>
                <button type="submit" className="primary"
                  style={{ background: confirmAction === 'complete' ? '#52c41a' : '#ff4d4f', borderColor: 'transparent' }}
                  disabled={submitting}>
                  {submitting ? '提交中...' : confirmAction === 'complete' ? '确认完成' : '确认退回'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 删除确认弹窗 ===== */}
      {deleteTarget && createPortal(
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal" style={{ maxWidth: 400, width: '90vw', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>确认删除</h3>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 20px', lineHeight: 1.6 }}>
              确定要删除申请 <strong>"{deleteTarget.title}"</strong> 吗？<br />
              删除后不可恢复。
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: '1px solid var(--border-glow)',
                  background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
                }}>
                取消
              </button>
              <button
                onClick={() => handleDelete(deleteTarget)}
                disabled={submitting}
                style={{
                  padding: '10px 24px', borderRadius: 8, border: 'none',
                  background: '#ff4d4f', color: '#fff', fontSize: 14, cursor: 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}>
                {submitting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ===== 嵌入页面样式 ===== */}
      <style>{`
        .improvement-card:hover {
          border-color: var(--accent-cyan) !important;
          box-shadow: 0 0 12px rgba(0, 212, 255, 0.1);
          transform: translateY(-1px);
        }
        @media screen and (max-width: 768px) {
          .improvement-card {
            padding: 12px !important;
          }
        }
      `}</style>
      {pullRefreshState === 'refreshing' && <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>}
    </div>
  );
}

const btnActionStyle: React.CSSProperties = {
  fontSize: 13, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-glow)',
  background: 'var(--bg-card)', color: 'var(--accent-cyan)', cursor: 'pointer',
};
