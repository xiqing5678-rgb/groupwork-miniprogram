// app.ts
App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 初始化云开发（使用已有云环境，勿新建）
    if (!wx.cloud) {
      console.error('当前基础库版本过低，无法使用云开发能力，请使用 2.2.3 及以上基础库')
    } else {
      wx.cloud.init({
        env: 'your-cloud-env-id', // 云开发环境 ID
        traceUser: true,
      })
    }
  },
})