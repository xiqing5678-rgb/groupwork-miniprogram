// cloudfunctions/submitTask/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  event = event || {}
  const taskId = typeof event.taskId === 'string' ? event.taskId.trim() : ''
  const type = event.type
  const fileID = typeof event.fileID === 'string' ? event.fileID.trim() : ''
  const url = typeof event.url === 'string' ? event.url.trim() : ''
  if (!taskId) {
    return { code: 400, message: '缺少任务 ID' }
  }
  if (type !== 'file' && type !== 'link') {
    return { code: 400, message: '提交类型不正确' }
  }
  if (type === 'file' && !fileID) {
    return { code: 400, message: '请选择要提交的文件' }
  }
  if (type === 'link' && !url) {
    return { code: 400, message: '请输入提交链接' }
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
      return { code: 400, message: '该小组已结束，无法提交' }
    }
    if ((group.memberIds || []).indexOf(openid) < 0) {
      return { code: 403, message: '你不是该小组成员' }
    }
    if (task.assigneeId !== openid) {
      return { code: 403, message: '只有任务负责人可以提交' }
    }

    const now = new Date()
    const deadline = task.deadline ? new Date(task.deadline).getTime() : 0
    const isOnTime = deadline ? now.getTime() <= deadline : true
    const submission = { submitterId: openid, type, submittedAt: now, isOnTime }
    if (type === 'file') {
      submission.fileID = fileID
    } else {
      submission.url = url
    }

    const overdueOnce = task.overdueOnce === true || !isOnTime

    await db.collection('tasks').doc(taskId).update({
      data: {
        submissions: _.push([submission]),
        status: 'completed',
        submittedAt: now,
        overdueOnce,
        updatedTime: now
      }
    })

    return {
      code: 200,
      message: '提交成功',
      data: {
        taskId,
        submissionCount: (task.submissions || []).length + 1,
        submittedAt: now,
        isOnTime,
        overdueOnce
      }
    }
  } catch (err) {
    console.error('submitTask 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}