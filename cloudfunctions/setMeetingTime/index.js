// cloudfunctions/setMeetingTime/index.js
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
  const groupId = typeof event.groupId === 'string' ? event.groupId.trim() : ''
  if (!groupId) {
    return { code: 400, message: '缺少小组 ID' }
  }

  // meetingTime 为毫秒时间戳；null / '' 表示清除
  let meetingTime = null
  if (event.meetingTime !== undefined && event.meetingTime !== null && event.meetingTime !== '') {
    const ts = new Date(event.meetingTime).getTime()
    if (isNaN(ts)) {
      return { code: 400, message: '会议时间格式不正确' }
    }
    meetingTime = new Date(ts)
  }

  try {
    try { await db.createCollection('groups') } catch (err) {}

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
    const roles = group.roles || (group.creatorId ? { [group.creatorId]: 'leader' } : {})
    if (roles[openid] !== 'leader' && openid !== group.creatorId) {
      return { code: 403, message: '只有组长可以设置会议时间' }
    }
    if ((group.status || 'active') === 'ended') {
      return { code: 400, message: '该小组已结束' }
    }

    await db.collection('groups').doc(groupId).update({
      data: { meetingTime, updatedTime: new Date() }
    })

    return {
      code: 200,
      message: meetingTime ? '会议时间已设置' : '会议时间已清除',
      data: { groupId, meetingTime }
    }
  } catch (err) {
    console.error('setMeetingTime 云函数执行失败：', err)
    return { code: 500, message: '服务器内部错误', detail: err && err.message ? err.message : String(err) }
  }
}