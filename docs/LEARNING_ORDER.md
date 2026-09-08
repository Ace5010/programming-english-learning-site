# 今日学习顺序

今日学习显示排序最靠前的 10 个未掌握词。标记掌握后立即补位；不满 10 个时显示剩余数量。顺序固定，不随机抽取，也不按日期重置。

排序规则：核心词优先；随后是下列官方文档样本中出现过的其他词；再接未命中的基础词和专业词。每个阶段内按样本出现次数降序，同次数按原词汇 ID 排序。该规则是面向编程阅读的学习优先级近似，不是全行业的真实词频排名。未命中不代表实际不常用。

`src/learning-frequency.json` 保存各词汇 ID 对应的出现次数，不改变词汇 ID、学习记录或音频。统计于 2026-09-08：忽略大小写、按完整词或短语匹配，不合并词形；包含文档中的代码和标记，长文档的权重较大。7 份样本命中 867 个词。

来源（获取时的主分支版本）：

- https://raw.githubusercontent.com/git/git/master/Documentation/git.adoc
- https://raw.githubusercontent.com/git/git/master/Documentation/gittutorial.adoc
- https://raw.githubusercontent.com/microsoft/TypeScript/main/README.md
- https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md
- https://raw.githubusercontent.com/nodejs/node/main/doc/api/http.md
- https://raw.githubusercontent.com/python/cpython/main/Doc/tutorial/controlflow.rst
- https://raw.githubusercontent.com/python/cpython/main/Doc/tutorial/datastructures.rst

今日学习不提供级别筛选，避免补入不同级别的词后被旧筛选条件隐藏。搜索只筛选当前十个待学词；完整搜索可在全部词汇中使用。累计掌握数量继续沿用原有记录。
