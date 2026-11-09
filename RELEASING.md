# 发布流程（Trusted Publishing / OIDC）

本项目通过 GitHub Actions 的 **npm Trusted Publishing（OIDC）** 发布，不需要长期 `NPM_TOKEN`。

## 1. 前置条件

- npm 包已存在：`vitepress-plugin-filelist`
- npm 包 **Settings → Trusted Publisher** 已配置：

  ```text
  Provider:    GitHub
  Owner:       nrjycyd
  Repository:  vitepress-plugin-filelist
  Workflow:    release.yml
  Environment: 留空
  ```

- Trusted Publisher 的 **Allowed actions** 勾选 **npm publish**（只勾 stage 不够）
- GitHub 仓库为 public（provenance 需要）
- 仓库 **Settings → Secrets** 中不需要 `NPM_TOKEN`
- npm Publishing access 可以是 strict 2FA，OIDC 不受影响

## 2. 发布步骤

```bash
# 1. 确认在 main 且工作区干净
git status
git pull --ff-only

# 2. 升版本（会同时更新 package-lock.json）
npm version 0.2.0 --no-git-tag-version

# 3. 本地验证
npm ci
npm run build
npm run typecheck
npm test

# 4. 提交版本号
git add package.json package-lock.json
git commit -m "chore: release v0.2.0"

# 5. 推 main
git push origin main

# 6. 打 tag 并推送（触发 Release）
git tag v0.2.0
git push origin v0.2.0
```

> tag 必须是 `v*` 形式，`release.yml` 只监听 `push tags: v*`。

## 3. Release workflow 做什么

`.github/workflows/release.yml`：

1. `actions/checkout`
2. `actions/setup-node`（Node 22，`registry-url: https://registry.npmjs.org`）
3. `npm install -g npm@latest`（OIDC 需要 npm ≥ 11.5.1）
4. `npm ci`
5. `npm run build`
6. `npm run typecheck`
7. `npm test`
8. `npm publish --provenance --access public`
   - 通过 `id-token: write` 获取 OIDC 短期凭证
   - 不使用任何 `NODE_AUTH_TOKEN`
9. `softprops/action-gh-release` 创建 GitHub Release

关键权限：

```yaml
permissions:
  contents: write
  id-token: write
```

## 4. 发布后验证

```bash
# 版本与 latest
npm view vitepress-plugin-filelist version
npm view vitepress-plugin-filelist dist-tags

# 指定版本
npm view vitepress-plugin-filelist@0.2.0 version
```

npm 会提示：

```text
Your package is being processed and may take a few minutes to become available.
```

通常 30 秒～2 分钟后才能在 registry 查到；刚发布时 404 属于正常现象，稍等再查。

同时确认：

- GitHub Actions 的 `Release` run 成功
- `Publish to npm (OIDC)` 步骤日志里有 `Signed provenance statement`
- GitHub Releases 页面出现对应 tag

## 5. 常见问题

### 5.1 npm 上只有 `0.0.0-stage`

这是 npm 为发布/暂存流程创建的内部占位包，不是可安装版本。真实版本处理完成后会出现，`latest` 会指向真实版本。不要在 `npm stage list` 里找它。

### 5.2 workflow 成功但 npm 没有新版本

按顺序检查：

1. workflow 日志 `Publish to npm (OIDC)` 是否真的输出了 `+ vitepress-plugin-filelist@x.y.z`
2. 是否只是 npm 处理延迟（等 1～2 分钟再查）
3. Trusted Publisher 的 Workflow filename 是否精确为 `release.yml`
4. Allowed actions 是否勾了 **npm publish**
5. Environment 是否为空且 workflow 没有声明 environment
6. tag 是否指向包含新版本号的 commit：

   ```bash
   git show v0.2.0:package.json
   ```

### 5.3 发布报 401 / 403

- 确认 workflow 有 `id-token: write`
- 确认没有残留的 `NODE_AUTH_TOKEN` / `.npmrc` token 覆盖 OIDC
- 确认 npm 包 Trusted Publisher 仍为 **Valid**
- 确认发布账号对包有写权限

### 5.4 版本已存在

npm 不允许重复发布同一个版本。若 `0.2.0` 已存在：

- 升到 `0.2.1` 重新走流程
- 不要删除或复用已发布版本号

## 6. 版本规范

- 修复：`0.1.x`
- 新功能：`0.x.0`
- 破坏性变更：升 minor（0.x）并在 README/CHANGELOG 说明
- 预发布：`0.2.0-beta.1`，需要显式 `--tag beta`

## 7. 回滚与弃用

- 不推荐 `npm unpublish`（有限制且影响用户）
- 推荐 `npm deprecate vitepress-plugin-filelist@x.y.z "reason"` 标记问题版本
- 修复后发布新 patch，并把 `latest` 指回新版本

## 8. 检查清单

- [ ] `main` 干净且已同步
- [ ] 版本号已升，`package-lock.json` 同步
- [ ] build / typecheck / test 通过
- [ ] 提交并推送 `main`
- [ ] tag `vX.Y.Z` 已推送
- [ ] `Release` run 成功
- [ ] npm 上能查到新版本，`latest` 正确
- [ ] GitHub Release 已生成
- [ ] demo 页面（如受影响）仍正常
