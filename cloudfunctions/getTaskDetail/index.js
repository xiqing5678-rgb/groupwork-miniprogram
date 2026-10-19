// cloudfunctions/getTaskDetail/index.js
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
  const taskId = typeof event.taskId === 'string' ? event.taskId.trim() : ''
  if (!taskId) {
    return { code: 400, message: '缺少任务 ID' }
  }

  try {
    try { await db.createCollection('tasks') } catch (err) {}
    try { await db.createCollection('groups') } catch (err) {}

    let task
    try {
      const taskRes = await db.collection('tasks').doc(taskId).get()
      task = taskRes.data
    } catch (err) {
      return { code: 404, message: '任务不存在' }
    }

    let group
    try {
      const groupRes = await db.collection('groups').doc(task.groupId).get()
      group = groupRes.data
    } catch (err) {
      return { code: 404, message: '小组不存在' }
    }
    if ((group.memberIds || []).indexOf(openid) < 0) {
      return { code: 403, message: '你不是该小组成员' }
    }

    const roles = group.roles || (group.creatorId ? { [group.creatorId]: 'leader' } : {})
    const myRole = roles[openid] === 'leader' || openid === group.creatorId ? 'leader' : 'member'

    const ids = []
    if (task.assigneeId && ids.indexOf(task.assigneeId) < 0) ids.push(task.assigneeId)
    ;(task.submissions || []).forEach(s => {
      if (ids.indexOf(s.submitterId) < 0) ids.push(s.submitterId)
    })
    let userMap = {}
    if (ids.length > 0) {
      try {
        const userRes = await db.collection('users').where({ openid: _.in(ids) }).get()
        const userList = userRes.data || []
        userList.forEach(u => { userMap[u.openid] = u })
      } catch (err) {
        console.warn('查询 users 失败：', err)
      }
    }

    const now = Date.now()
    const eff = effectiveStatus(task, now)
    const assigneeName = task.assigneeId
      ? ((userMap[task.assigneeId] && userMap[task.assigneeId].nickname) || '未设置昵称')
      : ''

    const submissions = (task.submissions || [])
      .map(s => ({
        submitterId: s.submitterId,
        submitterName: (userMap[s.submitterId] && userMap[s.submitterId].nickname) || '未设置昵称',
        type: s.type,
        fileID: s.fileID || '',
        url: s.url || '',
        submittedAt: s.submittedAt || null,
        isOnTime: s.isOnTime === true
      }))
      .sort((a, b) => timeOf(b.submittedAt) - timeOf(a.submittedAt))

    const start = task.claimStartTime ? new Date(task.claimStartTime).getTime() : 0
    const end = task.claimEndTime ? new Date(task.claimEndTime).getTime() : 0
    const claimOpen = task.assignMode === 'claim' && task.status === 'unassigned' && now >= start && now <= end

    return {
      code: 200,
      message: 'ok',
      data: {
        taskId: task._id,
        groupId: task.groupId,
        groupName: group.name,
        name: task.name,
        description: task.description || '',
        contribution: task.contribution,
        assignMode: task.assignMode,
        assigneeId: task.assigneeId || '',
        assigneeName,
        claimStartTime: task.claimStartTime || null,
        claimEndTime: task.claimEndTime || null,
        deadline: task.deadline || null,
        status: eff.status,
        claimEnded: eff.claimEnded,
        claimOpen,
        overdueOnce: task.overdueOnce === true,
        submittedAt: task.submittedAt || null,
        createdTime: task.createdTime || null,
        submissions,
        myRole,
        isAssignee: task.assigneeId === openid
      }
    }
  } catch (err) {
    console.error('getTaskDetail 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}