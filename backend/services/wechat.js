/**
 * 企业微信 Webhook 通知服务（纯文本版，兼容个人微信）
 */

const { db } = require('../db');

/**
 * 发送纯文本消息（兼容企业微信和个人微信）
 * @param {string} webhookUrl - Webhook URL
 * @param {object} textMsg - 纯文本格式消息 { msgtype: 'text', text: { content } }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function sendWechatMessage(webhookUrl, textMsg) {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(textMsg)
    });

    const result = await response.json();

    if (result.errcode === 0) {
      return { success: true };
    } else {
      return { success: false, error: result.errmsg || '发送失败' };
    }
  } catch (err) {
    return { success: false, error: err.message || '网络错误' };
  }
}

/**
 * 构建工单通知的纯文本消息
 * @param {object} repair - 工单数据
 * @param {string} type - 'immediate' | 'scheduled'
 * @returns {object} { textMsg }
 */
function buildRepairMessages(repair, type = 'immediate') {
  const title = type === 'immediate' ? '🔔 新工单报修通知' : '📋 待处理工单提醒';

  if (type === 'scheduled') {
    const pendingRepairs = Array.isArray(repair) ? repair : [repair];
    const count = pendingRepairs.length;

    let content = `${title}\n`;
    content += `当前有 ${count} 条待处理工单，请及时处理\n\n`;

    pendingRepairs.slice(0, 5).forEach((r, i) => {
      content += `${i + 1}. ${r.line || '未知线体'}-${r.area || r.device_name || '未知设备'}\n`;
      content += `   工单号：${r.work_order_no || '无'}\n`;
      content += `   故障：${r.fault_desc || '无描述'}\n`;
      content += `   报修人：${r.reporter || '未知'}\n`;
      content += `   报修时间：${r.created_at || r.report_date || ''}\n\n`;
    });

    if (count > 5) {
      content += `还有 ${count - 5} 条工单未显示...\n`;
    }

    return {
      textMsg: { msgtype: 'text', text: { content } }
    };
  } else {
    const content = `${title}\n\n` +
      `工单号：${repair.work_order_no || '无'}\n` +
      `工单类型：${repair.work_order_type || '设备维修'}\n` +
      `线体：${repair.line || '未知'}\n` +
      `设备/区域：${repair.area || repair.device_name || '未知'}\n` +
      `故障描述：${repair.fault_desc || '无描述'}\n` +
      `报修人：${repair.reporter || '未知'}\n` +
      `报修时间：${repair.created_at || ''}\n` +
      `状态：待处理`;

    return {
      textMsg: { msgtype: 'text', text: { content } }
    };
  }
}

/**
 * 构建工单完结通知的纯文本消息
 * @param {object} repair - 工单数据
 * @returns {object} { textMsg }
 */
function buildRepairCompletedMessages(repair) {
  const now = new Date();
  const localTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const finishTime = repair.finish_time || localTime;

  const isToolUsage = repair.work_order_type === '工具领用';
  const title = isToolUsage ? '🔧 备件领用通知' : '✅ 工单完结通知';
  const subtitle = isToolUsage ? '备件已成功领取' : '设备维修工单已完成处理';

  let content = `${title}\n${subtitle}\n\n`;
  content += `工单号：${repair.work_order_no || '无'}\n`;
  content += `工单类型：${repair.work_order_type || '设备维修'}\n`;

  if (isToolUsage) {
    content += `领用线体：${repair.area || repair.line || '未知'}\n`;
    content += `故障描述：${repair.fault_desc || '无'}\n`;
    content += `操作人：${repair.repairman || '未知'}\n`;
  } else {
    content += `线体：${repair.line || '未知'}\n`;
    content += `设备/区域：${repair.area || repair.device_name || '未知'}\n`;
    content += `故障描述：${repair.fault_desc || '无描述'}\n`;
    content += `处理方案：${repair.solution || '无'}\n`;
    content += `维修人员：${repair.repairman || '未知'}\n`;
    content += `停线时长：${repair.stop_duration_minutes ? repair.stop_duration_minutes + '分钟' : (repair.duration_minutes ? repair.duration_minutes + '分钟' : '未知')}\n`;
    content += `报修人：${repair.reporter || '未知'}\n`;
    content += `报修时间：${repair.created_at || ''}\n`;
  }

  content += `完结时间：${finishTime}\n`;
  content += `状态：已完成`;

  return {
    textMsg: { msgtype: 'text', text: { content } }
  };
}

/**
 * 构建备件领用审批通过通知的纯文本消息
 * @param {object} log - 领用记录
 * @param {object} part - 备件信息
 * @returns {object} { textMsg }
 */
function buildToolWithdrawApprovedMessages(log, part) {
  const now = new Date();
  const localTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  let content = `🔧 领用审批通过\n备件领用申请已通过审批\n\n`;
  content += `物品：${part.name || '未知'}\n`;
  content += `备件编号：${part.part_no || '未知'}\n`;
  content += `领用数量：${log.quantity || 0}\n`;
  content += `领用线体：${log.line || '未指定'}\n`;
  content += `领用人：${log.handler || '未知'}\n`;
  if (log.purpose) content += `用途：${log.purpose}\n`;
  if (log.remarks) content += `备注：${log.remarks}\n`;
  content += `审批人：${log.approver || '管理员'}\n`;
  content += `审批时间：${localTime}\n`;
  content += `状态：审批通过`;

  return {
    textMsg: { msgtype: 'text', text: { content } }
  };
}

/**
 * 构建备件领用申请通知的纯文本消息
 * @param {object} log - 领用记录
 * @param {object} part - 备件信息
 * @returns {object} { textMsg }
 */
function buildUsageRequestMessages(log, part) {
  const now = new Date();
  const localTime = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  let content = `📋 备件领用申请\n有新的备件领用申请，请审批\n\n`;
  content += `物品：${part.name || '未知'}\n`;
  content += `备件编号：${part.part_no || '未知'}\n`;
  content += `领用数量：${log.quantity || 0}\n`;
  content += `领用线体：${log.line || '未指定'}\n`;
  content += `领用人：${log.handler || '未知'}\n`;
  if (log.purpose) content += `用途：${log.purpose}\n`;
  if (log.remarks) content += `备注：${log.remarks}\n`;
  content += `申请时间：${localTime}\n`;
  content += `状态：待审批`;

  return {
    textMsg: { msgtype: 'text', text: { content } }
  };
}

/**
 * 记录通知日志
 */
function logNotification(logData) {
  try {
    db.prepare(`
      INSERT INTO wechat_notification_logs
        (notification_type, target_user, title, content, related_id, repair_id, send_type, send_url, status, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      logData.notification_type || 'repair',
      logData.target_user || 'webhook',
      logData.title || '',
      logData.content || '',
      logData.repair_id || null,
      logData.repair_id || null,
      logData.send_type || 'immediate',
      logData.webhook_url || '',
      logData.success ? 'sent' : 'failed',
    );
  } catch (err) {
    console.error('记录通知日志失败:', err.message);
  }
}

/**
 * 获取通知配置
 */
function getNotificationConfig() {
  const config = db.prepare('SELECT * FROM notification_config WHERE id = 1').get();
  if (config) {
    config.notify_admin_ids = JSON.parse(config.notify_admin_ids || '[]');
  }
  return config;
}

/**
 * 更新通知配置
 */
function updateNotificationConfig(data) {
  const config = getNotificationConfig();
  const updates = [];
  const params = [];

  if (data.webhook_url !== undefined) {
    updates.push('webhook_url = ?');
    params.push(data.webhook_url);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }
  if (data.notify_immediately !== undefined) {
    updates.push('notify_immediately = ?');
    params.push(data.notify_immediately ? 1 : 0);
  }
  if (data.notify_scheduled !== undefined) {
    updates.push('notify_scheduled = ?');
    params.push(data.notify_scheduled ? 1 : 0);
  }
  if (data.schedule_interval_minutes !== undefined) {
    updates.push('schedule_interval_minutes = ?');
    params.push(data.schedule_interval_minutes);
  }
  if (data.notify_admin_ids !== undefined) {
    updates.push('notify_admin_ids = ?');
    params.push(JSON.stringify(data.notify_admin_ids));
  }

  if (updates.length === 0) return config;

  updates.push("updated_at = datetime('now', 'localtime')");
  params.push(1);

  db.prepare(`UPDATE notification_config SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getNotificationConfig();
}

/**
 * 发送工单通知
 */
async function notifyRepair(repair, type = 'immediate') {
  const config = getNotificationConfig();

  if (!config || !config.enabled) {
    return { success: false, message: '通知未启用' };
  }

  if (!config.webhook_url) {
    return { success: false, message: '未配置 Webhook URL' };
  }

  const { textMsg } = buildRepairMessages(repair, type);
  const result = await sendWechatMessage(config.webhook_url, textMsg);

  logNotification({
    notification_type: 'repair',
    target_user: 'webhook',
    title: type === 'immediate' ? '新工单报修通知' : '待处理工单提醒',
    content: JSON.stringify(textMsg),
    repair_id: repair.id,
    send_type: type,
    webhook_url: config.webhook_url,
    success: result.success
  });

  return {
    success: result.success,
    message: result.success ? '发送成功' : (result.error || '发送失败')
  };
}

/**
 * 发送工单完结通知
 */
async function notifyRepairCompleted(repair) {
  const config = getNotificationConfig();

  if (!config || !config.enabled) {
    return { success: false, message: '通知未启用' };
  }

  if (!config.webhook_url) {
    return { success: false, message: '未配置 Webhook URL' };
  }

  const { textMsg } = buildRepairCompletedMessages(repair);
  const result = await sendWechatMessage(config.webhook_url, textMsg);

  logNotification({
    notification_type: 'repair_completed',
    target_user: 'webhook',
    title: '工单完结通知',
    content: JSON.stringify(textMsg),
    repair_id: repair.id,
    send_type: 'completed',
    webhook_url: config.webhook_url,
    success: result.success
  });

  return {
    success: result.success,
    message: result.success ? '发送成功' : (result.error || '发送失败')
  };
}

/**
 * 发送备件领用审批通过通知
 */
async function notifyToolWithdrawApproved(log, part) {
  const config = getNotificationConfig();

  if (!config || !config.enabled) {
    return { success: false, message: '通知未启用' };
  }

  if (!config.webhook_url) {
    return { success: false, message: '未配置 Webhook URL' };
  }

  const { textMsg } = buildToolWithdrawApprovedMessages(log, part);
  const result = await sendWechatMessage(config.webhook_url, textMsg);

  logNotification({
    notification_type: 'tool_withdraw_approved',
    target_user: 'webhook',
    title: '备件领用审批通过',
    content: JSON.stringify(textMsg),
    send_type: 'approved',
    webhook_url: config.webhook_url,
    success: result.success
  });

  return {
    success: result.success,
    message: result.success ? '发送成功' : (result.error || '发送失败')
  };
}

/**
 * 发送备件领用申请通知
 */
async function notifyUsageRequest(log, part) {
  const config = getNotificationConfig();

  if (!config || !config.enabled) {
    return { success: false, message: '通知未启用' };
  }

  if (!config.webhook_url) {
    return { success: false, message: '未配置 Webhook URL' };
  }

  const { textMsg } = buildUsageRequestMessages(log, part);
  const result = await sendWechatMessage(config.webhook_url, textMsg);

  logNotification({
    notification_type: 'usage_request',
    target_user: 'webhook',
    title: '备件领用申请',
    content: JSON.stringify(textMsg),
    send_type: 'usage_request',
    webhook_url: config.webhook_url,
    success: result.success
  });

  return {
    success: result.success,
    message: result.success ? '发送成功' : (result.error || '发送失败')
  };
}

/**
 * 发送测试通知
 */
async function sendTestNotification() {
  const config = getNotificationConfig();

  if (!config || !config.webhook_url) {
    return { success: false, message: '未配置 Webhook URL' };
  }

  const nowStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  const textMsg = {
    msgtype: 'text',
    text: {
      content: `✅ 通知测试\n\n这是一条测试消息，用于验证企业微信 Webhook 配置是否正确。\n\n发送时间：${nowStr}\n系统：攀升工厂设备管理系统`
    }
  };

  const result = await sendWechatMessage(config.webhook_url, textMsg);

  logNotification({
    notification_type: 'test',
    target_user: 'webhook',
    title: '通知测试',
    content: JSON.stringify(textMsg),
    send_type: 'test',
    webhook_url: config.webhook_url,
    success: result.success
  });

  return {
    success: result.success,
    message: result.success ? '测试消息发送成功' : (result.error || '发送失败')
  };
}

/**
 * 获取通知日志
 */
function getNotificationLogs(limit = 50) {
  return db.prepare(`
    SELECT * FROM wechat_notification_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = {
  sendWechatMessage,
  buildRepairMessages,
  buildRepairCompletedMessages,
  buildToolWithdrawApprovedMessages,
  buildUsageRequestMessages,
  logNotification,
  getNotificationConfig,
  updateNotificationConfig,
  notifyRepair,
  notifyRepairCompleted,
  notifyToolWithdrawApproved,
  notifyUsageRequest,
  sendTestNotification,
  getNotificationLogs
};
