// cloudfunctions/getGroupProgress/index.js
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
    const tasks = taskRes.data || []
    const now = Date.now()

    let completed = 0
    let overdue = 0
    let unassigned = 0
    tasks.forEach(t => {
      const eff = effectiveStatus(t, now)
      if (eff.status === 'completed') completed++
      else if (eff.status === 'overdue') overdue++
      else if (eff.status === 'unassigned') unassigned++
    })
    const total = tasks.length
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    const memberIds = group.memberIds || []
    const roles = group.roles || (group.creatorId ? { [group.creatorId]: 'leader' } : {})
    let userMap = {}
    if (memberIds.length > 0) {
      try {
        const userRes = await db.collection('users').where({ openid: _.in(memberIds) }).get()
        const userList = userRes.data || []
        userList.forEach(u => { userMap[u.openid] = u })
      } catch (err) {
        console.warn('查询 users 失败：', err)
      }
    }

    const members = memberIds.map(id => {
      const myTasks = tasks.filter(t => t.assigneeId === id)
      const assignedCount = myTasks.filter(t => t.status !== 'completed').length
      const completedCount = myTasks.filter(t => t.status === 'completed').length
      const overdueCount = myTasks.filter(t => effectiveStatus(t, now).status === 'overdue').length
      const contribution = myTasks.reduce((sum, t) => sum + (Number(t.contribution) || 0), 0)
      const u = userMap[id]
      return {
        openid: id,
        nickname: (u && u.nickname) || '未设置昵称',
        avatarUrl: (u && u.avatarUrl) || '',
        role: roles[id] || (id === group.creatorId ? 'leader' : 'member'),
        assignedCount,
        completedCount,
        overdueCount,
        contribution
      }
    })

    return {
      code: 200,
      message: 'ok',
      data: {
        groupId,
        groupName: group.name,
        overall: { total, completed, overdue, unassigned, completionRate },
        members
      }
    }
  } catch (err) {
    console.error('getGroupProgress 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}