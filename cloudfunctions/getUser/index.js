// cloudfunctions/getUser/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

exports.main = async (event, context) => {
  // 身份校验：openid 只能由服务端从微信上下文获取，禁止前端传入
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  event = event || {}
  const nickname = typeof event.nickname === 'string' ? event.nickname.trim() : ''
  const avatarUrl = typeof event.avatarUrl === 'string' ? event.avatarUrl.trim() : ''

  try {
    // 确保 users 集合存在（已存在时 createCollection 会报错，忽略即可）
    try {
      await db.createCollection('users')
    } catch (err) {
      // 集合已存在，或当前 SDK 不支持该接口；后续逻辑兜底
    }

    // 查询当前用户；若集合不存在导致查询失败，视为新用户（add 会自动创建集合）
    let userRes
    try {
      userRes = await db.collection('users').where({ openid }).get()
    } catch (queryErr) {
      console.warn('查询 users 失败，按新用户处理：', queryErr)
      userRes = { data: [] }
    }
    const existing = userRes.data && userRes.data[0]

    // 首次进入：创建用户记录
    if (!existing) {
      const now = new Date()
      const userData = {
        openid,
        nickname,
        avatarUrl,
        createdAt: now,
        updatedAt: now
      }
      const addRes = await db.collection('users').add({ data: userData })
      return {
        code: 200,
        message: '用户初始化成功',
        data: {
          _id: addRes._id,
          nickname: userData.nickname,
          avatarUrl: userData.avatarUrl,
          createdAt: userData.createdAt,
          updatedAt: userData.updatedAt
        }
      }
    }

    // 已存在：更新必要信息（昵称/头像有变化才更新）
    const updates = {}
    if (nickname && existing.nickname !== nickname) {
      updates.nickname = nickname
    }
    if (avatarUrl && existing.avatarUrl !== avatarUrl) {
      updates.avatarUrl = avatarUrl
    }
    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date()
      await db.collection('users').doc(existing._id).update({ data: updates })
    }

    const merged = Object.assign({}, existing, updates)
    return {
      code: 200,
      message: 'ok',
      data: {
        _id: merged._id,
        nickname: merged.nickname,
        avatarUrl: merged.avatarUrl,
        createdAt: merged.createdAt,
        updatedAt: merged.updatedAt
      }
    }
  } catch (err) {
    console.error('getUser 云函数执行失败：', err)
    return {
      code: 500,
      message: '服务器内部错误',
      detail: err && err.message ? err.message : String(err)
    }
  }
}