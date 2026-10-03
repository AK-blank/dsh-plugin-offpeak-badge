# dsh-plugin-offpeak-badge

**DeepSeek 峰谷计价角标 —— [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web 客户端的插件，中文 / English 双语。**

左上角品牌位的一枚小胶囊，一眼告诉你 DeepSeek API 现在按**空闲时段**（半价）还是**高峰时段**计费；悬停给出规则、今日类型与下一次切换的准确时刻。

[English README →](README.md)

![侧边栏品牌位的角标](docs/badge.png)

```
🐳 deepseek HARNESS  〔空闲〕        ← 绿色 = 空闲时段（半价）
🐳 deepseek HARNESS  〔高峰〕        ← 琥珀 = 高峰时段
```

侧边栏折叠成窄轨后，角标变成折叠按钮上的小圆点，窄轨下也不会看不到。

![悬停提示：规则与下一次切换](docs/tooltip.png)

## 它显示什么

| 位置 | 内容 |
|---|---|
| 侧边栏品牌位（`sidebar.brand.name`） | `空闲` / `高峰` 胶囊，按状态着色，悬停出提示 |
| 提示气泡 | 当前时段 · 今天的日期/星期/日期类型 · 下一次切换时刻与倒计时 · 规则原文 · 使用的节假日日历 |
| 窄轨（`shell.overlay`） | 折叠按钮右下角 8px 状态圆点 |
| 屏幕阅读器（`shell.overlay`） | 视觉隐藏的 `aria-live` 播报区（品牌位本身在 `aria-hidden` 子树里） |

## 安装

前置：一个 DSH 环境（`dsh --version`）与 Node ≥ 18。本包是一个 DSH **bundle**（声明了 `dsh.bundle.patch` 并附带 `cordis.patch.yml`），因此可以一行命令安装：

```bash
# 直接从 GitHub 安装（pnpm 拉取源码；本包无需构建，因此不会触发安装脚本授权）
dsh plugin --profile web add github:AK-blank/dsh-plugin-offpeak-badge

# 或者从本地 clone 安装
git clone https://github.com/AK-blank/dsh-plugin-offpeak-badge.git
dsh plugin --profile web add ./dsh-plugin-offpeak-badge
```

在 GUI 里等价操作：**插件 → 添加插件**，粘贴仓库地址即可。

`dsh plugin` 会写入依赖并把该 bundle 追加到 profile 的 `dsh.profile.bundles`；正在运行的 `dsh web` 会**热加载**新配置，无需重启。角标没出现就刷新一次浏览器页面。

<details>
<summary>备选：脚本安装</summary>

在无法使用 bundle 安装路径的部署里（或者你更希望插件放在 `~/.dsh/plugins/` 而不是 profile 的包目录里），`install.mjs` 会手工接线：把包复制到 `~/.dsh/plugins/dsh-plugin-offpeak-badge/`，软链到 `~/.dsh/profiles/node_modules/`，并把插件条目追加到 `~/.dsh/profiles/web/cordis.patch.yml`（追加前先做带时间戳的备份）。**不会碰 DSH home 之外的任何路径。**

```bash
git clone https://github.com/AK-blank/dsh-plugin-offpeak-badge.git
cd dsh-plugin-offpeak-badge
node install.mjs
```

参数：`--home <dir>`（DSH home，默认 `$DSH_HOME` 或 `~/.dsh`）、`--profile <name>`（默认 `web`）、`--dir <path>`、`--copy`（默认）、`--link`、`--dry-run`、`--help`。
</details>

## 卸载

```bash
dsh plugin --profile web remove dsh-plugin-offpeak-badge   # bundle 方式安装
node install.mjs --uninstall [--purge]                    # 脚本方式安装
```

## 判定规则

本插件逐字实现 DeepSeek 官方定价页脚注：

> 空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日全天均为空闲时段。

> Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays. All other hours are off-peak, including weekends and Chinese public holidays in full.

中英两版的窗口逐位等价（UTC 与北京时间差 8 小时）；**日期类型一律按北京日历日判定**：

```
高峰 ⇔ 北京日历日是周一~周五 ∧ 不是法定节假日 ∧ 时刻 ∈ [09:00,12:00) ∪ [14:00,18:00)
空闲 ⇔ 其余全部时刻
```

两个常见疑问：

* **调休上班的周末**：它本身就是「周末」，而官方把周末整体划为空闲，所以**全天空闲**。媒体把这条总结成「调休上班的周末、中国法定节假日全天均按空闲时段计费」——那句话是新闻标题而非官方原文（DeepSeek 官方页面没有「调休」二字），但结论正确，而且不需要额外条款。提示气泡仍会把这种日子单独点名，免得看起来像日历算错了。
* **落在工作日的法定节假日**：官方明确「不含中国法定节假日」，因此整天不进入高峰。插件内置法定节假日清单，能区分「节假日的周一」与「普通周一」。

### 日历覆盖

| 年份 | 通知 | 节假日 | 调休上班 |
|---|---|---|---|
| 2025 | 国办发明电〔2024〕12号 | 28 天 | 5 天 |
| 2026 | 国办发明电〔2025〕7号 | 33 天 | 6 天 |

对于放假通知尚未发布的年份（成文时是 2027 年），规则退化为「周一~周五即高峰候选日」，并在提示里**明说**「2027 年放假通知尚未发布，暂按周一至周五推算」，绝不假装知道节假日。新增一年只需往 `lib/client.js` 的 `CALENDAR` 追加一条；自检脚本会校验天数、日期去重、调休日必须落在周六/周日、以及是否记录了官方出处链接。

## 双语

插件在**一次注册调用里同时提供中英两套词典**（`ctx.locale.register(NS, { zh, en })`，这是 DSH locale 服务的硬性要求），三个槽位都声明了该命名空间，因此切换界面语言会即时重渲染：

* 胶囊跟随界面语言：中文显示 `空闲`/`高峰`，英文显示 `Idle`/`Peak`；
* 提示气泡、倒计时措辞、星期名、屏幕阅读器播报同样双语；
* 规则那一行在英文界面引用官方英文原文，在中文界面引用官方中文原文；
* `node selftest.mjs` 会阻止两套词典漂移：校验键集合一致、每个键的 `{占位符}` 集合一致、无空值，并用两种语言各渲染一次提示文案。

## 自检

```bash
node selftest.mjs          # 89 项离线断言，不联网、不开浏览器
node selftest.mjs --now    # 额外用中英双语打印「此刻」的判定
```

自检按浏览器模块表的方式加载 `lib/client.js`（桩 `window.__ModuleLoader__` + 桩 `require`），覆盖：模块契约、工作日全部 10 个窗口边界、周末与调休上班的周末、8 个落在工作日的法定节假日、未覆盖年份的退化行为、下一次切换的六种情形（同日 / 跨周末 / 跨假期）、日历完整性、时区无关性（`TZ=UTC` 与 `TZ=America/New_York` 下判定一致）、两套词典、以及用桩上下文验证的注册契约。

## 接入 DSH 的方式

这是一个**双面 Cordis 插件**，形态与官方 `@deepseek-ai/dsh-client-ui-*` 包完全一致：

| 文件 | 作用 |
|---|---|
| `lib/index.js` | 宿主半边——空 `apply()`，只为给 Loader 一行宿主记录，从而让 `dsh-client-modules` 的增量 `dsh.client` 扫描把浏览器半边加进 `__DSH_BOOT__` 图 |
| `lib/client.js` | 浏览器半边——手写的 `window.__ModuleLoader__.load({ id, factory })` 预打包模块：规则、日历、词典、三个槽位 |
| `package.json` | `dsh.client`（`platform: web`、加载器 `inject`、模块 `external`）与 `exports["./client"]` |

`lib/client.js` **刻意不引入构建步骤**：它就是官方客户端插件发布时的同一种「预打包 CJS 工厂」形态，仓库可以原样阅读、diff、发布。它只依赖平台种子词（`react`、`@deepseek-ai/dsh-client-ui-primitives`）与 `slots`、`locale` 两个服务。

### 设计取舍

* **为什么用 `priority: -1` 接管品牌位**：`sidebar.brand.name` 是 `single` 槽位——同优先级重复注册会抛错，且只有最低优先级者渲染。官方字标插件占 0，因此只能用更低优先级接管。接管后由本插件自己渲染官方 `BrandWordmark`，外观与官方完全一致，只是后面多一枚胶囊。
* **为什么字标高度是 22 而不是官方的 24**：默认 280px 侧边栏下，品牌区宽度是硬预算（24 图标 + 8 + 字标 + 6 + 胶囊 ≤ 216px）。字标缩 2px 才能让两字胶囊不被裁切；行宽低于 250px 时胶囊自动退化为圆点（`ResizeObserver` 实测）。
* **窄轨圆点为什么走 `shell.overlay`**：`sidebar.toggle.badge` 被官方设置插件的 `DesktopUpdateBadge` 占着，它还同时承担「连接已断开/正在重连」提示；single 槽位是覆盖关系，抢过来会把这些提示一起吃掉。圆点因此纯增补地画在浮层里，位置由折叠按钮的视口矩形换算。
* **点击不会误触**：整个品牌区就是「新建会话」按钮，胶囊对 `click`/`mousedown`/`pointerdown` 做了 `stopPropagation`，点角标不会新建会话。
* **圆点显式写 `corner-shape: round`**：DSH 的全局设计语言会把 `border-radius` 渲染成超椭圆（squircle），不钉死的话圆点看起来是圆角方块。

## 兼容性

* 针对 DSH `0.2.0-rc.2` 开发与验证（客户端插件 API：`dsh.client` + `__ModuleLoader__`、槽位注册表、locale 注册表），已记录在 `dsh.compatibility.dshReleases`。
* 官方包以 **peerDependencies** 声明，且范围自带预发布分支（`>=0.2.0-rc.1 <1.0.0-0`），避免 `-rc` 版本被静默排除；运行时实际只 import 了 shell 提供的种子模块 `@deepseek-ai/dsh-client-ui-primitives`。
* 无运行时依赖、无构建步骤、无网络请求：角标完全由本机时钟 + 内置日历算出，因此 git 安装**不需要** pnpm 的 `allowBuilds` 构建授权。

## 社区

* 本仓库的 topics：`dsh-plugin` `dsh` `dsh-plugins` `deepseek-harness` `deepseek-harness-plugin` `cordis` `cordis-plugin` `i18n`。DSH 官方 README 要求插件作者添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic，[`dsh-plugin-radar`](https://github.com/AdamPlatin123/dsh-plugin-radar) 也靠它自动索引插件。
* 本插件投稿 / 收录的社区目录：[`awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（[awesome-dsh-plugin.com](https://awesome-dsh-plugin.com) 与 [dsh-market](https://dshmarket.com) 的数据源），可直接提 PR 的条目文件见 [`contrib/AK-blank__dsh-plugin-offpeak-badge.yml`](contrib/AK-blank__dsh-plugin-offpeak-badge.yml)。
* DSH 官方资源：[仓库](https://github.com/deepseek-ai/deepseek-harness) · [文档](https://deepseek-harness.github.io/deepseek-harness/) · [Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) · [Discord](https://discord.gg/4MrtZUhpxg) · 打包指南[《Package and install a plugin》](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish.html)。

**非官方插件。** 与 DeepSeek 无隶属、背书或支持关系。「DeepSeek Harness」是 DeepSeek 的商标；本项目按官方品牌指南的建议，对生态使用缩写「DSH」。

## 许可

[MIT](LICENSE)。规则与日历数据引自 DeepSeek 公开定价页与国务院办公厅放假通知，出处已记录在源码中。
