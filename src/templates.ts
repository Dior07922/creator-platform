// 模板数据：本地免费模板 + 云端免费模板 + 云端 VIP 模板

export type Template = {
  id: string;
  name: string;
  desc: string;
  vip: boolean;
  category: "daily" | "inspiration" | "study" | "reading" | "novel";
  initialText: string;
};

export const FREE_TEMPLATES: Template[] = [
  { id: "blank", name: "空白随笔", desc: "从空白开始", vip: false, category: "daily", initialText: "" },
  { id: "daily", name: "日常随笔", desc: "记录今天想到的事", vip: false, category: "daily", initialText: "今天想记下来的事：\n\n" },
  { id: "diary", name: "日记", desc: "记录一天的经历和感受", vip: false, category: "daily", initialText: "今天经历了什么：\n\n\n我的感受：\n\n" },
  { id: "inspiration", name: "灵感记录", desc: "快速抓住突然出现的想法", vip: false, category: "inspiration", initialText: "灵感：\n\n\n延伸想法：\n\n" },
  { id: "reading", name: "读书笔记", desc: "记录阅读重点与想法", vip: false, category: "reading", initialText: "书名：\n\n核心观点：\n\n\n我的思考：\n\n" },
  { id: "study", name: "学习笔记", desc: "整理知识和重点", vip: false, category: "study", initialText: "学习主题：\n\n要点：\n\n1. \n2. \n3. \n\n疑问：\n\n" },
  { id: "meeting", name: "会议记录", desc: "简单整理讨论和决定", vip: false, category: "daily", initialText: "会议时间：\n参与人：\n\n讨论要点：\n\n\n决定：\n\n待办：\n\n" },
];

export const VIP_TEMPLATES: Template[] = [
  { id: "novel-soul", name: "小说人物灵魂模板", desc: "基础人物卡与 8 个灵魂问题", vip: true, category: "novel", initialText: `姓名：\n性格：\n爱好：\n特点：\n习惯：\n最喜欢什么：\n\n1. 请你详细描述：名字的由来和代表什么？\n\n2. 请你描述为什么是这样的性格，发生了什么？经历了什么？\n\n3. 请你想想它有什么爱好，为什么？\n\n4. 请你描述你脑海里"它"的特点印象。\n\n5. 请你描述它有什么习惯，这种习惯它自己知道么？这种习惯怎么形成的？\n\n6. 请你描述它最喜欢什么，人、物、事、食，择一并说出为什么。\n\n7. 它在别人眼里、你的眼里、它自己眼里，分别是什么样的？\n\n8. 全部认真思考后，请写出现在的是，以及故事将从哪里开始。\n` },
  { id: "novel-outline", name: "小说模板 · 故事大纲", desc: "人物核心资料与 100 字故事大纲", vip: true, category: "novel", initialText: `故事围绕谁展开\n名字：\n年龄：\n性格：\n特征：\n经历影响她的事件：\n\n故事大纲（100 字以内）：\n` },
  { id: "today-record", name: "今日记录模板", desc: "图片与左右、下方自由记录区", vip: true, category: "daily", initialText: `今日记录\n\n【图片区】\n\n左记录区：\n\n右记录区：\n\n下方自由记录：\n\n` },
  { id: "novel-writing", name: "小说创作", desc: "人物、大纲、章节管理", vip: true, category: "novel", initialText: `【人物】\n\n【大纲】\n\n【章节】\n第 1 章\n\n` },
  { id: "novel-big-outline", name: "小说大纲", desc: "整理世界观与故事结构", vip: true, category: "novel", initialText: `世界观：\n\n主线：\n\n开端：\n\n发展：\n\n高潮：\n\n结局：\n\n伏笔：\n\n` },
  { id: "project-record", name: "项目记录", desc: "计划、进度、任务整理", vip: true, category: "study", initialText: `项目名：\n\n计划：\n\n进度：\n\n任务：\n- [ ] \n- [ ] \n- [ ] \n` },
  { id: "project-plan", name: "项目计划", desc: "目标、节点与执行安排", vip: true, category: "study", initialText: `目标：\n\n关键节点：\n1. \n2. \n3. \n\n执行安排：\n\n` },
];