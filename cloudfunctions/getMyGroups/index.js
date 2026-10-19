// cloudfunctions/getMyGroups/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

function timeOf(t) {
  if (!t) return 0
  const ts = new Date(t).getTime()
  return isNaN(ts) ? 0 : ts
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  try {
    // 确保 groups 集合存在（兜底）
    try {
      await db.createCollection('groups')
    } catch (err) {
      // 集合已存在，忽略
    }

    const res = await db.collection('groups').where({ memberIds: openid }).get()
    const rawList = res.data || []

    // 按最近活跃（updatedTime）倒序
    rawList.sort((a, b) => timeOf(b.updatedTime) - timeOf(a.updatedTime))

    const groups = rawList.map(g => {
      const roles = g.roles || (g.creatorId ? { [g.creatorId]: 'leader' } : {})
      return {
        groupId: g._id,
        name: g.name,
        description: g.description || '',
        memberCount: (g.memberIds || []).length,
        role: roles[openid] || (openid === g.creatorId ? 'leader' : 'member'),
        status: g.status || 'active'
      }
    })

    return {
      code: 200,
      message: 'ok',
      data: { groups }
    }
  } catch (err) {
    console.error('getMyGroups 云函数执行失败：', err)
    return {
      code: 500,
      message: '服务器内部错误',
      detail: err && err.message ? err.message : String(err)
    }
  }
}