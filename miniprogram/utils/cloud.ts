// miniprogram/utils/cloud.ts
/**
 * 云开发能力统一封装
 *
 * 约定：云函数统一返回 { code: number, message: string, data?: any }
 * - code === 200 视为成功，resolve(data)
 * - 其他 code 视为业务失败，toast 提示 message 并 reject
 * - 网络或调用失败时 toast 提示并 reject
 */

interface CloudResult<T = any> {
  code: number
  message: string
  data?: T
}

export function callFunction<T = any>(
  name: string,
  data: Record<string, any> = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const result = res.result as CloudResult<T>
        if (result && result.code === 200) {
          resolve(result.data as T)
        } else {
          const message = (result && result.message) || '请求失败，请稍后重试'
          wx.showToast({ title: message, icon: 'none' })
          reject(new Error(message))
        }
      },
      fail: (err) => {
        console.error('云函数调用失败：', name, err)
        wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
        reject(err)
      },
    })
  })
}

/** 上传文件到云存储，返回 fileID */
export function uploadFile(filePath: string, cloudPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => {
        resolve(res.fileID)
      },
      fail: (err) => {
        console.error('文件上传失败：', err)
        wx.showToast({ title: '上传失败，请稍后重试', icon: 'none' })
        reject(err)
      },
    })
  })
}

/** 将云存储 fileID 转为可访问的临时链接 */
export function getTempFileURL(fileID: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        const item = res.fileList && res.fileList[0]
        if (item && item.tempFileURL) {
          resolve(item.tempFileURL)
        } else {
          reject(new Error('获取文件链接失败'))
        }
      },
      fail: (err) => {
        console.error('获取文件链接失败：', err)
        reject(err)
      },
    })
  })
}