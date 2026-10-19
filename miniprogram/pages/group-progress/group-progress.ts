// pages/group-progress/group-progress.ts
import { callFunction } from '../../utils/cloud'

interface MemberStat {
  openid: string
  nickname: string
  avatarUrl: string
  role: string
  assignedCount: number
  completedCount: number
  overdueCount: number
  contribution: number
}

interface ProgressData {
  groupId: string
  groupName: string
  overall: {
    total: number
    completed: number
    overdue: number
    unassigned: number
    completionRate: number
  }
  members: MemberStat[]
}

const DEFAULT_AVATAR =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Page({
  data: {
    groupId: '',
    loading: true,
    loadError: false,
    progress: null as ProgressData | null,
    defaultAvatar: DEFAULT_AVATAR,
    overContribution: false,
  },
  onLoad(options: any) {
    this.setData({ groupId: (options && options.groupId) || '' })
    this.loadProgress()
  },
  onRetry() {
    this.setData({ loadError: false })
    this.loadProgress()
  },
  async loadProgress() {
    if (!this.data.groupId) {
      this.setData({ loading: false })
      return
    }
    this.setData({ loading: true })
    try {
      const progress = await callFunction<ProgressData>('getGroupProgress', {
        groupId: this.data.groupId,
      })
      const members = progress.members || []
      const overContribution = members.some(m => m.contribution > 100)
      this.setData({ progress, overContribution })
    } catch (err) {
      console.error('加载进度失败：', err)
      this.setData({ loadError: true })
    } finally {
      this.setData({ loading: false })
    }
  },
})