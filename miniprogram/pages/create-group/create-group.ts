// pages/create-group/create-group.ts
import { callFunction } from '../../utils/cloud'

interface CreateGroupResult {
  groupId: string
  inviteCode: string
}

Page({
  data: {
    submitting: false,
  },
  async onSubmit(e: any) {
    const { groupName = '', description = '' } = e.detail.value || {}
    const name = String(groupName).trim()
    if (!name) {
      wx.showToast({ title: '请输入小组名称', icon: 'none' })
      return
    }
    this.setData({ submitting: true })
    try {
      const res = await callFunction<CreateGroupResult>('createGroup', {
        name,
        description: String(description).trim(),
      })
      wx.showModal({
        title: '创建成功',
        content: `小组邀请码：${res.inviteCode}\n发送给同学即可加入`,
        confirmText: '进入小组',
        cancelText: '返回',
        success: (modalRes) => {
          if (modalRes.confirm) {
            wx.redirectTo({ url: `/pages/group-detail/group-detail?id=${res.groupId}` })
          } else {
            wx.navigateBack()
          }
        },
      })
    } catch (err) {
      console.error('创建小组失败：', err)
    } finally {
      this.setData({ submitting: false })
    }
  },
})