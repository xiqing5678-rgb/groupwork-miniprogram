// cloudfunctions/getGroupDetail/index.js
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
  const groupId = typeof event.groupId === 'string' ? event.groupId.trim() : ''
  if (!groupId) {
    return { code: 400, message: '缺少小组 ID' }
  }

  try {
    // 确保 groups 集合存在（兜底）
    try {
      await db.createCollection('groups')
    } catch (err) {
      // 集合已存在，忽略
    }

    let group
    try {
      const groupRes = await db.collection('groups').doc(groupId).get()
      group = groupRes.data
    } catch (err) {
      return { code: 404, message: '小组不存在' }
    }

    const memberIds = group.memberIds || []
    // 权限校验：仅小组成员可查看详情
    if (memberIds.indexOf(openid) < 0) {
      return { code: 403, message: '你不是该小组成员' }
    }

    const roles = group.roles || (group.creatorId ? { [group.creatorId]: 'leader' } : {})

    // 合并用户资料（未建档成员显示占位）
    let userMap = {}
    try {
      const userRes = await db.collection('users').where({ openid: _.in(memberIds) }).get()
      const userList = userRes.data || []
      userList.forEach(u => { userMap[u.openid] = u })
    } catch (err) {
      console.warn('查询 users 失败：', err)
    }

    const members = memberIds.map(id => {
      const u = userMap[id]
      return {
        openid: id,
        nickname: (u && u.nickname) || '未设置昵称',
        avatarUrl: (u && u.avatarUrl) || '',
        role: roles[id] || (id === group.creatorId ? 'leader' : 'member')
      }
    })

    return {
      code: 200,
      message: 'ok',
      data: {
        groupId: group._id,
        name: group.name,
        description: group.description || '',
        inviteCode: group.inviteCode || '',
        status: group.status || 'active',
        meetingTime: group.meetingTime || null,
        memberCount: memberIds.length,
        myRole: roles[openid] || (openid === group.creatorId ? 'leader' : 'member'),
        members
      }
    }
  } catch (err) {
    console.error('getGroupDetail 云函数执行失败：', err)
    return {
      code: 500,
      message: '服务器内部错误',
      detail: err && err.message ? err.message : String(err)
    }
  }
}