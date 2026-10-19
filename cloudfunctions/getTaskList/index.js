// cloudfunctions/getTaskList/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

function timeOf(t) {
  if (!t) return 0
  const ts = new Date(t).getTime()
  return isNaN(ts) ? 0 : ts
}

function effectiveStatus(task, now) {
  if (task.status === 'completed') {
    return { status: 'completed', claimEnded: false }
  }
  if (task.status === 'assigned') {
    const overdue = timeOf(task.deadline) > 0 && now > timeOf(task.deadline)
    return { status: overdue ? 'overdue' : 'assigned', claimEnded: false }
  }
  const claimEnded = task.assignMode === 'claim' && timeOf(task.claimEndTime) > 0 && now > timeOf(task.claimEndTime)
  return { status: 'unassigned', claimEnded }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  event = event || {}
  const groupId = typeof event.groupId === 'string' ? event.groupId.trim() : ''
  if (!groupId) {
    return { code: 400, message: '缺少小组 ID' }
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
    if ((group.memberIds || []).indexOf(openid) < 0) {
      return { code: 403, message: '你不是该小组成员' }
    }

    const taskRes = await db.collection('tasks').where({ groupId }).get()
    const rawList = taskRes.data || []
    rawList.sort((a, b) => timeOf(b.createdTime) - timeOf(a.createdTime))

    const assigneeIds = []
    rawList.forEach(t => {
      if (t.assigneeId && assigneeIds.indexOf(t.assigneeId) < 0) assigneeIds.push(t.assigneeId)
    })
    let userMap = {}
    if (assigneeIds.length > 0) {
      try {
        const userRes = await db.collection('users').where({ openid: _.in(assigneeIds) }).get()
        const userList = userRes.data || []
        userList.forEach(u => { userMap[u.openid] = u })
      } catch (err) {
        console.warn('查询 users 失败：', err)
      }
    }

    const now = Date.now()
    const tasks = rawList.map(t => {
      const eff = effectiveStatus(t, now)
      const u = t.assigneeId ? userMap[t.assigneeId] : null
      const start = timeOf(t.claimStartTime)
      const end = timeOf(t.claimEndTime)
      const claimOpen = t.assignMode === 'claim' && t.status === 'unassigned' && start > 0 && now >= start && now <= end
      return {
        taskId: t._id,
        name: t.name,
        description: t.description || '',
        contribution: t.contribution,
        assignMode: t.assignMode,
        assigneeId: t.assigneeId || '',
        assigneeName: t.assigneeId ? ((u && u.nickname) || '未设置昵称') : '',
        deadline: t.deadline || null,
        status: eff.status,
        claimStartTime: t.claimStartTime || null,
        claimEndTime: t.claimEndTime || null,
        claimOpen,
        claimEnded: eff.claimEnded,
        overdueOnce: t.overdueOnce === true,
        submittedAt: t.submittedAt || null,
        submissionCount: (t.submissions || []).length
      }
    })

    return { code: 200, message: 'ok', data: { tasks } }
  } catch (err) {
    console.error('getTaskList 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}