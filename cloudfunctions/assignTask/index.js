// cloudfunctions/assignTask/index.js
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
  const assigneeId = typeof event.assigneeId === 'string' ? event.assigneeId.trim() : ''
  if (!taskId) {
    return { code: 400, message: '缺少任务 ID' }
  }
  if (!assigneeId) {
    return { code: 400, message: '请选择负责人' }
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
    const roles = group.roles || (group.creatorId ? { [group.creatorId]: 'leader' } : {})
    if (roles[openid] !== 'leader' && openid !== group.creatorId) {
      return { code: 403, message: '只有组长可以分配任务' }
    }
    if ((group.memberIds || []).indexOf(assigneeId) < 0) {
      return { code: 400, message: '负责人必须是小组成员' }
    }
    if (task.status !== 'unassigned') {
      return { code: 400, message: '只能分配未分配的任务' }
    }

    const updRes = await db.collection('tasks')
      .where({ _id: taskId, status: 'unassigned' })
      .update({ data: { assigneeId, status: 'assigned', updatedTime: new Date() } })
    if (!updRes.stats || updRes.stats.updated === 0) {
      return { code: 400, message: '任务状态已变化，请刷新后重试' }
    }

    return { code: 200, message: '分配成功', data: { taskId, assigneeId } }
  } catch (err) {
    console.error('assignTask 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}