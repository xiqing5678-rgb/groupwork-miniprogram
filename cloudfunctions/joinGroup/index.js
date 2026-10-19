// cloudfunctions/joinGroup/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  // 身份校验：openid 只能由服务端从微信上下文获取
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  event = event || {}
  const inviteCode = typeof event.inviteCode === 'string' ? event.inviteCode.trim() : ''
  if (!inviteCode) {
    return { code: 400, message: '请输入邀请码' }
  }

  try {
    // 确保 groups 集合存在（兜底）
    try {
      await db.createCollection('groups')
    } catch (err) {
      // 集合已存在，忽略
    }

    const groupRes = await db.collection('groups').where({ inviteCode }).get()
    const group = groupRes.data && groupRes.data[0]
    if (!group) {
      return { code: 404, message: '小组不存在或邀请码错误' }
    }

    const status = group.status || 'active'
    if (status !== 'active') {
      return { code: 400, message: '该小组已结束，无法加入' }
    }

    const memberIds = group.memberIds || []
    if (memberIds.indexOf(openid) >= 0) {
      return {
        code: 200,
        message: '已在小组成员中',
        data: { groupId: group._id, name: group.name, alreadyMember: true }
      }
    }

    // 角色更新：新成员为 member；旧文档缺失组长角色时补写 leader
    const rolesUpdate = {}
    if (group.creatorId && (!group.roles || !group.roles[group.creatorId])) {
      rolesUpdate['roles.' + group.creatorId] = 'leader'
    }
    rolesUpdate['roles.' + openid] = 'member'

    await db.collection('groups').doc(group._id).update({
      data: Object.assign(
        {
          memberIds: _.addToSet(openid),
          updatedTime: new Date()
        },
        rolesUpdate
      )
    })

    return {
      code: 200,
      message: '加入成功',
      data: {
        groupId: group._id,
        name: group.name,
        alreadyMember: false
      }
    }
  } catch (err) {
    console.error('joinGroup 云函数执行失败：', err)
    return {
      code: 500,
      message: '服务器内部错误',
      detail: err && err.message ? err.message : String(err)
    }
  }
}