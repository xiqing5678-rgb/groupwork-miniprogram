// pages/onboarding/onboarding.ts
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

Page({
  data: {
    nickname: '',
    avatarUrl: DEFAULT_AVATAR,
    avatarChanged: false,
    avatarChosen: false,
    saving: false,
  },
  async onLoad() {
    try {
      const user = await callFunction<UserInfo>('getUser', {})
      if (user.nickname) {
        // 已初始化过，直接进入首页
        wx.switchTab({ url: '/pages/index/index' })
        return
      }
      if (user.avatarUrl) {
        const url = await this.resolveAvatar(user.avatarUrl)
        this.setData({ avatarUrl: url })
      }
    } catch (err) {
      console.error('加载用户信息失败：', err)
    }
  },
  async resolveAvatar(url: string): Promise<string> {
    if (!url) return DEFAULT_AVATAR
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
    this.setData({ avatarUrl: e.detail.avatarUrl, avatarChosen: true, avatarChanged: true })
  },
  onNicknameInput(e: any) {
    this.setData({ nickname: e.detail.value })
  },
  onClearNickname() {
    this.setData({ nickname: '' })
  },
  onSkip() {
    wx.switchTab({ url: '/pages/index/index' })
  },
  async onSave() {
    const nickname = (this.data.nickname || '').trim()
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
      await callFunction<UserInfo>('getUser', { nickname, avatarUrl })
      this.setData({ avatarChanged: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' })
      }, 600)
    } catch (err) {
      console.error('保存用户信息失败：', err)
    } finally {
      this.setData({ saving: false })
    }
  },
})
