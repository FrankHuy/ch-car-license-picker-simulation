# 车牌选号模拟器

一个纯前端的中国车管所现场选号模拟器，第一版聚焦 `50选1` 流程。

## 功能

- 支持小型汽车蓝牌和新能源号牌格式切换。
- 支持配置投放号段、省份简称、发牌机关、序列起止范围。
- 支持必出号码序列和必出号码正则表达式。
- 候选号牌生成优先级：必出序列 > 必出正则 > 普通随机。
- 支持倒计时、选择、确认、超时锁定。
- 配置自动保存到浏览器 `localStorage`。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 推送到 GitHub

当前目标远程仓库：

```bash
git remote add origin git@github.com:FrankHuy/ch-car-license-picker-simulation.git
git branch -M main
git add .
git commit -m "Initial license picker simulator"
git push -u origin main
```

如果系统提示找不到 `git`，请先安装 Git 或修复 PATH。
