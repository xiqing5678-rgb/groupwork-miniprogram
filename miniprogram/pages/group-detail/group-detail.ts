// pages/group-detail/group-detail.ts
import { callFunction } from '../../utils/cloud'
import { formatTime } from '../../utils/util'

interface MemberInfo {
  openid: string
  nickname: string
  avatarUrl: string
  role: string
}

interface GroupDetail {
  groupId: string
  name: string
  description: string
  inviteCode: string
  status: string
  memberCount: number
  myRole: string
  meetingTime: Date | string | null
  meetingTimeText?: string
  members: MemberInfo[]
}

interface TaskSummary {
  taskId: string
  name: string
  description: string
  contribution: number
  assignMode: string
  assigneeId: string
  assigneeName: string
  deadline: Date | string | null
  status: string
  statusText?: string
  deadlineText?: string
  deadlineHint?: string
  claimOpen?: boolean
  claimStartTime?: Date | string | null
  claimEndTime?: Date | string | null
  claimEndText?: string
  claimStartText?: string
  claimNotStarted?: boolean
  claimEnded: boolean
  overdueOnce: boolean
  submittedAt: Date | string | null
  submissionCount: number
}

interface ProgressSummary {
  total: number
  completed: number
  overdue: number
  unassigned: number
  completionRate: number
}

const DEFAULT_AVATAR =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const STATUS_TEXT: Record<string, string> = {
  unassigned: '未分配',
  assigned: '已分配',
  completed: '已完成',
  overdue: '已逾期',
}

const pad = (n: number) => (n < 10 ? '0' + n : '' + n)

Page({
  data: {
    groupId: '',
    loading: true,
    detail: null as GroupDetail | null,
    defaultAvatar: DEFAULT_AVATAR,
    tasks: [] as TaskSummary[],
    tasksLoading: false,
    loadError: false,
    tasksError: false,
    refresherTriggered: false,
    meetingDate: '',
    meetingTimeStr: '',
    pendingCount: 0,
    overdueCount: 0,
    activeTab: 'tasks',
    poolTasks: [] as TaskSummary[],
    unassignedTasks: [] as TaskSummary[],
    ongoingTasks: [] as TaskSummary[],
    overdueTasks: [] as TaskSummary[],
    completedTasks: [] as TaskSummary[],
    progressSummary: null as ProgressSummary | null,
    progressLoading: false,
  },
  onLoad(options: any) {
    this.setData({ groupId: (options && options.id) || '' })
    this.loadDetail()
  },
  onShow() {
    if (this.data.groupId) {
      this.loadTasks()
    }
  },
  fmt(t: Date | string | null): string {
    if (!t) return ''
    const d = new Date(t)
    return isNaN(d.getTime()) ? '' : formatTime(d)
  },
  fmtShort(t: Date | string | null): string {
    if (!t) return ''
    const d = new Date(t)
    if (isNaN(d.getTime())) return ''
    return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  },
  async loadDetail(silent = false) {
    if (!this.data.groupId) {
      this.setData({ loading: false })
      return
    }
    if (!silent) {
      this.setData({ loading: true })
    }
    try {
      const detail = await callFunction<GroupDetail>('getGroupDetail', {
        groupId: this.data.groupId,
      })
      const mt = detail.meetingTime ? new Date(detail.meetingTime) : null
      this.setData({
        detail: {
          ...detail,
          meetingTimeText: this.fmt(detail.meetingTime),
        },
        meetingDate: mt ? `${mt.getFullYear()}-${pad(mt.getMonth() + 1)}-${pad(mt.getDate())}` : '',
        meetingTimeStr: mt ? `${pad(mt.getHours())}:${pad(mt.getMinutes())}` : '',
      })
    } catch (err) {
      console.error('加载小组详情失败：', err)
      this.setData({ loadError: true })
    } finally {
      this.setData({ loading: false })
    }
  },
  async loadTasks(silent = false) {
    if (!this.data.groupId) return
    if (!silent) {
      this.setData({ tasksLoading: true })
    }
    try {
      const res = await callFunction<{ tasks: TaskSummary[] }>('getTaskList', {
        groupId: this.data.groupId,
      })
      const now = Date.now()
      const tasks = (res.tasks || []).map(t => {
        const deadlineTs = t.deadline ? new Date(t.deadline).getTime() : 0
        let deadlineHint = ''
        if (deadlineTs > 0 && t.status !== 'completed') {
          const diffDays = Math.ceil((deadlineTs - now) / 86400000)
          if (t.status === 'overdue') {
            const overdueDays = Math.max(1, Math.floor((now - deadlineTs) / 86400000))
            deadlineHint = '已逾期 ' + overdueDays + ' 天'
          } else if (diffDays > 1) {
            deadlineHint = '还剩 ' + diffDays + ' 天'
          } else if (diffDays === 1) {
            deadlineHint = '明天截止'
          } else if (diffDays === 0) {
            deadlineHint = '今天截止'
          }
        }
        return {
          ...t,
          statusText: STATUS_TEXT[t.status] || t.status,
          deadlineText: t.deadline ? this.fmtShort(t.deadline) : '',
          deadlineHint,
          claimEndText: t.claimEndTime ? this.fmtShort(t.claimEndTime) : '',
          claimStartText: t.claimStartTime ? this.fmtShort(t.claimStartTime) : '',
          claimNotStarted:
            t.status === 'unassigned' && t.assignMode === 'claim' && !t.claimOpen && !t.claimEnded,
        }
      })
      const sortByDeadline = (list: TaskSummary[]) =>
        [...list].sort((a, b) => {
          const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
          const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
          return da - db
        })
      this.setData({
        tasks,
        poolTasks: sortByDeadline(tasks.filter(t => t.claimOpen)),
        unassignedTasks: sortByDeadline(tasks.filter(t => t.status === 'unassigned' && !t.claimOpen)),
        ongoingTasks: sortByDeadline(tasks.filter(t => t.status === 'assigned')),
        overdueTasks: sortByDeadline(tasks.filter(t => t.status === 'overdue')),
        completedTasks: sortByDeadline(tasks.filter(t => t.status === 'completed')),
        pendingCount: tasks.filter(t => t.claimEnded).length,
        overdueCount: tasks.filter(t => t.status === 'overdue').length,
      })
    } catch (err) {
      console.error('加载任务列表失败：', err)
      this.setData({ tasksError: true })
    } finally {
      this.setData({ tasksLoading: false })
    }
  },
  onRetryDetail() {
    this.setData({ loadError: false })
    this.loadDetail()
  },
  onRetryTasks() {
    this.setData({ tasksError: false })
    this.loadTasks()
  },
  onCopyInviteCode() {
    const detail = this.data.detail
    if (!detail || !detail.inviteCode) {
      return
    }
    wx.setClipboardData({
      data: detail.inviteCode,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' })
      },
    })
  },
  async onRefresherRefresh() {
    await Promise.all([this.loadDetail(true), this.loadTasks(true)])
    if (this.data.activeTab === 'progress') {
      await this.loadProgressSummary()
    }
    this.setData({ refresherTriggered: false })
  },
  async onClaimFromPool(e: any) {
    const taskId = e.currentTarget.dataset.taskid
    if (!taskId) return
    try {
      await callFunction('claimTask', { taskId })
      wx.showToast({ title: '认领成功', icon: 'success' })
      this.loadTasks()
    } catch (err) {
      console.error('认领失败：', err)
    }
  },
  onSwitchTab(e: any) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    if (tab === 'progress') {
      this.loadProgressSummary()
    }
  },
  async loadProgressSummary() {
    if (!this.data.groupId) return
    this.setData({ progressLoading: true })
    try {
      const res = await callFunction<{ overall: ProgressSummary }>('getGroupProgress', {
        groupId: this.data.groupId,
      })
      this.setData({ progressSummary: res.overall || null })
    } catch (err) {
      console.error('加载进度概览失败：', err)
    } finally {
      this.setData({ progressLoading: false })
    }
  },
  onMeetingDateChange(e: any) {
    this.setData({ meetingDate: e.detail.value })
  },
  onMeetingTimeChange(e: any) {
    this.setData({ meetingTimeStr: e.detail.value })
  },
  combineMeetingTime(): number | null {
    const { meetingDate, meetingTimeStr } = this.data
    if (!meetingDate || !meetingTimeStr) return null
    const d = new Date(`${meetingDate}T${meetingTimeStr}:00`)
    return isNaN(d.getTime()) ? null : d.getTime()
  },
  async onSetMeetingTime() {
    const ts = this.combineMeetingTime()
    if (!ts) {
      wx.showToast({ title: '请选择会议时间', icon: 'none' })
      return
    }
    try {
      await callFunction('setMeetingTime', { groupId: this.data.groupId, meetingTime: ts })
      wx.showToast({ title: '已设置', icon: 'success' })
      this.loadDetail()
    } catch (err) {
      console.error('设置会议时间失败：', err)
    }
  },
  async onClearMeetingTime() {
    try {
      await callFunction('setMeetingTime', { groupId: this.data.groupId, meetingTime: null })
      wx.showToast({ title: '已清除', icon: 'success' })
      this.loadDetail()
    } catch (err) {
      console.error('清除会议时间失败：', err)
    }
  },
  onEndGroup() {
    wx.showModal({
      title: '结束小组',
      content: '确定结束这个小组吗？结束后不可恢复，成员只能查看。',
      confirmText: '结束',
      confirmColor: '#ee0a24',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await callFunction('endGroup', { groupId: this.data.groupId })
          wx.showToast({ title: '小组已结束', icon: 'success' })
          this.loadDetail()
        } catch (err) {
          console.error('结束小组失败：', err)
        }
      },
    })
  },
  onCreateTask() {
    const detail = this.data.detail
    if (!detail || detail.status === 'ended') return
    wx.navigateTo({ url: `/pages/task-create/task-create?groupId=${this.data.groupId}` })
  },
  onOpenProgress() {
    wx.navigateTo({ url: `/pages/group-progress/group-progress?groupId=${this.data.groupId}` })
  },
  onTaskTap(e: any) {
    const id = e.currentTarget.dataset.id
    if (id) {
      wx.navigateTo({ url: `/pages/task-detail/task-detail?id=${id}&groupId=${this.data.groupId}` })
    }
  },
})