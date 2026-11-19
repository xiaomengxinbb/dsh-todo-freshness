# dsh-todo-freshness

DSH 的任务卡片（"任务 1 进行中 · 5 待处理"）只是**最后一次 `todo_write` 的快照**。模型做完活直接输出最终答复时，那一步没有工具调用，也就再也没有机会回写，于是面板会一直挂着旧状态。这个插件不替你改数据，而是把"这份清单已经过期"这件事说出来，并催模型自己回写。

## 两个部件

**Host（`index.js`）**

- 注册一个会话投影 `todoFreshness`，从既有事件里折叠出：上次写清单是第几轮第几步、之后又跑了多少次工具调用、清单里还剩几项没有结论、这一轮是不是已经结束。
- 在 `tools/post-execute` 上挂一个建议：当清单里还有未完成项、且从上次回写起已经连续跑了 6 次（以及 14 次）工具调用时，往下一步注入一条提醒，要求模型用真实状态整表重写。
- 不写 `todo/write`，不把 `pending` 改成 `completed`。没干完就是没干完。

**Client（`client.js`）**

- 在 `conversation.input.dock` 的 order 1 注册一条提示条，只在两种情况下出现：
  - `stale`：清单里还有未完成项，但已经连续 6 次以上工具调用没有回写；
  - `closedWithUnfinished`：这一轮已经结束，清单却还留着未完成项。
- 正常更新清单时它不出现，不会和内置的任务卡片抢位置。

## 为什么这么设计

两种"修法"里，只有一种不撒谎：

| 做法 | 效果 | 问题 |
|---|---|---|
| 轮次结束时把遗留项一律标成 `completed` | 面板永远干净 | 没做完的活也显示完成，等于伪造结果 |
| 如实标注 + 催模型回写 | 面板可能仍然显示未完成 | 但它显示的确实是真话 |

这个插件走第二条。清单"对不上"时你看到的是明确的"这份清单还没跟上"，而不是一个看起来还在进行的假进度。

## 配置

`cordis.patch.yml` 里的行可以带 `config`：

```yaml
- insert:
    - id: todo-freshness
      name: dsh-todo-freshness
      config:
        nudge: false
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `nudge` | `true` | 是否注入中途提醒。关闭后只保留 Client 侧的标注，不产生任何模型请求 |

## 限制

- 提醒只是建议。模型可以不理会它，这时面板依旧停在旧状态——插件不会替它决定。
- 阈值（6 / 14 次调用）是经验值，写在 `lib/fold.js` 的 `STALE_CALLS` 和 `NUDGE_AT` 里，可以按自己的任务节奏调。
- 投影 key `todoFreshness` 是本插件私有的；卸载后它从会话状态里消失，不影响内置的 `todos`。

## 安装

`desktop` 这个 profile 只归桌面端管，命令行装不了：

```
$ dsh plugin --profile desktop add ...
error: profile "desktop" is managed exclusively by the Electron application
```

所以走桌面端的「插件」界面，或在会话里让 agent 用 `plugin_manager` 的 `install_bundle` 指定这个目录。装完在 bundle 列表里启用，刷新页面即可。

`index.js` import 了 `@deepseek-ai/dsh-llm`，所以 `peerDependencies` 里必须声明它——本地链接的包靠这份声明把 core 模块路由到应用自己的安装目录，漏了就报 `Cannot find module`。
