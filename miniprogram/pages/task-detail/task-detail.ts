// pages/task-detail/task-detail.ts
import { callFunction, uploadFile, getTempFileURL } from '../../utils/cloud'
import { formatTime } from '../../utils/util'

interface Submission {
  submitterId: string
  submitterName: string
  type: string
  fileID: string
  url: string
  submittedAt: Date | string | null
  submittedAtText?: string
  isOnTime: boolean
}

interface TaskDetail {
  taskId: string
  groupId: string
  groupName: string
  name: string
  description: string
  contribution: number
  assignMode: string
  assigneeId: string
  assigneeName: string
  claimStartTime: Date | string | null
  claimEndTime: Date | string | null
  deadline: Date | string | null
  deadlineText?: string
  claimWindowText?: string
  submittedAtText?: string
  status: string
  claimEnded: boolean
  claimOpen: boolean
  overdueOnce: boolean
  submittedAt: Date | string | null
  submissions: Submission[]
  myRole: string
  isAssignee: boolean
}

interface MemberInfo {
  openid: string
  nickname: string
  role: string
}

const STATUS_TEXT: Record<string, string> = {
  unassigned: '未分配',
  assigned: '已分配',
  completed: '已完成',
  overdue: '已逾期',
}

Page({
  data: {
    taskId: '',
    groupId: '',
    loading: true,
    loadError: false,
    detail: null as TaskDetail | null,
    statusText: '',
    canClaim: false,
    canAssign: false,
    canSubmit: false,
    submitType: 'file' as 'file' | 'link',
    linkUrl: '',
    pendingFile: '',
    submitting: false,
    members: [] as MemberInfo[],
    memberNames: [] as string[],
  },
  onLoad(options: any) {
    this.setData({
      taskId: (options && options.id) || '',
      groupId: (options && options.groupId) || '',
    })
    this.loadDetail()
  },
  fmt(t: Date | string | null): string {
    if (!t) return ''
    const d = new Date(t)
    return isNaN(d.getTime()) ? '' : formatTime(d)
  },
  async loadDetail() {
    if (!this.data.taskId) {
      this.setData({ loading: false })
      return
    }
    this.setData({ loading: true })
    try {
      const detail = await callFunction<TaskDetail>('getTaskDetail', {
        taskId: this.data.taskId,
      })
      const canAssign = detail.myRole === 'leader' && detail.status === 'unassigned'
      const submissions = (detail.submissions || []).map(s => ({
        ...s,
        submittedAtText: this.fmt(s.submittedAt),
      }))
      const decorated: TaskDetail = {
        ...detail,
        submissions,
        deadlineText: this.fmt(detail.deadline),
        submittedAtText: this.fmt(detail.submittedAt),
        claimWindowText:
          detail.claimStartTime && detail.claimEndTime
            ? `${this.fmt(detail.claimStartTime)} ~ ${this.fmt(detail.claimEndTime)}`
            : '',
      }
      this.setData({
        detail: decorated,
        statusText: STATUS_TEXT[detail.status] || detail.status,
        canClaim: detail.claimOpen,
        canAssign,
        canSubmit: detail.isAssignee,
      })
      if (canAssign) {
        this.loadMembers()
      }
    } catch (err) {
      console.error('加载任务详情失败：', err)
      this.setData({ loadError: true })
    } finally {
      this.setData({ loading: false })
    }
  },
  onRetry() {
    this.setData({ loadError: false })
    this.loadDetail()
  },
  async loadMembers() {
    try {
      const res = await callFunction<{ members: MemberInfo[] }>('getGroupDetail', {
        groupId: this.data.groupId,
      })
      const members = res.members || []
      this.setData({
        members,
        memberNames: members.map(m => `${m.nickname}${m.role === 'leader' ? '（组长）' : ''}`),
      })
    } catch (err) {
      console.error('加载成员失败：', err)
    }
  },
  onSelectSubmitType(e: any) {
    this.setData({ submitType: e.currentTarget.dataset.type })
  },
  onLinkInput(e: any) {
    this.setData({ linkUrl: e.detail.value })
  },
  onChooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (file) {
          this.setData({ pendingFile: file.path })
        }
      },
    })
  },
  async onClaim() {
    try {
      await callFunction('claimTask', { taskId: this.data.taskId })
      wx.showToast({ title: '认领成功', icon: 'success' })
      this.loadDetail()
    } catch (err) {
      console.error('认领失败：', err)
    }
  },
  onAssign() {
    const names = this.data.memberNames
    if (names.length === 0) {
      wx.showToast({ title: '暂无成员可选', icon: 'none' })
      return
    }
    wx.showActionSheet({
      itemList: names,
      success: async (res) => {
        const member = this.data.members[res.tapIndex]
        if (!member) return
        try {
          await callFunction('assignTask', { taskId: this.data.taskId, assigneeId: member.openid })
          wx.showToast({ title: '分配成功', icon: 'success' })
          this.loadDetail()
        } catch (err) {
          console.error('分配失败：', err)
        }
      },
    })
  },
  async onPreviewFile(e: any) {
    const fileID = e.currentTarget.dataset.fileid
    if (!fileID) {
      return
    }
    wx.showLoading({ title: '加载中...' })
    try {
      const url = await getTempFileURL(fileID)
      const tempFilePath = await this.downloadFile(url)
      wx.hideLoading()
      const ext = (tempFilePath.split('.').pop() || '').toLowerCase()
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
      if (imageExts.indexOf(ext) >= 0) {
        wx.previewImage({ urls: [tempFilePath] })
        return
      }
      const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
      if (docExts.indexOf(ext) >= 0) {
        wx.openDocument({ filePath: tempFilePath, showMenu: true })
        return
      }
      wx.showToast({ title: '该格式暂不支持预览', icon: 'none' })
    } catch (err) {
      wx.hideLoading()
      console.error('查看文件失败：', err)
      wx.showToast({ title: '文件打开失败，请稍后重试', icon: 'none' })
    }
  },
  downloadFile(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      wx.downloadFile({
        url,
        success: (res) => {
          if (res.statusCode === 200 && res.tempFilePath) {
            resolve(res.tempFilePath)
          } else {
            reject(new Error('文件下载失败'))
          }
        },
        fail: (err) => {
          console.error('文件下载失败：', err)
          reject(err)
        },
      })
    })
  },
  onCopyLink(e: any) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.setClipboardData({ data: url })
    }
  },
  async onSubmit() {
    const taskId = this.data.taskId
    const type = this.data.submitType
    this.setData({ submitting: true })
    try {
      const payload: Record<string, any> = { taskId, type }
      if (type === 'link') {
        const url = this.data.linkUrl.trim()
        if (!url) {
          wx.showToast({ title: '请输入链接', icon: 'none' })
          return
        }
        payload.url = url
      } else {
        const filePath = this.data.pendingFile
        if (!filePath) {
          wx.showToast({ title: '请先选择文件', icon: 'none' })
          return
        }
        const ext = (filePath.split('.').pop() || 'file').split('?')[0]
        const cloudPath = `submissions/${this.data.groupId}/${taskId}/${Date.now()}-${Math.floor(Math.random() * 1000000)}.${ext}`
        const fileID = await uploadFile(filePath, cloudPath)
        payload.fileID = fileID
      }
      await callFunction('submitTask', payload)
      wx.showToast({ title: '提交成功', icon: 'success' })
      this.setData({ pendingFile: '', linkUrl: '' })
      this.loadDetail()
    } catch (err) {
      console.error('提交失败：', err)
    } finally {
      this.setData({ submitting: false })
    }
  },
})