import { useState, useEffect, useCallback, useRef } from 'react';
import ModalPortal from '../components/ModalPortal';
import { useNavigate } from 'react-router-dom';
import { deviceApi, repairApi, partApi, maintenanceApi } from '../services/api';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useAuth } from '../hooks/useAuth';
import ZoneMap from '../components/ZoneMap';

function today() {
  return new Date().toISOString().slice(0, 10);
}

// 获取当前登录用户名
const getCurrentUsername = () => {
  try {
    const stored = localStorage.getItem('equip_user');
    if (stored) {
      const user = JSON.parse(stored);
      return user.username || '';
    }
  } catch (e) {}
  return '';
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user, isAdmin, isOperator } = useAuth();

  // 页面访问权限检查
  useEffect(() => {
    if (!user) {
      window.location.href = '/login';
      return;
    }
  }, [user]);

  // ===== 统计数据 =====
  const [stats, setStats] = useState({
    totalDevices: 0,
    onlineDevices: 0,
    monthFaults: 0,
    lowStockParts: 0,
    pendingRepairs: 0,
  });
  const [pendingRepairs, setPendingRepairs] = useState<any[]>([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([]);
  const [lowStockParts, setLowStockParts] = useState<any[]>([]);
  const [recentFaults, setRecentFaults] = useState<any[]>([]);
  const [upcomingMaintenance, setUpcomingMaintenance] = useState<any[]>([]);

  // ===== 语音播报：待处理工单到来时 =====
  const prevPendingRef = useRef(-1);
  const prevUnacceptedRef = useRef(-1);
  const speechPrimedRef = useRef(false);
  const alertIntervalRef = useRef<ReturnType<typeof setInterval>>();
  const loginAlertDoneRef = useRef(false);

  // 首次用户交互时启动语音引擎
  useEffect(() => {
    const prime = async () => {
      if (speechPrimedRef.current) return;
      speechPrimedRef.current = true;
      // 移动端 AudioContext 需在用户手势中创建并 resume
      try {
        const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (ac.state === 'suspended') await ac.resume();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0.01;
        osc.connect(gain); gain.connect(ac.destination);
        osc.start(0); osc.stop(0.01);
      } catch (_) {}
      if (!('speechSynthesis' in window)) return;
      try { window.speechSynthesis.getVoices(); } catch (_) {}
    };
    document.addEventListener('click', prime, { once: true });
    document.addEventListener('touchstart', prime, { once: true });
    return () => {
      document.removeEventListener('click', prime);
      document.removeEventListener('touchstart', prime);
    };
  }, []);

  const speakAlert = useCallback(() => {
    // 警报蜂鸣（AudioContext，兼容性好）
    const playAlarm = (): Promise<void> => {
      return new Promise(resolve => {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const resumeAndPlay = () => {
            if (ctx.state === 'suspended') { ctx.resume().then(doPlay); return; }
            doPlay();
          };
          const doPlay = () => {
            const now = ctx.currentTime;
            [0, 0.2, 0.4].forEach((offset) => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'square'; osc.frequency.value = 880;
              gain.gain.setValueAtTime(0.3, now + offset);
              gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
              osc.connect(gain); gain.connect(ctx.destination);
              osc.start(now + offset); osc.stop(now + offset + 0.15);
            });
            setTimeout(() => { ctx.close(); resolve(); }, 800);
          };
          resumeAndPlay();
        } catch (_) { resolve(); }
      });
    };

    const doSpeech = () => {
      if (!('speechSynthesis' in window)) return;
      try { window.speechSynthesis.cancel(); window.speechSynthesis.resume(); } catch (_) {}
      const text = '您有新的工单急需处理';
      let count = 0;
      const speakNext = () => {
        if (count >= 2) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN'; utter.rate = 0.9; utter.volume = 1.0;
        utter.onend = () => { count++; setTimeout(speakNext, 100); };
        utter.onerror = () => { count++; setTimeout(speakNext, 100); };
        try { window.speechSynthesis.speak(utter); } catch (_) { count++; }
      };
      setTimeout(speakNext, 300);
    };

    playAlarm().then(() => { setTimeout(doSpeech, 200); });
  }, []);

  // 数据加载函数
  const loadDashboardData = useCallback(() => {
    Promise.all([
      deviceApi.list().catch(() => ({ data: [] })),
      repairApi.list().catch(() => ({ data: [] })),
      partApi.list().catch(() => ({ data: [] })),
      maintenanceApi.list().catch(() => ({ data: [] })),
      // 管理员额外加载待审批领用申请
      isAdmin ? partApi.usagePending().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
    ]).then(([devices, repairs, parts, maintenance, pendingWithdrawRes]) => {
      const deviceList = devices.data || [];
      const repairList = repairs.data || repairs || [];
      const partList = parts.data || [];
      const maintList = maintenance.data || [];
      const pendingWithdrawalsList = pendingWithdrawRes?.data || [];

      setStats({
        totalDevices: deviceList.length,
        onlineDevices: deviceList.filter((d: any) => d.status === '正常').length,
        monthFaults: repairList.filter((r: any) => {
          if (!r.report_date) return false;
          if (r.work_order_type !== '设备维修') return false; // 只统计设备维修
          const reportMonth = r.report_date.slice(0, 7);
          const nowMonth = new Date().toISOString().slice(0, 7);
          return reportMonth === nowMonth;
        }).length,
        lowStockParts: partList.filter((p: any) => p.stock < p.safety_stock).length,
        pendingRepairs: repairList.filter((r: any) => r.status !== '已完成').length,
      });

      // 待审批物品领用申请（仅管理员可见）
      setPendingWithdrawals(
        pendingWithdrawalsList.slice(0, 5).map((w: any) => ({
          id: w.id,
          partName: w.part_name || w.part_id,
          partSpec: w.part_spec,
          quantity: w.quantity,
          handler: w.handler,
          line: w.line,
          logDate: w.log_date,
          purpose: w.purpose,
        }))
      );

      setStats({
        totalDevices: deviceList.length,
        onlineDevices: deviceList.filter((d: any) => d.status === '正常').length,
        monthFaults: repairList.filter((r: any) => {
          if (!r.report_date) return false;
          if (r.work_order_type !== '设备维修') return false; // 只统计设备维修
          const reportMonth = r.report_date.slice(0, 7);
          const nowMonth = new Date().toISOString().slice(0, 7);
          return reportMonth === nowMonth;
        }).length,
        lowStockParts: partList.filter((p: any) => p.stock < p.safety_stock).length,
        pendingRepairs: repairList.filter((r: any) => r.status !== '已完成').length,
      });

      // 检测待处理工单增多 → 语音播报（仅"待处理"状态，不含"处理中"）
      const unacceptedCount = repairList.filter((r: any) => r.status === '待处理').length;

      // 管理员登录时如果有待处理工单，播报一次
      if (isAdmin && !loginAlertDoneRef.current && unacceptedCount > 0) {
        loginAlertDoneRef.current = true;
        speakAlert();
      }

      if (isAdmin && prevPendingRef.current >= 0 && unacceptedCount > prevPendingRef.current) {
        speakAlert();
      }
      prevPendingRef.current = unacceptedCount;

      // 未接单工单每5分钟重复播报
      if (isAdmin && unacceptedCount > 0 && unacceptedCount !== prevUnacceptedRef.current) {
        prevUnacceptedRef.current = unacceptedCount;
        if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
        alertIntervalRef.current = setInterval(() => {
          speakAlert();
        }, 300000); // 5分钟
      } else if (unacceptedCount === 0 && alertIntervalRef.current) {
        clearInterval(alertIntervalRef.current);
        alertIntervalRef.current = undefined;
      }

      setPendingRepairs(
        repairList
          .filter((r: any) => r.status !== '已完成')
          .slice(0, 5)
          .map((r: any) => ({
            id: r.id,
            workOrderNo: r.work_order_no?.replace('WO-', ''),
            line: r.line || '-',
            reporter: r.reporter || '-',
            device: r.area || r.device_name || '-',
            fault: r.fault_desc,
            status: r.status,
            reportDate: r.report_date,
            fault_images: r.fault_images,
          }))
      );

      setLowStockParts(
        partList
          .filter((p: any) => p.stock < p.safety_stock)
          .slice(0, 5)
          .map((p: any) => ({
            name: p.name,
            spec: p.spec,
            stock: p.stock,
            safetyStock: p.safety_stock,
            location: p.storage_location,
          }))
      );

      setRecentFaults(
        repairList
          .slice(0, 5)
          .map((r: any) => ({
            id: r.id,
            line: r.line || '',
            device: (r.line ? r.line + '-' : '') + (r.area || r.device_name || '-'),
            cause: r.fault_cause,
            repairman: r.repairman,
            date: r.report_date,
            fault_images: r.fault_images,
            fault_desc: r.fault_desc,
          }))
      );

      const todayStr = new Date().toISOString().slice(0, 10);
      setUpcomingMaintenance(
        maintList
          .filter((m: any) => m.status !== '已完成' && m.plan_date >= todayStr)
          .slice(0, 5)
          .map((m: any) => ({
            id: m.id,
            planNo: m.plan_no,
            type: m.maintenance_type,
            taskDesc: m.task_desc,
            date: m.plan_date,
            person: m.responsible_person,
            status: m.status,
          }))
      );
    });
  }, [isAdmin]);

  // 定时刷新数据
  useEffect(() => {
    // 初始加载数据
    loadDashboardData();
    // 每10秒刷新一次数据
    const interval = setInterval(() => {
      loadDashboardData();
    }, 3000);

    // 监听工单状态变化事件，立即刷新
    const onZoneUpdate = () => loadDashboardData();
    window.addEventListener('zone-stats-updated', onZoneUpdate);

    return () => {
      clearInterval(interval);
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
      window.removeEventListener('zone-stats-updated', onZoneUpdate);
    };
  }, [loadDashboardData]);

  // ===== 待审批领用申请弹窗状态 =====
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalItem, setApprovalItem] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [approvalLoading, setApprovalLoading] = useState(false);

  // 编辑状态
  const [isEditingApproval, setIsEditingApproval] = useState(false);
  const [editPartId, setEditPartId] = useState<number | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [partsSearch, setPartsSearch] = useState('');
  const [partsOptions, setPartsOptions] = useState<any[]>([]);

  // 搜索物品列表
  const searchParts = useCallback(async (keyword: string) => {
    if (!keyword?.trim()) { setPartsOptions([]); return; }
    try {
      const res = await partApi.list(keyword.trim());
      setPartsOptions(res.data || res || []);
    } catch (e) { }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { searchParts(partsSearch); }, 300);
    return () => clearTimeout(timer);
  }, [partsSearch, searchParts]);

  // 打开审批弹窗
  const openApprovalModal = (item: any) => {
    setApprovalItem(item);
    setRejectReason('');
    setIsEditingApproval(false);
    setEditPartId(item.part_id || null);
    setEditQuantity(item.quantity || 1);
    setPartsSearch('');
    setPartsOptions([]);
    setShowApprovalModal(true);
  };

  // 开始编辑
  const startEditApproval = () => {
    setIsEditingApproval(true);
    setPartsSearch('');
    setPartsOptions([]);
  };

  // 取消编辑
  const cancelEditApproval = () => {
    setIsEditingApproval(false);
    setEditPartId(approvalItem?.part_id || null);
    setEditQuantity(approvalItem?.quantity || 1);
  };

  // 保存修改
  const saveEditApproval = async () => {
    if (!approvalItem) return;
    if (!editPartId) {
      alert('请选择物品');
      return;
    }
    if (!editQuantity || editQuantity <= 0) {
      alert('请输入有效的数量（大于0）');
      return;
    }
    setApprovalLoading(true);
    try {
      await partApi.usageUpdate(String(approvalItem.id), {
        part_id: editPartId,
        quantity: editQuantity,
      });
      setIsEditingApproval(false);
      alert('修改成功！');
      loadDashboardData();
      // 更新当前审批项
      const res = await partApi.usagePending();
      const updated = res.data?.find((i: any) => i.id === approvalItem.id);
      if (updated) {
        setApprovalItem({
          ...updated,
          partName: updated.part_name,
          logDate: updated.log_date,
        });
      }
    } catch (err: any) {
      alert('修改失败：' + (err.response?.data?.error || err.message));
    } finally {
      setApprovalLoading(false);
    }
  };

  // 审批通过
  const handleApprove = async () => {
    if (!approvalItem) return;
    setApprovalLoading(true);
    try {
      await partApi.usageApprove(String(approvalItem.id));
      setShowApprovalModal(false);
      alert('审批通过！');
      loadDashboardData();
    } catch (err: any) {
      alert('审批失败：' + (err.response?.data?.error || err.message));
    } finally {
      setApprovalLoading(false);
    }
  };

  // 打开驳回弹窗
  const openRejectModal = () => {
    setRejectModal(true);
  };

  // 提交驳回
  const handleReject = async () => {
    if (!approvalItem || !rejectReason.trim()) {
      alert('请输入驳回原因');
      return;
    }
    setApprovalLoading(true);
    try {
      await partApi.usageReject(String(approvalItem.id), rejectReason);
      setShowApprovalModal(false);
      setRejectModal(false);
      alert('已驳回申请');
      loadDashboardData();
    } catch (err: any) {
      alert('驳回失败：' + (err.response?.data?.error || err.message));
    } finally {
      setApprovalLoading(false);
    }
  };

  // ===== 待处理工单详情弹窗 =====
  const [repairDetailModal, setRepairDetailModal] = useState(false);
  const [repairDetailItem, setRepairDetailItem] = useState<any>(null);

  // ===== 完成工单弹窗（用于"处理中"工单） =====
  const [completeForm, setCompleteForm] = useState<{
    visible: boolean;
    repairId: string;
    workOrderNo: string;
    solution: string;
    fault_cause: string;
    parts: { part_id: string; part_name: string; quantity: number }[];
    repairman: string;
    duration_minutes: string;
    stop_duration_minutes: string;
  }>({ visible: false, repairId: '', workOrderNo: '', solution: '', fault_cause: '', parts: [], repairman: '', duration_minutes: '', stop_duration_minutes: '' });

  // 完成工单 - 物品搜索状态
  const [completePartSearch, setCompletePartSearch] = useState('');
  const [completePartOptions, setCompletePartOptions] = useState<any[]>([]);
  const [completeSelectedPart, setCompleteSelectedPart] = useState<any>(null);

  const handleCompletePartSearch = useCallback(async (keyword?: string) => {
    const kw = keyword || completePartSearch;
    if (!kw?.trim()) { setCompletePartOptions([]); return; }
    try {
      const res = await partApi.list(kw.trim());
      setCompletePartOptions(res.data || res || []);
    } catch (e) { }
  }, [completePartSearch]);

  useEffect(() => {
    const timer = setTimeout(() => { handleCompletePartSearch(); }, 300);
    return () => clearTimeout(timer);
  }, [completePartSearch, handleCompletePartSearch]);

  const addCompletePart = () => {
    if (!completeSelectedPart) return;
    setCompleteForm(prev => ({
      ...prev,
      parts: [...prev.parts, { part_id: String(completeSelectedPart.id), part_name: completeSelectedPart.name, quantity: 1 }]
    }));
    setCompleteSelectedPart(null);
    setCompletePartSearch('');
    setCompletePartOptions([]);
  };

  const removeCompletePart = (index: number) => {
    setCompleteForm(prev => ({
      ...prev,
      parts: prev.parts.filter((_, i) => i !== index)
    }));
  };

  const handleComplete = async () => {
    try {
      const data: any = {
        solution: completeForm.solution,
        fault_cause: completeForm.fault_cause,
        repairman: completeForm.repairman,
        duration_minutes: completeForm.duration_minutes ? Number(completeForm.duration_minutes) : null,
        stop_duration_minutes: completeForm.stop_duration_minutes ? Number(completeForm.stop_duration_minutes) : null,
        parts: completeForm.parts.map(p => ({ part_id: Number(p.part_id), quantity: p.quantity }))
      };
      await repairApi.complete(completeForm.repairId, data);
      setCompleteForm({ visible: false, repairId: '', workOrderNo: '', solution: '', fault_cause: '', parts: [], repairman: '', duration_minutes: '', stop_duration_minutes: '' });
      loadDashboardData();
      window.dispatchEvent(new Event('zone-stats-updated'));
      alert('工单已完成！');
    } catch (err: any) {
      alert('完成工单失败：' + (err.response?.data?.error || err.message));
    }
  };

  const openRepairDetail = (item: any) => {
    // 管理员（含超级管理员）点击"处理中"工单 → 打开完成工单弹窗
    if (item.status === '处理中' && isAdmin) {
      setCompleteForm({
        visible: true,
        repairId: String(item.id),
        workOrderNo: item.workOrderNo || '',
        solution: '',
        fault_cause: '',
        parts: [],
        repairman: getCurrentUsername(),
        duration_minutes: '',
        stop_duration_minutes: '',
      });
      return;
    }
    // 其他状态（或生产干部点击处理中工单）显示详情弹窗
    setRepairDetailItem(item);
    setRepairDetailModal(true);
  };

  // ===== 弹窗状态 =====
  const [showRepairModal, setShowRepairModal] = useState(false);
  const [showPartWithdrawModal, setShowPartWithdrawModal] = useState(false);
  const [showPartAddModal, setShowPartAddModal] = useState(false);
  const [showDeviceAddModal, setShowDeviceAddModal] = useState(false);

  // ===== 图片灯箱 =====
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // ===== 设备报修表单 =====
  const [repairForm, setRepairForm] = useState({
    work_order_type: '设备维修',
    line: '',
    area: '',
    fault_desc: '',
    reporter: '',
    report_date: today(),
  });
  const [repairImages, setRepairImages] = useState<string[]>([]);
  const [repairNextNo, setRepairNextNo] = useState('');
  const [repairSubmitting, setRepairSubmitting] = useState(false);

  const openRepairModal = async () => {
    setRepairForm({
      work_order_type: '设备维修',
      line: '',
      area: '',
      fault_desc: '',
      reporter: getCurrentUsername(),
      report_date: today(),
    });
    setRepairImages([]);
    try {
      const r = await repairApi.nextNo();
      setRepairNextNo(r.data?.next_no || '');
    } catch (e) {
      setRepairNextNo('');
    }
    setShowRepairModal(true);
  };

  // 生产线设备列表（设备维修+1-4线时显示）
  const MAIN_LINE_DEVICES = ['机箱提升机', '装配段1', '装配段2', '老化房', '后测段', '下线提升机', '包装线'];

  const handleRepairChange = (e: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRepairForm(prev => ({ ...prev, [name]: value }));
  };

  const handleRepairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRepairSubmitting(true);
    try {
      await repairApi.create({
        ...repairForm,
        fault_images: repairImages.length > 0 ? JSON.stringify(repairImages) : undefined,
      });
      setShowRepairModal(false);
      window.dispatchEvent(new Event('zone-stats-updated'));
      alert('报修提交成功！');
      navigate('/repairs');
    } catch (err: any) {
      alert('提交失败：' + (err.response?.data?.error || err.message));
    } finally {
      setRepairSubmitting(false);
    }
  };

  // ===== 零部件领用表单 =====
  const [withdrawForm, setWithdrawForm] = useState({
    handler: '',
    line: '',
    quantity: '1',
    log_date: today(),
    purpose: '',
    remarks: '',
  });
  const [withdrawPartsList, setWithdrawPartsList] = useState<any[]>([]);
  const [withdrawPartSearch, setWithdrawPartSearch] = useState('');
  const [withdrawPartOptions, setWithdrawPartOptions] = useState<any[]>([]);
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);

  const LINE_OPTIONS = ['1线', '2线', '3线', '4线', 'VIP线', '紫外', '仓储', '其他'];

  const handleWithdrawPartSearch = useCallback(async (keyword?: string) => {
    const kw = keyword || withdrawPartSearch;
    if (!kw?.trim()) { setWithdrawPartOptions([]); return; }
    try {
      const res = await partApi.list(kw.trim());
      setWithdrawPartOptions(res.data || res || []);
    } catch (e) { }
  }, [withdrawPartSearch]);

  useEffect(() => {
    const timer = setTimeout(() => { handleWithdrawPartSearch(); }, 300);
    return () => clearTimeout(timer);
  }, [withdrawPartSearch, handleWithdrawPartSearch]);

  const openWithdrawModal = () => {
    setWithdrawForm({
      handler: getCurrentUsername(),
      line: '',
      quantity: '1',
      log_date: today(),
      purpose: '',
      remarks: '',
    });
    setWithdrawPartsList([]);
    setWithdrawPartSearch('');
    setWithdrawPartOptions([]);
    setShowPartWithdrawModal(true);
  };

  const addWithdrawPart = (part: any) => {
    setWithdrawPartsList(prev => [
      ...prev,
      { part_id: part.id, part_name: part.name, spec: part.spec, stock: part.stock, unit: part.unit || '个', quantity: 1 }
    ]);
    setWithdrawPartSearch('');
    setWithdrawPartOptions([]);
  };

  const removeWithdrawPart = (index: number) => {
    setWithdrawPartsList(prev => prev.filter((_, i) => i !== index));
  };

  const updateWithdrawPartQty = (index: number, quantity: number) => {
    setWithdrawPartsList(prev => prev.map((p, i) => i === index ? { ...p, quantity } : p));
  };

  const handleWithdrawChange = (e: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setWithdrawForm(prev => ({ ...prev, [name]: value }));
  };

  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (withdrawPartsList.length === 0) {
      alert('请先添加要领用的零部件');
      return;
    }
    // 校验数量不超过库存
    const overStock = withdrawPartsList.find(p => p.quantity > p.stock);
    if (overStock) {
      alert(`"${overStock.part_name}" 领用数量(${overStock.quantity})超过库存(${overStock.stock}${overStock.unit || '个'})`);
      return;
    }
    setWithdrawSubmitting(true);
    try {
      for (const part of withdrawPartsList) {
        await partApi.usage({
          part_id: part.part_id,
          quantity: part.quantity,
          handler: withdrawForm.handler,
          line: withdrawForm.line,
          log_date: withdrawForm.log_date,
          purpose: withdrawForm.purpose,
          remarks: withdrawForm.remarks,
        });
      }
      setShowPartWithdrawModal(false);
      alert('领用成功！');
    } catch (err: any) {
      alert('领用失败：' + (err.response?.data?.error || err.message));
    } finally {
      setWithdrawSubmitting(false);
    }
  };

  // ===== 新增零部件表单 =====
  const [partForm, setPartForm] = useState({
    name: '',
    spec: '',
    storage_location: '',
    stock: 0,
    safety_stock: 5,
    brand: '',
    unit: '个',
    unit_price: '',
    supplier: '',
    applicable_devices: '',
    purchase_cycle_days: '',
    remarks: '',
  });
  const [partNextNo, setPartNextNo] = useState('');
  const [partSubmitting, setPartSubmitting] = useState(false);

  const openPartAddModal = async () => {
    setPartForm({
      name: '',
      spec: '',
      storage_location: '',
      stock: 0,
      safety_stock: 5,
      brand: '',
      unit: '个',
      unit_price: '',
      supplier: '',
      applicable_devices: '',
      purchase_cycle_days: '',
      remarks: '',
    });
    try {
      const r = await partApi.nextNo();
      setPartNextNo(r.data?.next_no || '');
    } catch (e) {
      setPartNextNo('');
    }
    setShowPartAddModal(true);
  };

  const handlePartChange = (e: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPartForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePartSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPartSubmitting(true);
    try {
      const data: any = { ...partForm };
      data.stock = Number(data.stock);
      data.safety_stock = Number(data.safety_stock);
      data.unit_price = data.unit_price ? Number(data.unit_price) : null;
      data.purchase_cycle_days = data.purchase_cycle_days ? Number(data.purchase_cycle_days) : null;
      await partApi.create(data);
      setShowPartAddModal(false);
      alert('零部件添加成功！');
      navigate('/parts');
    } catch (err: any) {
      alert('保存失败：' + (err.response?.data?.error || err.message));
    } finally {
      setPartSubmitting(false);
    }
  };

  // ===== 新增设备表单 =====
  const [deviceCategories, setDeviceCategories] = useState<string[]>([]);
  const [deviceForm, setDeviceForm] = useState({
    device_no: '',
    name: '',
    category: '',
    model: '',
    location: '',
    production_line: '',
    supplier: '',
    maintenance_cycle_days: 30,
    responsible_person: '',
    status: '正常',
    remarks: '',
  });
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);

  useEffect(() => {
    deviceApi.categories().then(r => setDeviceCategories(r.data)).catch(() => {});
  }, []);

  const openDeviceAddModal = () => {
    setDeviceForm({
      device_no: '',
      name: '',
      category: '',
      model: '',
      location: '',
      production_line: '',
      supplier: '',
      maintenance_cycle_days: 30,
      responsible_person: '',
      status: '正常',
      remarks: '',
    });
    setShowDeviceAddModal(true);
  };

  const handleDeviceChange = (e: React.ChangeEvent<HTMLInputElement & HTMLSelectElement>) => {
    const { name, value } = e.target;
    setDeviceForm(prev => ({ ...prev, [name]: value }));
  };

  const handleDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceSubmitting(true);
    try {
      await deviceApi.create(deviceForm);
      setShowDeviceAddModal(false);
      alert('设备添加成功！');
      navigate('/devices');
    } catch (err: any) {
      alert('保存失败：' + (err.response?.data?.error || err.message));
    } finally {
      setDeviceSubmitting(false);
    }
  };

  // ===== 弹窗背景锁定 =====
  const anyModalOpen = showRepairModal || showPartWithdrawModal || showPartAddModal || showDeviceAddModal || showApprovalModal || rejectModal || repairDetailModal || completeForm.visible;
  useBodyScrollLock(anyModalOpen);

  // ===== 通用弹窗样式 =====
  const modalStyle: React.CSSProperties = { maxWidth: 520 };
  const fieldStyle: React.CSSProperties = { marginBottom: 14 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box',
    backgroundColor: 'var(--bg-card)', color: 'var(--text)',
  };

  return (
    <div className="dashboard" style={{ maxWidth: '100%', width: '100%', margin: 0, boxSizing: 'border-box' }}>
      {/* ===== 设备报修弹窗 ===== */}
      <ModalPortal visible={showRepairModal}>
        <div className="modal-overlay">
          <div className="modal" style={modalStyle}>
            <h3 style={{ marginTop: 0 }}>设备报修</h3>
            <form onSubmit={handleRepairSubmit}>
              <div className="form-grid">
                {repairNextNo && (
                  <div style={{ gridColumn: '1/-1' }}><label>工单号</label><input value={repairNextNo} readOnly style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }} /></div>
                )}
                <div><label>工单类型</label>
                  <select name="work_order_type" value={repairForm.work_order_type} onChange={handleRepairChange}>
                    <option>设备维修</option>
                    <option>工具维修</option>
                  </select>
                </div>
                <div><label>线体</label>
                  <select name="line" value={repairForm.line} onChange={handleRepairChange as any}>
                    <option value="">请选择</option>
                    {LINE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div><label>设备/区域</label>
                  {repairForm.work_order_type === '设备维修' && ['1线', '2线', '3线', '4线'].includes(repairForm.line) ? (
                    <select name="area" value={repairForm.area} onChange={handleRepairChange as any}>
                      <option value="">请选择</option>
                      {MAIN_LINE_DEVICES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <input name="area" value={repairForm.area} onChange={handleRepairChange} placeholder={repairForm.work_order_type === '工具维修' ? '请输入工具名称' : '请输入设备或区域'} />
                  )}
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label>故障描述 *</label>
                  <input name="fault_desc" value={repairForm.fault_desc} onChange={handleRepairChange} required placeholder="描述故障现象（可文字描述或拍照）" />
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 14px', borderRadius: 8,
                      border: '1px dashed rgba(79, 172, 254, 0.5)', color: '#4facfe',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      transition: 'all 0.2s',
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,172,254,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      📷 拍照 / 上传图片
                      <input type="file" accept="image/*" capture="environment"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setRepairImages(prev => [...prev, reader.result as string]);
                          };
                          reader.readAsDataURL(file);
                          e.target.value = '';
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                    {repairImages.length > 0 && <span style={{ fontSize: 12, color: '#888' }}>已选 {repairImages.length} 张</span>}
                  </div>
                  {/* 图片预览 */}
                  {repairImages.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {repairImages.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                          <img src={img} alt={`故障图${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button type="button" onClick={() => setRepairImages(prev => prev.filter((_, i) => i !== idx))}
                            style={{
                              position: 'absolute', top: 2, right: 2, width: 22, height: 22,
                              borderRadius: '50%', background: 'rgba(255,71,87,0.9)', color: '#fff',
                              border: 'none', fontSize: 12, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              lineHeight: 1,
                            }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div><label>报修人</label><input name="reporter" value={repairForm.reporter} onChange={handleRepairChange} /></div>
                <div><label>报修日期</label><input name="report_date" type="date" value={repairForm.report_date} onChange={handleRepairChange} /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowRepairModal(false)}>取消</button>
                <button type="submit" className="primary" disabled={repairSubmitting}>
                  {repairSubmitting ? '提交中...' : '提交报修'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      {/* ===== 零部件领用弹窗 ===== */}
      <ModalPortal visible={showPartWithdrawModal}>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600 }}>
            <h3 style={{ marginTop: 0 }}>领用申请</h3>
            <form onSubmit={handleWithdrawSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>领用人 *</label>
                    <input style={inputStyle} name="handler" value={withdrawForm.handler}
                      onChange={handleWithdrawChange} required placeholder="请输入姓名" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>线体 *</label>
                    <select style={inputStyle} name="line" value={withdrawForm.line}
                      onChange={handleWithdrawChange as any} required>
                      <option value="">请选择</option>
                      {LINE_OPTIONS.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>领用日期 *</label>
                    <input style={inputStyle} name="log_date" type="date"
                      value={withdrawForm.log_date} onChange={handleWithdrawChange} required />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>用途</label>
                    <input style={inputStyle} name="purpose" value={withdrawForm.purpose}
                      onChange={handleWithdrawChange} placeholder="领用原因描述（可选）" />
                  </div>
                  <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                    <label style={labelStyle}>备注</label>
                    <input style={inputStyle} name="remarks" value={withdrawForm.remarks}
                      onChange={handleWithdrawChange} placeholder="补充说明（可选）" />
                  </div>
                </div>

                {/* 物品搜索 */}
                <div style={fieldStyle}>
                  <label style={labelStyle}>添加领用物品 *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={inputStyle}
                      value={withdrawPartSearch}
                      onChange={e => setWithdrawPartSearch(e.target.value)}
                      placeholder="输入物品名称/编号搜索"
                    />
                    {withdrawPartOptions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                        maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)',
                        borderRadius: 6, backgroundColor: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}>
                        {withdrawPartOptions.map((p: any) => (
                          <div
                            key={p.id}
                            onClick={() => addWithdrawPart(p)}
                            style={{
                              padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                              transition: 'background 0.15s', backgroundColor: 'transparent'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-cyan)22')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                          >
                            <div style={{ fontWeight: 500 }}>{p.name} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({p.part_no})</span></div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>规格: {p.spec} | 库存: {p.stock} {p.unit || '个'} | 位置: {p.storage_location}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 已选物品列表 */}
                {withdrawPartsList.length > 0 && (
                  <div>
                    <label style={labelStyle}>已选物品（{withdrawPartsList.length} 项）</label>
                    <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-secondary)' }}>
                          <th style={{ padding: '8px 6px', textAlign: 'left' }}>物品名称</th>
                          <th style={{ padding: '8px 6px', textAlign: 'left' }}>规格</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', width: 80 }}>库存</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', width: 80 }}>数量</th>
                          <th style={{ padding: '8px 6px', textAlign: 'center', width: 60 }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {withdrawPartsList.map((p, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 6px' }}>{p.part_name}</td>
                            <td style={{ padding: '8px 6px', color: 'var(--text-secondary)' }}>{p.spec}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>{p.stock}</td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <input
                                type="number"
                                min={1}
                                max={p.stock}
                                value={p.quantity || ''}
                                onChange={e => { const v = e.target.value; if (v === '') { updateWithdrawPartQty(i, 0); } else { const n = Math.max(1, Number(v)); updateWithdrawPartQty(i, Math.min(n, p.stock)); } }}
                                style={{ width: 60, padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                              <button type="button" className="danger btn-sm" onClick={() => removeWithdrawPart(i)}>移除</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {withdrawPartsList.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                    请在上方搜索并添加要领用的零部件
                  </div>
                )}
              </div>

              <div className="form-actions">
                <button type="button" onClick={() => setShowPartWithdrawModal(false)}>取消</button>
                <button type="submit" className="primary" disabled={withdrawSubmitting || withdrawPartsList.length === 0}>
                  {withdrawSubmitting ? '提交中...' : '确认领用'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      {/* ===== 新增零部件弹窗 ===== */}
      <ModalPortal visible={showPartAddModal}>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3 style={{ marginTop: 0 }}>新增零部件</h3>
            <form onSubmit={handlePartSubmit}>
              <div className="form-grid">
                <div><label>物品编号</label><input value={partNextNo} readOnly style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }} /></div>
                <div><label>物品名称 *</label><input name="name" value={partForm.name} onChange={handlePartChange} required /></div>
                <div><label>规格型号 *</label><input name="spec" value={partForm.spec} onChange={handlePartChange} required /></div>
                <div><label>存放位置 *</label><input name="storage_location" value={partForm.storage_location} onChange={handlePartChange} required /></div>
                <div><label>当前库存 *</label><input name="stock" type="number" value={partForm.stock} onChange={handlePartChange} required /></div>
                <div><label>安全库存 *</label><input name="safety_stock" type="number" value={partForm.safety_stock} onChange={handlePartChange} required /></div>
                <div><label>品牌</label><input name="brand" value={partForm.brand} onChange={handlePartChange} /></div>
                <div><label>单位</label><input name="unit" value={partForm.unit} onChange={handlePartChange} /></div>
                <div><label>单价</label><input name="unit_price" type="number" value={partForm.unit_price} onChange={handlePartChange} /></div>
                <div><label>供应商</label><input name="supplier" value={partForm.supplier} onChange={handlePartChange} /></div>
                <div><label>适用设备</label><input name="applicable_devices" value={partForm.applicable_devices} onChange={handlePartChange} /></div>
                <div><label>采购周期(天)</label><input name="purchase_cycle_days" type="number" value={partForm.purchase_cycle_days} onChange={handlePartChange} /></div>
                <div style={{ gridColumn: '1/-1' }}><label>备注</label><input name="remarks" value={partForm.remarks} onChange={handlePartChange} /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowPartAddModal(false)}>取消</button>
                <button type="submit" className="primary" disabled={partSubmitting}>
                  {partSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      {/* ===== 新增设备弹窗 ===== */}
      <ModalPortal visible={showDeviceAddModal}>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3 style={{ marginTop: 0 }}>新增设备</h3>
            <form onSubmit={handleDeviceSubmit}>
              <div className="form-grid">
                <div><label>设备编号 *</label><input name="device_no" value={deviceForm.device_no} onChange={handleDeviceChange} required /></div>
                <div><label>设备名称 *</label><input name="name" value={deviceForm.name} onChange={handleDeviceChange} required /></div>
                <div><label>设备类别 *</label>
                  <select name="category" value={deviceForm.category} onChange={handleDeviceChange} required>
                    <option value="">请选择</option>
                    {deviceCategories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label>型号规格</label><input name="model" value={deviceForm.model} onChange={handleDeviceChange} /></div>
                <div><label>安装位置 *</label><input name="location" value={deviceForm.location} onChange={handleDeviceChange} required /></div>
                <div><label>所属产线</label><input name="production_line" value={deviceForm.production_line} onChange={handleDeviceChange} /></div>
                <div><label>供应商</label><input name="supplier" value={deviceForm.supplier} onChange={handleDeviceChange} /></div>
                <div><label>保养周期(天)</label><input name="maintenance_cycle_days" type="number" value={deviceForm.maintenance_cycle_days} onChange={handleDeviceChange} /></div>
                <div><label>责任人</label><input name="responsible_person" value={deviceForm.responsible_person} onChange={handleDeviceChange} /></div>
                <div><label>状态</label>
                  <select name="status" value={deviceForm.status} onChange={handleDeviceChange}>
                    <option>正常</option><option>维修中</option><option>闲置</option><option>停用</option><option>报废</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}><label>备注</label><input name="remarks" value={deviceForm.remarks} onChange={handleDeviceChange} /></div>
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setShowDeviceAddModal(false)}>取消</button>
                <button type="submit" className="primary" disabled={deviceSubmitting}>
                  {deviceSubmitting ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </ModalPortal>

      {/* ===== 物品领用审批弹窗 ===== */}
      <ModalPortal visible={showApprovalModal && !!approvalItem}>
        {approvalItem && <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📋 物品领用审批</span>
              {isAdmin && !isEditingApproval && (
                <button
                  type="button"
                  onClick={startEditApproval}
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    background: 'rgba(22, 119, 255, 0.2)',
                    border: '1px solid rgba(22, 119, 255, 0.4)',
                    borderRadius: 6,
                    color: '#1677ff',
                    cursor: 'pointer',
                  }}
                >
                  ✏️ 修改
                </button>
              )}
            </h3>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>申请人</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{approvalItem.handler}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>申请时间</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{approvalItem.logDate}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>产线</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{approvalItem.line}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>物品名称</label>
                  {isEditingApproval ? (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        value={partsSearch}
                        onChange={e => setPartsSearch(e.target.value)}
                        placeholder="搜索物品名称..."
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                          fontSize: 14,
                          boxSizing: 'border-box',
                          backgroundColor: 'var(--bg-card)',
                          color: 'var(--text)',
                        }}
                      />
                      {partsOptions.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          zIndex: 10,
                          maxHeight: 160,
                          overflowY: 'auto',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          backgroundColor: 'var(--bg-card)',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          marginTop: 4,
                        }}>
                          {partsOptions.map((p: any) => (
                            <div
                              key={p.id}
                              onClick={() => {
                                setEditPartId(p.id);
                                setPartsSearch(p.name);
                                setPartsOptions([]);
                              }}
                              style={{
                                padding: '8px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid var(--border)',
                                backgroundColor: editPartId === p.id ? 'var(--accent-cyan)22' : 'transparent',
                              }}
                            >
                              <div style={{ fontWeight: 500 }}>{p.name} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({p.part_no})</span></div>
                              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>库存: {p.stock} {p.unit || '个'}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>
                      {approvalItem.partName}
                      {approvalItem.partSpec && <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 8 }}>({approvalItem.partSpec})</span>}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>领用数量</label>
                {isEditingApproval ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={editQuantity || ''}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === '') {
                        setEditQuantity(0);
                      } else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num > 0) {
                          setEditQuantity(num);
                        }
                      }
                    }}
                    placeholder="输入数量"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      fontSize: 14,
                      boxSizing: 'border-box',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text)',
                      textAlign: 'center',
                    }}
                  />
                ) : (
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>
                    <span style={{ fontSize: 24, fontWeight: 600, color: 'var(--accent-cyan)' }}>{approvalItem.quantity}</span> {approvalItem.purpose && <span style={{ marginLeft: 12, color: 'var(--text-secondary)' }}>用途: {approvalItem.purpose}</span>}
                  </div>
                )}
              </div>
              {approvalItem.purpose && !isEditingApproval && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>用途</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{approvalItem.purpose}</div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => {
                setShowApprovalModal(false);
                setIsEditingApproval(false);
              }} style={{ backgroundColor: 'var(--bg-secondary)' }}>取消</button>
              {isEditingApproval ? (
                <>
                  <button type="button" onClick={cancelEditApproval} style={{ backgroundColor: 'var(--bg-secondary)' }} disabled={approvalLoading}>取消修改</button>
                  <button type="button" className="primary" onClick={saveEditApproval} disabled={approvalLoading}>
                    {approvalLoading ? '保存中...' : '✓ 保存'}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={openRejectModal} style={{ backgroundColor: '#ff4d4f' }} disabled={approvalLoading}>驳回</button>
                  <button type="button" className="primary" onClick={handleApprove} disabled={approvalLoading}>
                    {approvalLoading ? '处理中...' : '✓ 通过'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>}
      </ModalPortal>

      {/* ===== 驳回原因弹窗 ===== */}
      <ModalPortal visible={rejectModal && !!approvalItem}>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0, color: '#ff4d4f' }}>驳回原因</h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>请输入驳回原因（必填）</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="请输入驳回原因..."
                style={{
                  width: '100%', minHeight: 100, padding: '10px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', fontSize: 14, resize: 'vertical',
                  backgroundColor: 'var(--bg-card)', color: 'var(--text)', boxSizing: 'border-box'
                }}
              />
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setRejectModal(false)} style={{ backgroundColor: 'var(--bg-secondary)' }}>取消</button>
              <button type="button" onClick={handleReject} style={{ backgroundColor: '#ff4d4f' }} disabled={approvalLoading}>
                {approvalLoading ? '提交中...' : '确认驳回'}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ===== 维修工单详情弹窗 ===== */}
      <ModalPortal visible={repairDetailModal && !!repairDetailItem}>
        {repairDetailItem && <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3 style={{ marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>🔧 工单详情</span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 400 }}>#{repairDetailItem.workOrderNo}</span>
            </h3>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>工单状态</label>
                  <span className={`status-badge status-${repairDetailItem.status === '已完成' ? 'ok' : repairDetailItem.status === '处理中' ? 'warning' : 'error'}`}>
                    {repairDetailItem.status}
                  </span>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>报修日期</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{repairDetailItem.reportDate}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>报修人</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{repairDetailItem.reporter}</div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>线体</label>
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{repairDetailItem.line}</div>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>设备/区域</label>
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14 }}>{repairDetailItem.device}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>故障描述</label>
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: 6, fontSize: 14, lineHeight: 1.6 }}>{repairDetailItem.fault || '-'}</div>
              </div>
              {/* 故障图片 */}
              {(() => {
                let images: string[] = [];
                try {
                  const raw = (repairDetailItem as any).fault_images;
                  if (raw) images = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch (_) {}
                if (!images.length) return null;
                return (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>故障图片 ({images.length})</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {images.map((img: string, idx: number) => (
                        <img key={idx} src={img}
                          alt={`故障图${idx + 1}`}
                          style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                          onClick={() => setLightboxImage(img)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setRepairDetailModal(false)} style={{ backgroundColor: 'var(--bg-secondary)' }}>关闭</button>
              {repairDetailItem.status === '待处理' && !isOperator && (
                <button type="button" className="primary" onClick={async () => {
                  try {
                    await repairApi.start(String(repairDetailItem.id));
                    setRepairDetailModal(false);
                    loadDashboardData();
                    window.dispatchEvent(new Event('zone-stats-updated'));
                  } catch (err: any) {
                    alert('接单失败：' + (err.response?.data?.error || err.message));
                  }
                }}>
                  接单处理
                </button>
              )}
            </div>
          </div>
        </div>}
      </ModalPortal>

      {/* ===== 完成工单弹窗（处理中工单点击弹出） ===== */}
      <ModalPortal visible={completeForm.visible}>
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600 }}>
            <h3 style={{ marginTop: 0 }}>完成工单 - {completeForm.workOrderNo}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label>故障原因</label>
                <textarea
                  value={completeForm.fault_cause}
                  onChange={e => setCompleteForm(prev => ({ ...prev, fault_cause: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
                  placeholder="填写故障原因"
                />
              </div>
              <div>
                <label>处理结果</label>
                <textarea
                  value={completeForm.solution}
                  onChange={e => setCompleteForm(prev => ({ ...prev, solution: e.target.value }))}
                  rows={3}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
                  placeholder="填写处理方案和结果"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label>维修人</label>
                  <input
                    value={completeForm.repairman}
                    onChange={e => setCompleteForm(prev => ({ ...prev, repairman: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label>用时(分钟)</label>
                  <input type="number" value={completeForm.duration_minutes}
                    onChange={e => setCompleteForm(prev => ({ ...prev, duration_minutes: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}
                  />
                </div>
                <div>
                  <label>停线时长(分钟)</label>
                  <input type="number" value={completeForm.stop_duration_minutes}
                    onChange={e => setCompleteForm(prev => ({ ...prev, stop_duration_minutes: e.target.value }))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}
                  />
                </div>
              </div>

              <div>
                <label>更换物品</label>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    value={completePartSearch}
                    onChange={e => setCompletePartSearch(e.target.value)}
                    placeholder="输入物品名称/编号搜索（自动搜索）"
                    style={{ width: '100%', padding: '6px 12px', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }}
                  />
                  {completePartOptions.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, backgroundColor: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      {completePartOptions.map((p: any) => (
                        <div
                          key={p.id}
                          onClick={() => { setCompleteSelectedPart(p); setCompletePartSearch(''); setCompletePartOptions([]); }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', backgroundColor: 'transparent', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--accent-cyan)22')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div style={{ fontWeight: 500 }}>{p.name} <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({p.part_no})</span></div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>规格: {p.spec} | 库存: {p.stock} {p.unit || '个'} | 位置: {p.storage_location}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {completeSelectedPart && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 4, backgroundColor: 'var(--bg-card)' }}>
                    <span style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500 }}>{completeSelectedPart.name}</span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>(库存: {completeSelectedPart.stock})</span>
                    </span>
                    <label style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>数量：</label>
                    <input
                      type="number" min={1} max={completeSelectedPart.stock} defaultValue={1}
                      style={{ width: 70, padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}
                      onChange={e => setCompleteSelectedPart({ ...completeSelectedPart, quantity: Math.max(1, Number(e.target.value)) })}
                    />
                    <button type="button" className="btn-sm btn-outline-primary" onClick={addCompletePart}>添加</button>
                    <button type="button" className="btn-sm" onClick={() => { setCompleteSelectedPart(null); }}>取消</button>
                  </div>
                )}
                {completeForm.parts.length > 0 && (
                  <table className="table-compact" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th>物品名称</th>
                        <th>数量</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completeForm.parts.map((p, i) => (
                        <tr key={i}>
                          <td>{p.part_name}</td>
                          <td>{p.quantity}</td>
                          <td><button className="danger btn-sm" onClick={() => removeCompletePart(i)}>移除</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button type="button" onClick={() => setCompleteForm({ visible: false, repairId: '', workOrderNo: '', solution: '', fault_cause: '', parts: [], repairman: '', duration_minutes: '', stop_duration_minutes: '' })}>取消</button>
                <button type="button" className="primary" onClick={handleComplete}>确认完成</button>
              </div>
            </div>
          </div>
        </div>
      </ModalPortal>

      {/* ===== 产线全景图 ===== */}
      <div className="panorama-glow-wrapper">
        <div className="panorama-content">
          <img
            src="/panorama.jpg"
            alt="产线全景"
          />
        </div>
      </div>

      {/* ===== 设备布局监控图 ===== */}
      <ZoneMap />

      {/* ===== 快捷操作区 ===== */}
      <div className="quick-actions">
        <button
          className="quick-btn"
          onClick={openRepairModal}
          style={{ '--btn-color': '#f5222d' } as React.CSSProperties}
        >
          <span className="quick-icon">🛠️</span>
          <span>设备报修</span>
        </button>
        <button
          className="quick-btn"
          onClick={openWithdrawModal}
          style={{ '--btn-color': '#fa8c16' } as React.CSSProperties}
        >
          <span className="quick-icon">📦</span>
          <span>领用申请</span>
        </button>
        {isAdmin && (
          <>
            <button
              className="quick-btn"
              onClick={openPartAddModal}
              style={{ '--btn-color': '#52c41a' } as React.CSSProperties}
            >
              <span className="quick-icon">➕</span>
              <span>新增零部件</span>
            </button>
            <button
              className="quick-btn"
              onClick={openDeviceAddModal}
              style={{ '--btn-color': '#1677ff' } as React.CSSProperties}
            >
              <span className="quick-icon">➕</span>
              <span>新增设备</span>
            </button>
          </>
        )}
      </div>

      {/* ===== KPI 卡片（操作员不可见）===== */}
      {!isOperator && (
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#e6f4ff' }}>📋</div>
          <div className="kpi-info">
            <div className="kpi-value">{stats.totalDevices}</div>
            <div className="kpi-label">设备总数</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#f0f0f0' }}>💤</div>
          <div className="kpi-info">
            <div className="kpi-value">{stats.totalDevices - stats.onlineDevices}</div>
            <div className="kpi-label">闲置设备</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon" style={{ background: '#fff1f0' }}>🔨</div>
          <div className="kpi-info">
            <div className="kpi-value">{stats.monthFaults}</div>
            <div className="kpi-label">本月故障</div>
          </div>
        </div>
        <div className="kpi-card warning">
          <div className="kpi-icon" style={{ background: '#fff7e6' }}>⚠️</div>
          <div className="kpi-info">
            <div className="kpi-value">{stats.lowStockParts}</div>
            <div className="kpi-label">低库存预警</div>
          </div>
        </div>
      </div>
      )}

      {/* ===== 双栏内容区 ===== */}
      <div className="dashboard-grid">
        {/* 左栏 */}
        <div className="dashboard-col">
          <div className="dashboard-card">
            <div className="card-header">
              <h3>📋 待处理工单</h3>
              {!isOperator && (
                <button className="card-link" onClick={() => navigate('/repairs')}>查看全部 →</button>
              )}
            </div>
            <div className="card-body">
              {pendingRepairs.length === 0 && pendingWithdrawals.length === 0 ? (
                <div className="empty-state">暂无待处理工单</div>
              ) : (
                <div className="list-items">
                  {/* 待审批物品领用申请（管理员可见） */}
                  {!isOperator && pendingWithdrawals.map(item => (
                    <div key={`withdraw-${item.id}`} className="list-item" onClick={() => openApprovalModal(item)}>
                      <div className="item-left row">
                        <span className="item-title gap-2">📦 领用申请</span>
                        <span className="item-sub gap-2" style={{ color: '#fa8c16' }}>{item.handler}</span>
                        <span className="item-sub gap-2" style={{ color: 'var(--accent-cyan)' }}>{item.line}</span>
                        <span className="item-sub gap-2">{item.partName}</span>
                        {item.partSpec && <span className="item-sub gap-2" style={{ color: '#888' }}>{item.partSpec}</span>}
                        <span className="item-sub fault-text">×{item.quantity} {item.purpose || '领用申请'}</span>
                      </div>
                      <div className="item-right">
                        <span className="status-badge status-warning">待审批</span>
                        <span className="item-date">{item.logDate?.slice(5)}</span>
                      </div>
                    </div>
                  ))}
                  {/* 维修工单 */}
                  {pendingRepairs.map(item => (
                    <div key={`repair-${item.id}`} className="list-item" onClick={() => openRepairDetail(item)}>
                      <div className="item-left row">
                        <span className="item-title gap-2">#{item.workOrderNo}</span>
                        <span className="item-sub gap-2" style={{ color: 'var(--accent-cyan)' }}>{item.line}</span>
                        <span className="item-sub gap-2" style={{ color: '#fa8c16' }}>{item.reporter}</span>
                        <span className="item-sub gap-2">{item.device}</span>
                        <span className="item-sub fault-text">{item.fault}</span>
                      </div>
                      <div className="item-right">
                        <span className={`status-badge status-${item.status === '已完成' ? 'ok' : item.status === '处理中' ? 'warning' : 'error'}`}>
                          {item.status}
                        </span>
                        <span className="item-date">{item.reportDate?.slice(5)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="dashboard-card">
            <div className="card-header">
              <h3>🔧 最近故障记录</h3>
              {!isOperator && (
                <button className="card-link" onClick={() => navigate('/repairs')}>查看全部 →</button>
              )}
            </div>
            <div className="card-body">
              {recentFaults.length === 0 ? (
                <div className="empty-state">暂无故障记录</div>
              ) : (
                <div className="list-items">
                  {recentFaults.map(item => (
                    <div key={item.id} className="list-item" onClick={() => isOperator ? null : navigate('/repairs')}>
                      <div className="item-left">
                        <span className="item-title">{item.device}</span>
                        <span className="item-sub">{item.cause || '-'}</span>
                      </div>
                      <div className="item-right">
                        <span className="item-date">{item.date?.slice(5)}</span>
                        <span className="item-sub">{item.reporter}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右栏 */}
        <div className="dashboard-col">
          <div className="dashboard-card warning-card">
            <div className="card-header">
              <h3>⚠️ 低库存预警</h3>
              {!isOperator && (
                <button className="card-link" onClick={() => navigate('/parts')}>查看全部 →</button>
              )}
            </div>
            <div className="card-body">
              {lowStockParts.length === 0 ? (
                <div className="empty-state">库存状态良好</div>
              ) : (
                <div className="list-items">
                  {lowStockParts.map((item, idx) => (
                    <div key={idx} className="list-item" onClick={() => isOperator ? null : navigate('/parts')}>
                      <div className="item-left">
                        <span className="item-title">{item.name}</span>
                        <span className="item-sub">{item.spec ? `${item.spec} | ${item.location}` : item.location}</span>
                      </div>
                      <div className="item-right">
                        <span className="stock-warning">{item.stock}/{item.safetyStock}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!isOperator && (
          <div className="dashboard-card">
            <div className="card-header">
              <h3>📅 近期保养计划</h3>
              <button className="card-link" onClick={() => navigate('/maintenance')}>查看全部 →</button>
            </div>
            <div className="card-body">
              {upcomingMaintenance.length === 0 ? (
                <div className="empty-state">暂无待执行保养</div>
              ) : (
                <div className="list-items">
                  {upcomingMaintenance.map(item => (
                    <div key={item.id} className="list-item" onClick={() => navigate('/maintenance')}>
                      <div className="item-left">
                        <span className="item-title">{item.type}</span>
                        <span className="item-sub">{item.taskDesc || '-'}</span>
                      </div>
                      <div className="item-right">
                        <span className={`status-badge status-${item.status === '执行中' ? 'warning' : ''}`}>{item.status}</span>
                        <span className="item-date">{item.date?.slice(5)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>

    {/* ===== 图片放大灯箱 ===== */}
    <ModalPortal visible={!!lightboxImage}>
    <div
      onClick={() => setLightboxImage(null)}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.92)',
        zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img src={lightboxImage!} alt="故障图片"
        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={() => setLightboxImage(null)}
        style={{
          position: 'absolute', top: 20, right: 20,
          width: 40, height: 40, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          border: 'none', fontSize: 22, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >×</button>
    </div>
    </ModalPortal>
    </div>
  );
}
