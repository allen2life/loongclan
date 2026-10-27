# 龙族通用技术规范：多语言与界面国际化规范 (SPEC_I18N)

**版本**：v1.0.0  
**核心铁律**：旗下所有应用的 UI 必须支持多语言，且**默认语言一律为英语 (English Default)**。

---

## 1. 设计初衷与战略意义

中国传统文化是全人类共同的精神财富。龙族（loongclan.xyz）致力于让华夏文化走向世界。为了消除语言门槛与排他感：
- **默认语言必须为英语 (Default: English)**：无论用户身在何处、首次打开任何应用，最外层的交互界面、规则指引与操作按钮一律以英语呈现。
- **无缝即时切换中文 (Instant Switch)**：在界面显眼处（通常为右上角或设置面板）提供一键切换至中文（简体中文 `zh-Hans` / 繁体中文 `zh-Hant`）的能力。
- **UI 框架与文化内核解耦**：
  - **交互框架 (Chrome UI)**：包括菜单、设置、同步弹窗、排行榜表头、提示信息（Toast）、系统按钮等，全部纳入 i18n 资源包管理，默认显示英文；
  - **文化实体 (Cultural Core)**：例如象棋字样（车马炮）、古诗文句、书法汉字等保留其原汁原味的中国美学表现，辅以英文题注、释义或拼音。

---

## 2. 语言状态与持久化规范

### 2.1 本地存储键
客户端在启动时按以下顺序决定初始语言：
1. 本地存储 `localStorage.getItem('loong_locale')`（若用户此前曾手动切换过）；
2. 若本地无记录，**无条件回退并默认设置为 `'en'`**（不跟随浏览器系统语言默认变更为中文，确保铁律一致性）。

```typescript
export type SupportedLocale = 'en' | 'zh-Hans';

export function getInitialLocale(): SupportedLocale {
  const saved = localStorage.getItem('loong_locale');
  if (saved === 'zh-Hans' || saved === 'zh') {
    return 'zh-Hans';
  }
  // 铁律：默认一律为英语
  return 'en';
}

export function setLocale(locale: SupportedLocale): void {
  localStorage.setItem('loong_locale', locale);
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-Hans';
}
```

### 2.2 多端同步契约
在调用 `LoongSyncClient.uploadSnapshot` 时，用户的语言偏好应当打包在 `payload.preferences.language` 中：
```json
{
  "preferences": {
    "language": "en",
    "soundEnabled": true
  }
}
```
当用户换设备同步后，可自动恢复其习惯的语言偏好。

---

## 3. 服务端错误码多语言映射

服务端 API 返回的统一响应结构中，始终携带机器可读的 `err_code`，以便前端客户端根据当前语言进行本地化翻译显示，禁止直接将服务端硬编码的提示文本直接暴露给用户。

### 3.1 核心通用错误码对照表

| `err_code` | 英文展示 (Default / `en`) | 中文展示 (`zh-Hans`) |
| :--- | :--- | :--- |
| `kouling_format` | Invalid passphrase format (requires 3 parts). | 口令格式有误（需为3段，每段1-8字符）。 |
| `hash_mismatch` | User identity does not match passphrase. | 用户身份标识与口令不匹配。 |
| `token_mismatch` | Authentication token does not match cloud record. | 私密鉴权密文与已绑定的云端记录不一致。 |
| `kouling_mismatch`| Passphrase does not match existing record. | 口令与已绑定的云端记录不一致。 |
| `version_conflict`| Cloud snapshot is newer. Please download and merge.| 云端版本更新，请先拉取并合并。 |
| `no_snapshot` | No cloud snapshot found for this passphrase. | 云端暂无此口令的历史快照。 |
| `user_banned` | This account has been restricted by moderator. | 该账号已被管理员限制。 |
| `bad_request` | Invalid request parameters. | 请求参数错误。 |
| `unauthorized` | Authentication required. | 未授权或访问令牌无效。 |

### 3.2 客户端国际化字典示例
```typescript
export const I18N_STRINGS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    'btn.play': 'Play Now',
    'btn.sync': 'Cloud Sync',
    'btn.upload': 'Upload to Cloud',
    'btn.download': 'Download from Cloud',
    'btn.copy': 'Copy',
    'err.kouling_format': 'Invalid passphrase format (must be 3 parts).',
    'err.version_conflict': 'Server version is newer. Please download first.',
    'rank.title': 'Leaderboard',
    'rank.my_rank': 'My Rank',
  },
  'zh-Hans': {
    'btn.play': '开始游戏',
    'btn.sync': '云端同步',
    'btn.upload': '上传至云端',
    'btn.download': '从云端下载',
    'btn.copy': '复制',
    'err.kouling_format': '口令格式有误（必须为3段，每段1-8字符）。',
    'err.version_conflict': '云端版本更新，请先下载合并。',
    'rank.title': '排行榜',
    'rank.my_rank': '我的排名',
  }
};
```
