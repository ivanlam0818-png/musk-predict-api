# Musk Tweet Prediction Markets - 部署指南

## 📁 项目结构

```
musk-predict-api/          # 后端 API 服务
├── api/
│   └── index.js          # API 主文件
├── package.json          # 依赖配置
├── vercel.json           # Vercel 配置
└── .env.example          # 环境变量示例

musk-predict-app.html      # 前端页面 (独立运行)
```

---

## 🚀 部署步骤

### 第一步：配置 Twitter API 环境变量

1. 登录 [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)

2. 创建 `.env` 文件（在 `musk-predict-api` 目录下）：
   ```bash
   cp .env.example .env
   ```

3. 填写你的 Twitter API 凭证：
   ```env
   TWITTER_API_KEY=你的API_KEY
   TWITTER_API_SECRET=你的API_SECRET
   TWITTER_ACCESS_TOKEN=你的ACCESS_TOKEN
   TWITTER_ACCESS_SECRET=你的ACCESS_SECRET
   ```

### 第二步：部署到 Vercel

1. 安装 Vercel CLI：
   ```bash
   npm i -g vercel
   ```

2. 登录 Vercel：
   ```bash
   vercel login
   ```

3. 部署 API：
   ```bash
   cd musk-predict-api
   vercel
   ```

4. 设置环境变量（在 Vercel Dashboard）：
   - 进入你的项目 → Settings → Environment Variables
   - 添加 `TWITTER_API_KEY`
   - 添加 `TWITTER_API_SECRET`
   - 添加 `TWITTER_ACCESS_TOKEN`
   - 添加 `TWITTER_ACCESS_SECRET`

5. 重新部署：
   ```bash
   vercel --prod
   ```

### 第三步：更新前端 API 地址

部署成功后，修改 `musk-predict-app.html` 中的 API_URL：

```javascript
const API_URL = 'https://你的项目.vercel.app/api';
```

---

## 📡 API 端点

### GET /api

返回完整的市场数据：

```json
{
  "success": true,
  "timestamp": "2026-04-02T12:00:00.000Z",
  "user": {
    "name": "Elon Musk",
    "username": "elonmusk",
    "followers": 150000000,
    "tweetCount": 25000
  },
  "polymarket": {
    "markets": [...],
    "totalVolume": 18400000
  },
  "tweetStats": {
    "historical": [
      {"date": "2026-04-02", "dayName": "周四", "count": 7},
      ...
    ],
    "current": 7,
    "dailyRate": 35.0,
    "hourlyRate": 1.46
  },
  "prediction": {
    "centerPoint": 247,
    "probabilities": [
      {"range": "220-239", "probability": 9.8, "isCenter": false},
      {"range": "240-259", "probability": 43.2, "isCenter": true},
      {"range": "260-279", "probability": 29.5, "isCenter": false},
      {"range": "280-299", "probability": 11.5, "isCenter": false}
    ],
    "remainingTime": "2天 12小时"
  },
  "progress": {
    "current": 7,
    "target": 250,
    "percentage": 3
  }
}
```

---

## ⚠️ Twitter API 权限说明

免费版 (Essential) 包含：
- ✅ 读取用户推文
- ✅ 读取用户信息
- ✅ 推文计数统计

**注意**：免费版可能有限制，建议申请 Academic 访问以获得更高配额。

---

## 🔧 故障排除

### API 返回 401 错误
- 检查 Bearer Token 是否正确
- 确保 App 有正确的权限

### CORS 错误
- Vercel Serverless Functions 默认支持 CORS
- 确保没有设置 `Access-Control-Allow-Origin: *` 以外的限制

### 数据为空
- Twitter API 免费版可能有速率限制
- 检查 API Key 是否有效

---

## 📝 更新日志

- **v1.0.0** - 初始版本
  - Polymarket 市场数据获取
  - Twitter 推文统计
  - 预测概率计算
  - 历史数据分析
