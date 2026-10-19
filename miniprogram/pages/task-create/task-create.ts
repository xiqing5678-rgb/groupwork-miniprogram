// pages/task-create/task-create.ts
import { callFunction } from '../../utils/cloud'

interface MemberInfo {
  openid: string
  nickname: string
  role: string
}

interface GroupDetail {
  groupId: string
  name: string
  myRole: string
  members: MemberInfo[]
}

interface CreateTaskResult {
  taskId: string
}

Page({
  data: {
    groupId: '',
    assignMode: 'claim' as 'claim' | 'assign',
    members: [] as MemberInfo[],
    memberNames: [] as string[],
    claimStartDate: '',
    claimStartTime: '',
    claimEndDate: '',
    claimEndTime: '',
    deadlineDate: '',
    deadlineTime: '',
    assigneeIndex: -1,
    submitting: false,
  },
  onLoad(options: any) {
    const groupId = (options && options.groupId) || ''
    this.setData({ groupId })
    this.loadGroup()
  },
  async loadGroup() {
    if (!this.data.groupId) return
    try {
      const detail = await callFunction<GroupDetail>('getGroupDetail', {
        groupId: this.data.groupId,
      })
      const members = detail.members || []
      this.setData({
        members,
        memberNames: members.map(m => `${m.nickname}${m.role === 'leader' ? '（组长）' : ''}`),
      })
    } catch (err) {
      console.error('加载小组信息失败：', err)
    }
  },
  onSelectMode(e: any) {
    this.setData({ assignMode: e.currentTarget.dataset.mode })
  },
  onDateChange(e: any) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },
  onTimeChange(e: any) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },
  onAssigneeChange(e: any) {
    this.setData({ assigneeIndex: Number(e.detail.value) })
  },
  combineTime(dateStr: string, timeStr: string): number | null {
    if (!dateStr || !timeStr) return null
    const d = new Date(`${dateStr}T${timeStr}:00`)
    return isNaN(d.getTime()) ? null : d.getTime()
  },
  async onSubmit(e: any) {
    const { name = '', description = '', contribution = '' } = e.detail.value || {}
    const assignMode = this.data.assignMode
    const taskName = String(name).trim()
    const contri = Number(contribution)

    if (!taskName) {
      wx.showToast({ title: '请输入任务名称', icon: 'none' })
      return
    }
    if (!Number.isInteger(contri) || contri < 1 || contri > 100) {
      wx.showToast({ title: '贡献率需为 1-100 的整数', icon: 'none' })
      return
    }

    const deadline = this.combineTime(this.data.deadlineDate, this.data.deadlineTime)
    if (!deadline) {
      wx.showToast({ title: '请设置截止时间', icon: 'none' })
      return
    }

    const payload: Record<string, any> = {
      groupId: this.data.groupId,
      name: taskName,
      description: String(description).trim(),
      contribution: contri,
      assignMode,
      deadline,
    }

    if (assignMode === 'claim') {
      const start = this.combineTime(this.data.claimStartDate, this.data.claimStartTime)
      const end = this.combineTime(this.data.claimEndDate, this.data.claimEndTime)
      if (!start || !end) {
        wx.showToast({ title: '请设置认领时间窗口', icon: 'none' })
        return
      }
      payload.claimStartTime = start
      payload.claimEndTime = end
    } else {
      const idx = this.data.assigneeIndex
      const member = idx >= 0 ? this.data.members[idx] : null
      if (!member) {
        wx.showToast({ title: '请选择任务负责人', icon: 'none' })
        return
      }
      payload.assigneeId = member.openid
    }

    this.setData({ submitting: true })
    try {
      const res = await callFunction<CreateTaskResult>('createTask', payload)
      wx.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({
          url: `/pages/task-detail/task-detail?id=${res.taskId}&groupId=${this.data.groupId}`,
        })
      }, 800)
    } catch (err) {
      console.error('创建任务失败：', err)
    } finally {
      this.setData({ submitting: false })
    }
  },
})