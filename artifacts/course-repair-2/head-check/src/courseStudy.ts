import type { DailyLesson, DailyPhrase } from './dailyCourse.ts';
import type { DailySession } from './dailyProgress.ts';
import { dailyWordTargets } from './dailyWordTargets.ts';

/** Presentation only. Never change the saved scope, phrase text or exercise queue. */
export function studyGroups(phrases: DailyPhrase[]) {
  const used = new Set<string>();
  const groups: { word?: DailyPhrase; example?: DailyPhrase; expression?: DailyPhrase }[] = [];
  for (const phrase of phrases) {
    if (used.has(phrase.id)) continue;
    const pilot = dailyWordTargets.find(word => word.id === phrase.id);
    if (phrase.id.startsWith('word-') || pilot) {
      const example = phrases.find(item => !used.has(item.id) && (pilot ? pilot.contexts.includes(item.id) : item.id === phrase.id.replace(/^word-/, 'example-')));
      groups.push({ word: phrase, example });
      used.add(phrase.id); if (example) used.add(example.id);
    }
  }
  for (const phrase of phrases) if (!used.has(phrase.id)) groups.push({ expression: phrase });
  return groups;
}

export function studyTitle(lesson: DailyLesson, session: DailySession, lessons: DailyLesson[]) {
  const themesById: Record<string, string> = {
    'P1-01-01': '代码仓库与项目文件', 'P1-01-02': '代码仓库的复制', 'P1-01-03': '创建与切换分支',
    'P1-01-04': '修改与提交代码', 'P1-01-05': '推送与拉取代码', 'P1-01-06': '代码协作流程',
    'P1-02-01': '函数、变量与常量', 'P1-02-02': '参数与返回值', 'P1-02-03': '常见数据类型',
    'P1-02-04': '类、对象与属性', 'P1-02-05': '条件、循环与方法', 'P1-02-06': '代码功能说明',
    'P1-03-01': '文件、目录与路径', 'P1-03-02': '终端与运行命令', 'P1-03-03': '软件包与依赖安装',
    'P1-03-04': '构建、编译与脚本', 'P1-03-05': '运行环境与配置', 'P1-03-06': '项目启动步骤',
    'P1-04-01': '错误与警告', 'P1-04-02': '测试与测试结果', 'P1-04-03': '日志与调试',
    'P1-04-04': '问题单与协作请求', 'P1-04-05': '模块与权限', 'P1-04-06': '故障报告',
  };
  if (!session.adaptive) return themesById[lesson.id] ?? lesson.title;
  const ids = session.adaptive.newIds.length ? session.adaptive.newIds : session.adaptive.focusIds;
  const themes = [...new Set(ids.flatMap(id => {
    const source = lessons.find(item => item.phrases.some(phrase => phrase.id === id));
    return source ? [themesById[source.id] ?? source.title] : [];
  }))];
  return `${lesson.title} · ${themes.join('、') || lessons.find(item => item.id === session.adaptive?.sourceLessonId)?.title || '词句练习'}`;
}
