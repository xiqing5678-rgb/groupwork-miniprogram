// index.ts
import { callFunction, uploadFile, getTempFileURL } from '../../utils/cloud'

interface UserInfo {
  _id: string
  nickname: string
  avatarUrl: string
  createdAt: Date | string
  updatedAt: Date | string
}

interface GroupSummary {
  groupId: string
  name: string
  description: string
  memberCount: number
  role: string
  status: string
}

const DEFAULT_AVATAR =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

Component({
  data: {
    loading: true,
    saving: false,
    userInfo: null as UserInfo | null,
    avatarUrl: DEFAULT_AVATAR,
    avatarChosen: false,
    groups: [] as GroupSummary[],
    leaderCount: 0,
    memberCount: 0,
    groupsLoading: false,
    loadError: false,
    groupsError: false,
    refresherTriggered: false,
  },
  lifetimes: {
    attached() {
      this.initUser()
    },
  },
  pageLifetimes: {
    show() {
      // 每次回到首页都刷新小组列表（创建/加入/从详情返回后能立即看到）
      if (this.data.userInfo && this.data.userInfo.nickname) {
        this.loadGroups()
      } else if (this.data.userInfo && !this.data.userInfo.nickname) {
        // 未设置资料时重新拉取（从引导页返回后能立即进入）
        this.initUser(false)
      }
    },
  },
  methods: {
    async initUser(allowRedirect = true) {
      this.setData({ loading: true })
      try {
        const user = await callFunction<UserInfo>('getUser', {})
        const avatarUrl = await this.resolveAvatar(user.avatarUrl)
        this.setData({
          userInfo: user,
          avatarUrl,
        })
        if (user.nickname) {
          this.loadGroups()
        } else if (allowRedirect) {
          wx.reLaunch({ url: '/pages/onboarding/onboarding' })
        }
      } catch (err) {
        console.error('用户初始化失败：', err)
        this.setData({ loadError: true })
      } finally {
        this.setData({ loading: false })
      }
    },

    async loadGroups() {
      this.setData({ groupsLoading: true })
      try {
        const res = await callFunction<{ groups: GroupSummary[] }>('getMyGroups', {})
        const groups = res.groups || []
        this.setData({
          groups,
          leaderCount: groups.filter(g => g.role === 'leader').length,
          memberCount: groups.filter(g => g.role !== 'leader').length,
        })
      } catch (err) {
        console.error('加载小组列表失败：', err)
        this.setData({ groupsError: true })
      } finally {
        this.setData({ groupsLoading: false })
      }
    },

    onRetryInit() {
      this.setData({ loadError: false })
      this.initUser()
    },
    onRetryGroups() {
      this.setData({ groupsError: false })
      this.loadGroups()
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
      const { avatarUrl } = e.detail
      this.setData({ avatarUrl, avatarChosen: true })
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
        // 用户新选择的本地头像需要先上传到云存储，持久化为 fileID
        if (picked && picked !== DEFAULT_AVATAR && !picked.startsWith('cloud://')) {
          const ext = (picked.split('.').pop() || 'png').split('?')[0]
          const cloudPath = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000000)}.${ext}`
          avatarUrl = await uploadFile(picked, cloudPath)
        }
        const user = await callFunction<UserInfo>('getUser', { nickname, avatarUrl })
        const displayUrl = await this.resolveAvatar(user.avatarUrl)
        this.setData({
          userInfo: user,
          avatarUrl: displayUrl,
        })
        wx.showToast({ title: '保存成功', icon: 'success' })
        if (user.nickname) {
          this.loadGroups()
        }
      } catch (err) {
        console.error('保存用户信息失败：', err)
      } finally {
        this.setData({ saving: false })
      }
    },

    onGoOnboarding() {
      wx.navigateTo({ url: '/pages/onboarding/onboarding' })
    },
    onCreateGroup() {
      wx.navigateTo({ url: '/pages/create-group/create-group' })
    },

    onJoinGroup() {
      wx.navigateTo({ url: '/pages/join-group/join-group' })
    },

    onGoMe() {
      wx.switchTab({ url: '/pages/me/me' })
    },

    onGroupTap(e: any) {
      const id = e.currentTarget.dataset.id
      if (id) {
        wx.navigateTo({ url: `/pages/group-detail/group-detail?id=${id}` })
      }
    },

    onRefresherRefresh() {
      this.loadGroups().then(() => {
        this.setData({ refresherTriggered: false })
      })
    },
  },
})