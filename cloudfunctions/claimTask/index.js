// cloudfunctions/claimTask/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

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
    if ((group.status || 'active') !== 'active') {
      return { code: 400, message: '该小组已结束' }
    }
    if ((group.memberIds || []).indexOf(openid) < 0) {
      return { code: 403, message: '你不是该小组成员' }
    }
    if (task.assignMode !== 'claim') {
      return { code: 400, message: '该任务不开放认领' }
    }
    if (task.status !== 'unassigned') {
      return { code: 400, message: '该任务已被认领或已完成' }
    }

    const now = Date.now()
    const start = task.claimStartTime ? new Date(task.claimStartTime).getTime() : 0
    const end = task.claimEndTime ? new Date(task.claimEndTime).getTime() : 0
    if (now < start) {
      return { code: 400, message: '认领还未开始' }
    }
    if (now > end) {
      return { code: 400, message: '认领已截止' }
    }

    // 条件更新，防止并发抢单
    const updRes = await db.collection('tasks')
      .where({ _id: taskId, status: 'unassigned' })
      .update({ data: { assigneeId: openid, status: 'assigned', updatedTime: new Date() } })
    if (!updRes.stats || updRes.stats.updated === 0) {
      return { code: 400, message: '手慢了，任务已被认领' }
    }

    return { code: 200, message: '认领成功', data: { taskId, assigneeId: openid } }
  } catch (err) {
    console.error('claimTask 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}