// pages/me/me.ts
import { callFunction, uploadFile, getTempFileURL } from '../../utils/cloud'

interface UserInfo {
  _id: string
  nickname: string
  avatarUrl: string
  createdAt: Date | string
  updatedAt: Date | string
}

const DEFAULT_AVATAR =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const VERSION = 'v1.0.0'

Page({
  data: {
    userInfo: null as UserInfo | null,
    avatarUrl: DEFAULT_AVATAR,
    avatarChanged: false,
    editing: false,
    saving: false,
    version: VERSION,
  },
  onShow() {
    this.loadUser()
  },
  async loadUser() {
    try {
      const user = await callFunction<UserInfo>('getUser', {})
      const avatarUrl = await this.resolveAvatar(user.avatarUrl)
      this.setData({
        userInfo: user,
        avatarUrl,
      })
    } catch (err) {
      console.error('加载用户信息失败：', err)
    }
  },
  async resolveAvatar(url: string): Promise<string> {
    if (!url) {
      return DEFAULT_AVATAR
    }
    if (url.startsWith('cloud://')) {
      try {
        return await getTempFileURL(url)
      } catch (err) {
        console.error('头像链接解析失败：', err)
        return DEFAULT_AVATAR
      }
    }
    return url
  },
  onChooseAvatar(e: any) {
    this.setData({ avatarUrl: e.detail.avatarUrl, avatarChanged: true })
  },
  onToggleEdit() {
    this.setData({ editing: !this.data.editing })
  },
  onCancelEdit() {
    this.setData({ editing: false, avatarChanged: false })
    // 重新加载用户资料，恢复已保存的头像预览（避免残留未保存的本地选择）
    this.loadUser()
  },
  async onSaveProfile(e: any) {
    const nickname = String((e.detail.value && e.detail.value.nickname) || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请填写昵称', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      let avatarUrl = ''
      const picked = this.data.avatarUrl
      // 仅在用户本次确实更换了头像时，才把新的本地头像上传到云存储
      if (this.data.avatarChanged && picked && picked !== DEFAULT_AVATAR && !picked.startsWith('cloud://')) {
        const ext = (picked.split('.').pop() || 'png').split('?')[0]
        const cloudPath = 'avatars/' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '.' + ext
        avatarUrl = await uploadFile(picked, cloudPath)
      }
      const user = await callFunction<UserInfo>('getUser', { nickname, avatarUrl })
      const displayUrl = await this.resolveAvatar(user.avatarUrl)
      this.setData({
        userInfo: user,
        avatarUrl: displayUrl,
        editing: false,
        avatarChanged: false,
      })
      wx.showToast({ title: '保存成功', icon: 'success' })
    } catch (err) {
      console.error('保存用户信息失败：', err)
    } finally {
      this.setData({ saving: false })
    }
  },
  onOpenHelp() {
    wx.navigateTo({ url: '/pages/help/help' })
  },
  onClearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本机缓存数据（不影响云端数据），确定继续吗？',
      confirmText: '清除',
      confirmColor: '#07c160',
      success: (res) => {
        if (!res.confirm) {
          return
        }
        try {
          wx.clearStorageSync()
        } catch (err) {
          console.error('清除缓存失败：', err)
        }
        wx.showToast({ title: '已清除', icon: 'success' })
      },
    })
  },
  onShowAbout() {
    wx.showModal({
      title: '关于小程序',
      content: '小组协作系统 ' + VERSION + '\n面向大学生课程小组作业，通过结构化任务分配与过程记录，让协作更透明、可追溯。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需重新设置昵称与头像，不影响已加入的小组与任务。确定退出吗？',
      confirmText: '退出',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) {
          return
        }
        try {
          await callFunction('resetUserProfile', {})
          try {
            wx.clearStorageSync()
          } catch (err) {
            console.error('清除缓存失败：', err)
          }
          wx.showToast({ title: '已退出登录', icon: 'success' })
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' })
          }, 600)
        } catch (err) {
          console.error('退出登录失败：', err)
        }
      },
    })
  },
})
