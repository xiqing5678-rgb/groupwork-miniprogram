// cloudfunctions/resetUserProfile/index.js
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

// 退出登录：清空当前用户的昵称与头像（保留 openid / 创建时间 / 小组关联）。
// 微信小程序基于微信身份自动登录，无法真正注销账号；
// 此操作让用户下次进入时重新设置资料，相当于一次「重新登录」。
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) {
    return { code: 401, message: '无法获取用户身份' }
  }

  try {
    try {
      await db.createCollection('users')
    } catch (err) {
      // 集合已存在或 SDK 不支持，忽略
    }

    let userRes
    try {
      userRes = await db.collection('users').where({ openid }).get()
    } catch (queryErr) {
      console.warn('查询 users 失败：', queryErr)
      userRes = { data: [] }
    }
    const existing = userRes.data && userRes.data[0]

    if (!existing) {
      return { code: 200, message: 'ok', data: { reset: false } }
    }

    await db.collection('users').doc(existing._id).update({
      data: {
        nickname: '',
        avatarUrl: '',
        updatedAt: new Date()
      }
    })

    return { code: 200, message: 'ok', data: { reset: true } }
  } catch (err) {
    console.error('resetUserProfile 云函数执行失败：', err)
    return {
      code: 500,
      message: '服务器内部错误',
      detail: err && err.message ? err.message : String(err)
    }
  }
}
