// pages/join-group/join-group.ts
import { callFunction } from '../../utils/cloud'

interface JoinGroupResult {
  groupId: string
  name: string
  alreadyMember: boolean
}

Page({
  data: {
    submitting: false,
  },
  async onSubmit(e: any) {
    const { inviteCode = '' } = e.detail.value || {}
    const code = String(inviteCode).trim()
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const res = await callFunction<JoinGroupResult>('joinGroup', { inviteCode: code })
      wx.showToast({
        title: res.alreadyMember ? '你已在该小组中' : '加入成功',
        icon: 'success',
      })
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/group-detail/group-detail?id=${res.groupId}` })
      }, 800)
    } catch (err) {
      console.error('加入小组失败：', err)
    } finally {
      this.setData({ submitting: false })
    }
  },
})