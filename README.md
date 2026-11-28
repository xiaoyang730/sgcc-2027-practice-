# 2027国网公共与行业知识刷题

移动端优先的静态刷题网站，包含832道公共与行业知识题。

## 功能

- 背题模式、分类刷题和随机刷题
- 六类题目：单选、多选两选、多选三选、多选全选、判断对、判断错
- 每题正确/错误次数、正确率和重点复习统计
- 学习记录保存在当前浏览器，可导出和导入
- 计算机基础57条、电力系统基础76条和数学基础81条逐条学习
- 三个知识模块在网站内只读，由桌面TXT统一同步；计算机基础另含随机测试

## GitHub Pages

推送到 `main` 分支后，由 `.github/workflows/deploy-pages.yml` 自动发布。

预计访问地址：<https://xiaoyang730.github.io/sgcc-2027-practice-/>

## 数据说明

`data/questions.json` 包含完整题库，`data/computer-basics.json`、`data/power-system-basics.json`和`data/math-basics.json`包含三个知识模块。此仓库和GitHub Pages均为公开内容，不包含用户的本地学习记录。
