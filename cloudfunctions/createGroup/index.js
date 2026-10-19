// cloudfunctions/createGroup/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

function generateInviteCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  const { name, description = '' } = event

  if (!name || !name.trim()) {
    return { code: 400, message: '小组名称不能为空' }
  }

  const inviteCode = generateInviteCode()

  const groupData = {
    name: name.trim(),
    description: description.trim(),
    creatorId: openid,
    memberIds: [openid],
    roles: {
      [openid]: 'leader'
    },
    status: 'active',
    inviteCode: inviteCode,
    createdTime: new Date(),
    updatedTime: new Date()
  }

  try {
    const res = await db.collection('groups').add({
      data: groupData
    })

    return {
      code: 200,
      message: '创建成功',
      data: {
        groupId: res._id,
        inviteCode: inviteCode
      }
    }
  } catch (err) {
    console.error('云函数执行失败：', err)
    return {
      code: 500,
      message: '服务器内部错误'
    }
  }
}