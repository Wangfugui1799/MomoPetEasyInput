# 月光小窝素材

2026-09-12，以用户确认的月光界面及小魅魔 Momo 效果图为视觉依据，通过内置 Image Gen 生成。

- `moonlight-room.png`：1672 × 941，独立空房间背景。
- `momo-moonlight.png`：1254 × 1254，带真实 alpha 的清醒角色。
- `momo-moonlight-sleep.png`：1254 × 1254，与清醒版相同构图的闭眼角色。生成器将透明棋盘格烘焙为 RGB，因此运行时在 CSS 中使用清醒版的真实 alpha 作为遮罩；不能脱离此遮罩直接展示该图片。清醒/睡眠图片及遮罩采用相同的 contain、center bottom 设置。
- `icons/`：Phosphor Icons Core 2.1.1 的原始 duotone SVG，MIT 许可见 `icons/LICENSE`。图标经本地静态服务读取，运行时不请求第三方 CDN。来源：https://www.npmjs.com/package/@phosphor-icons/core 。

经典版继续使用原始 SVG 角色。新版仅组合上述图片与现有装扮和反馈层，按钮、状态、表单、聊天和日记均为真实 DOM。
