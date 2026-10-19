# 项目架构说明

本文用通俗的方式梳理项目的整体架构：前端核心模块、后端云函数、数据库表，以及数据从前端到数据库的流转过程。

## 一句话概括

这是一个**微信小程序**（面向大学生的课程小组协作工具），基于**微信云开发**三件套：

- **前端**：`miniprogram/` 里的 TypeScript 小程序页面
- **后端**：`cloudfunctions/` 里的云函数（每个 API 是一个云函数，跑在微信服务器上）
- **数据库**：微信云数据库（NoSQL，用「集合」存 JSON 文档）

关键点：**前端不直接碰数据库**，所有数据读写都必须经过云函数。

---

## 一、三层架构全景

```
┌────────────────────────────────────────────────────────────┐
│                    前端  miniprogram/                       │
│                                                            │
│  11 个页面  +  navigation-bar 组件                         │
│  ┌──────────────────────────────────────────────┐          │
│  │  utils/cloud.ts  统一封装：                    │          │
│  │   · callFunction(名字, 参数)  调云函数         │          │
│  │   · uploadFile()              传文件到云存储   │          │
│  │   · getTempFileURL()          fileID→临时链接  │          │
│  └──────────────────────────────────────────────┘          │
└──────┬──────────────────────────────────────────┬──────────┘
       │ wx.cloud.callFunction()                  │ wx.cloud.uploadFile()
       ▼                                          ▼
┌──────────────────────────────┐      ┌──────────────────────────┐
│   后端  14 个云函数           │      │   云存储（文件 / 头像）    │
│   cloudfunctions/*/index.js  │      │   avatars/… , 任务附件    │
│                              │      │   返回 fileID             │
│  身份：openid 从微信上下文取  │      │   (cloud:// 开头)         │
│  （前端传不了，防伪造）       │      └──────────────────────────┘
└──────────────┬───────────────┘
               │ wx-server-sdk（管理端权限）
               ▼
┌────────────────────────────────────────────────────────────┐
│              云数据库（只 3 张表）                           │
│                                                            │
│   users   ·   groups   ·   tasks                           │
│                                                            │
│   权限全是 { read:false, write:false }                     │
│   → 前端无法直连，只有云函数能读写                          │
└────────────────────────────────────────────────────────────┘
```

---

## 二、前端核心模块（页面）

前端共 11 个页面，位于 `miniprogram/pages/`：

| 页面 | 作用 |
|------|------|
| `index`（首页 tab） | 用户资料编辑 + 「我的小组」列表 |
| `me`（我的 tab） | 个人资料、退出登录、关于、帮助 |
| `onboarding` | 首次进入引导页，设置昵称 + 头像 |
| `create-group` | 创建小组 |
| `join-group` | 输入邀请码加入小组 |
| `group-detail` | 小组主页：任务列表、进度、设置会议时间、结束小组 |
| `group-progress` | 小组进度 / 成员贡献率看板 |
| `task-create` | 组长创建任务 |
| `task-detail` | 任务详情：认领 / 指派 / 提交成果 |
| `help` | 帮助页（纯静态，不调云函数） |
| `logs` | 模板默认页（不调云函数） |

统一封装层 `miniprogram/utils/cloud.ts`：

- `callFunction(name, data)` — 调云函数，统一处理返回码（`code === 200` 才算成功）
- `uploadFile(path, cloudPath)` — 上传文件到云存储，返回 `fileID`
- `getTempFileURL(fileID)` — 把 `cloud://` 开头的 fileID 换成可显示/下载的临时链接

入口 `app.ts` 只做 `wx.cloud.init()` 初始化云环境。

---

## 三、后端核心 API（云函数）

后端共 14 个云函数，按业务分四类：

**用户类**

- `getUser` — 读取/首次创建用户资料，或更新昵称头像（一个函数身兼多职）
- `resetUserProfile` — 「退出登录」，清空昵称头像

**小组类**

- `createGroup` — 创建小组（自动生成 6 位邀请码）
- `joinGroup` — 凭邀请码加入
- `getMyGroups` — 我加入的小组列表
- `getGroupDetail` — 小组详情（含成员列表）
- `setMeetingTime` — 组长设置/清除会议时间
- `endGroup` — 组长结束小组

**任务类**

- `createTask` — 创建任务（指派 / 认领两种模式）
- `getTaskList` — 小组任务列表
- `getTaskDetail` — 任务详情（含提交记录）
- `assignTask` — 组长指派任务给某人
- `claimTask` — 成员认领任务（带时间窗口 + 防并发抢单）
- `submitTask` — 提交任务成果（文件或链接）

**统计类**

- `getGroupProgress` — 小组整体进度 + 每个成员的完成数 / 贡献率

---

## 四、数据库表（3 张集合）

数据库是 NoSQL，一个「集合」就是一张表，只有 3 张：

### 1. `users`（用户表）

```
openid     微信用户唯一 ID（主键）
nickname   昵称
avatarUrl  头像（云存储 fileID 或 http 链接）
createdAt / updatedAt
```

### 2. `groups`（小组表）

```
name / description   名称、描述
creatorId            组长 openid
memberIds            成员 openid 数组
roles                { openid: 'leader'|'member' } 角色表
status               'active' | 'ended'
inviteCode           6 位邀请码
meetingTime          会议时间（可空）
createdTime / updatedTime
```

### 3. `tasks`（任务表）

```
groupId / name / description / contribution(贡献率 1-100)
assignMode           'assign'(直接指派) | 'claim'(认领)
assigneeId           负责人 openid（可空）
claimStartTime / claimEndTime   认领时间窗口
deadline             截止时间
status               'unassigned' | 'assigned' | 'completed'
submissions          内嵌的提交记录数组（见下）
submittedAt / overdueOnce / createdBy / createdTime / updatedTime
```

两点设计说明：

- **没有单独的「提交记录表」**。提交记录直接以数组内嵌在 `tasks.submissions`，每条是 `{ submitterId, type('file'|'link'), fileID/url, submittedAt, isOnTime }`。
- **「已逾期(overdue)」不是落库状态**。数据库只存 `unassigned/assigned/completed`，「逾期」是云函数读取时拿 `deadline` 和当前时间临时算出来的。

数据库权限（见 `docs/database-permissions.md`）：三张表都设成 `{ read: false, write: false }`，小程序客户端完全不能直连数据库，只有云函数（管理端权限）能读写。

---

## 五、完整映射关系（页面 → 云函数 → 表）

图例：`R`=读，`W`=写

### 🧑 用户 / 个人

```
onboarding ──▶ getUser ──────────▶ users (R/W)
                                └─▶ 云存储 (上传头像 W)

index      ──▶ getUser ──────────▶ users (R/W)
           ──▶ getMyGroups ──────▶ groups (R)

me         ──▶ getUser ──────────▶ users (R/W)
           ──▶ resetUserProfile ─▶ users (R/W)
```

### 👥 小组

```
create-group   ──▶ createGroup ─────▶ groups (W)

join-group     ──▶ joinGroup ───────▶ groups (R/W)

group-detail   ──▶ getGroupDetail ──▶ groups (R) + users (R)
               ──▶ getTaskList ─────▶ tasks (R) + groups (R) + users (R)
               ──▶ getGroupProgress ▶ tasks (R) + groups (R) + users (R)
               ──▶ claimTask ───────▶ tasks (R/W) + groups (R)
               ──▶ setMeetingTime ──▶ groups (R/W)
               ──▶ endGroup ────────▶ groups (R/W)

group-progress ──▶ getGroupProgress ▶ tasks (R) + groups (R) + users (R)
```

### 📋 任务

```
task-create ──▶ getGroupDetail ──▶ groups (R) + users (R)
            ──▶ createTask ──────▶ tasks (W) + groups (R)

task-detail ──▶ getTaskDetail ───▶ tasks (R) + groups (R) + users (R)
            ──▶ getGroupDetail ──▶ groups (R) + users (R)
            ──▶ claimTask ───────▶ tasks (R/W) + groups (R)
            ──▶ assignTask ──────▶ tasks (R/W) + groups (R)
            ──▶ submitTask ──────▶ tasks (R/W) + groups (R)
            └─▶ uploadFile ──────▶ 云存储 (任务附件 W)
```

---

## 六、反向视图：每张表被谁动过

```
users  ◀─ 读  ─ getUser / getGroupDetail / getTaskList / getTaskDetail / getGroupProgress
       ◀─ 写  ─ getUser / resetUserProfile

groups ◀─ 读  ─ getMyGroups / getGroupDetail / getTaskList / getTaskDetail /
                 getGroupProgress / joinGroup / createTask / assignTask / claimTask /
                 submitTask / setMeetingTime / endGroup
       ◀─ 写  ─ createGroup / joinGroup / setMeetingTime / endGroup

tasks  ◀─ 读  ─ getTaskList / getTaskDetail / getGroupProgress /
                 assignTask / claimTask / submitTask
       ◀─ 写  ─ createTask / assignTask / claimTask / submitTask
```

（`submissions`、`roles`、`meetingTime` 都不是独立表，分别内嵌在 `tasks` 和 `groups` 里。）

---

## 七、一次「提交任务」的完整数据流

```
 task-detail 页面
   │  ① 用户选了文件
   ▼
 uploadFile()  ──────────────▶ 云存储
   │                            └─ 返回 fileID = "cloud://xxx"
   │  ② 拿到 fileID
   ▼
 callFunction('submitTask',
        { taskId, type:'file', fileID })
   │
   ▼
 submitTask 云函数
   ├─ ① getWXContext() 拿 openid（谁在提交？）
   ├─ ② 读 tasks 表 → 校验：openid == 负责人？
   ├─ ③ 读 groups 表 → 校验：小组还活跃？
   ├─ ④ 对比 deadline → 算 isOnTime
   ├─ ⑤ update tasks 表：
   │       submissions 数组 push 一条提交记录
   │       status → 'completed'
   └─ ⑥ 返回 { code:200 }
   │
   ▼
 前端提示「提交成功」
```

之后别人打开任务详情时，`getTaskDetail` 读出 `submissions` 里的 `fileID`，前端再用 `getTempFileURL()` 把它换成可下载的临时链接显示。

---

## 总结

- 前端是 11 个微信小程序页面 + 一个 `cloud.ts` 封装层。
- 后端是 14 个云函数（用户 / 小组 / 任务 / 进度四类）。
- 数据库只有 `users`、`groups`、`tasks` 三张表（提交记录内嵌在任务里）。
- 数据一律「前端 → 云函数 → 数据库」单向流动，openid 由服务端从微信上下文获取，前端无法伪造。
