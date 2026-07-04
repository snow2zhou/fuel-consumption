# 油耗记录 APP

一个可在安卓手机上安装使用的油耗记录应用，基于 Vue3 + Vant + Capacitor 开发。

## 功能特性

### 1. 加油记录
- 记录加油时间、加油量（L）、油价（元/L）、费用（元）、总行驶里程（km）、预计可行驶里程（km）
- 支持"是否加满油箱"标记（影响油耗计算准确性）
- 支持油号选择（92#/95#/98#/柴油）
- 费用自动计算（加油量 × 油价），支持手动覆盖
- **自动对比计算**：新增加油记录后，自动与上一次加油记录对比，计算：
  - 间驶里程 = 本次总里程 - 上次总里程
  - 百公里油耗 = 本次加油量 ÷ 间驶里程 × 100（L/100km）
  - 每公里费用 = 本次加油量 × 上次油价 ÷ 间驶里程（元/km）
  - 期间总费用 = 本次加油量 × 上次油价

### 2. 行程快照
- 记录停车后的相关里程数据：总行驶里程、本次行驶里程、估计可行驶里程
- 自动计算"估计总行驶里程 = 总行驶里程 + 估计可行驶里程"

### 3. 统计报表
- 概览统计：平均百公里油耗、平均每公里费用、累计加油量/费用/里程、平均油价
- 图表展示：百公里油耗趋势（折线图）、每次加油费用（柱状图）、油价变化趋势（折线图）
- 一键导出 Excel：加油记录、行程快照均可导出为 .xlsx 文件

### 4. 设置
- 默认油号偏好设置
- 油耗单位切换
- 数据管理（清空加油记录/行程快照/全部数据）

## 技术栈

| 层面 | 选型 |
|------|------|
| 前端框架 | Vue 3 (Composition API) |
| 构建工具 | Vite |
| UI 组件库 | Vant 4 |
| 路由 | Vue Router |
| 状态管理 | Pinia |
| 图表 | ECharts |
| Excel 导出 | SheetJS (xlsx) |
| 数据存储 | localStorage |
| 安卓打包 | Capacitor |

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器（浏览器调试）
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 打包安卓 APK

需要先安装 Java JDK 17 和 Android Studio。

```bash
# 1. 构建前端
npm run build

# 2. 添加安卓平台（首次执行）
npm run cap:add:android

# 3. 同步资源到安卓工程
npm run cap:sync

# 4. 打开 Android Studio 进行打包
npm run cap:open:android
```

在 Android Studio 中：
1. 等待 Gradle 同步完成
2. 菜单 Build → Build Bundle(s) / APK(s) → Build APK(s)
3. 生成的 APK 在 `android/app/build/outputs/apk/debug/` 目录下

## 项目结构

```
FuelConsumption/
├── src/
│   ├── api/                 # 数据层
│   │   ├── storage.js       # localStorage 封装
│   │   └── models.js        # 数据模型与校验
│   ├── stores/              # Pinia 状态管理
│   │   ├── refuel.js        # 加油记录
│   │   ├── trip.js          # 行程快照
│   │   └── settings.js      # 设置
│   ├── utils/               # 工具函数
│   │   ├── calc.js          # 油耗计算
│   │   ├── export.js        # Excel 导出
│   │   └── format.js        # 格式化
│   ├── views/               # 页面
│   │   ├── refuel/          # 加油记录
│   │   ├── trip/            # 行程快照
│   │   ├── stats/           # 统计报表
│   │   └── settings/        # 设置
│   ├── router/              # 路由
│   ├── styles/              # 全局样式
│   ├── App.vue              # 根组件
│   └── main.js              # 入口
├── capacitor.config.ts      # Capacitor 配置
├── vite.config.js           # Vite 配置
├── index.html
└── package.json
```

## 油耗计算说明

百公里油耗的准确计算依赖一个前提：**每次加油都加满油箱**。

因为本次加的油，实际上是上次加油到本次加油期间消耗掉的。所以：

```
百公里油耗 = 本次加油量 ÷ (本次总里程 - 上次总里程) × 100
```

只有当本次与上次都"加满"时，该计算才准确。本应用在未加满时会提示"无法准确计算油耗"。
