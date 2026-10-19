// cloudfunctions/createTask/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

function toDate(v) {
  if (v === undefined || v === null || v === '') return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  event = event || {}
  const groupId = typeof event.groupId === 'string' ? event.groupId.trim() : ''
  const name = typeof event.name === 'string' ? event.name.trim() : ''
  const description = typeof event.description === 'string' ? event.description.trim() : ''
  const contribution = Number(event.contribution)
  const assignMode = event.assignMode
  const assigneeId = typeof event.assigneeId === 'string' ? event.assigneeId.trim() : ''
  const claimStartTime = toDate(event.claimStartTime)
  const claimEndTime = toDate(event.claimEndTime)
  const deadline = toDate(event.deadline)

  if (!groupId) {
    return { code: 400, message: '缺少小组 ID' }
  }
  if (!name) {
    return { code: 400, message: '请输入任务名称' }
  }
  if (!Number.isInteger(contribution) || contribution < 1 || contribution > 100) {
    return { code: 400, message: '贡献率需为 1-100 的整数' }
  }
  if (assignMode !== 'claim' && assignMode !== 'assign') {
    return { code: 400, message: '任务分配模式不正确' }
  }
  if (!deadline) {
    return { code: 400, message: '请设置截止时间' }
  }
  if (deadline.getTime() <= Date.now()) {
    return { code: 400, message: '截止时间必须晚于当前时间' }
  }
  if (assignMode === 'claim') {
    if (!claimStartTime || !claimEndTime) {
      return { code: 400, message: '请设置认领时间窗口' }
    }
    if (claimEndTime.getTime() <= claimStartTime.getTime()) {
      return { code: 400, message: '认领结束时间必须晚于认领开始时间' }
    }
    if (claimEndTime.getTime() >= deadline.getTime()) {
      return { code: 400, message: '认领窗口必须在截止时间之前结束' }
    }
  } else if (!assigneeId) {
    return { code: 400, message: '请选择任务负责人' }
  }

  try {
    try { await db.createCollection('groups') } catch (err) {}
    try { await db.createCollection('tasks') } catch (err) {}

    let group
    try {
      const groupRes = await db.collection('groups').doc(groupId).get()
      group = groupRes.data
    } catch (err) {
      return { code: 404, message: '小组不存在' }
    }

    if ((group.status || 'active') !== 'active') {
      return { code: 400, message: '该小组已结束，无法创建任务' }
    }
    if ((group.memberIds || []).indexOf(openid) < 0) {
      return { code: 403, message: '你不是该小组成员' }
    }
    const roles = group.roles || (group.creatorId ? { [group.creatorId]: 'leader' } : {})
    if (roles[openid] !== 'leader' && openid !== group.creatorId) {
      return { code: 403, message: '只有组长可以创建任务' }
    }
    if (assignMode === 'assign' && (group.memberIds || []).indexOf(assigneeId) < 0) {
      return { code: 400, message: '负责人必须是小组成员' }
    }

    const now = new Date()
    const taskData = {
      groupId,
      name,
      description,
      contribution,
      assignMode,
      assigneeId: assignMode === 'assign' ? assigneeId : null,
      claimStartTime: assignMode === 'claim' ? claimStartTime : null,
      claimEndTime: assignMode === 'claim' ? claimEndTime : null,
      deadline,
      status: assignMode === 'assign' ? 'assigned' : 'unassigned',
      overdueOnce: false,
      submittedAt: null,
      submissions: [],
      createdBy: openid,
      createdTime: now,
      updatedTime: now
    }

    const addRes = await db.collection('tasks').add({ data: taskData })
    return {
      code: 200,
      message: '创建成功',
      data: { taskId: addRes._id }
    }
  } catch (err) {
    console.error('createTask 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}