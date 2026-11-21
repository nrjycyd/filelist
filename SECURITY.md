# Security Policy

## Supported Versions

Security fixes are released on the latest minor release line of `vitepress-plugin-filelist` and `vuepress-plugin-filelist` (both packages share the same version):

| Version | Supported |
| --- | --- |
| `0.15.x` (latest) | ✅ Yes |
| `< 0.15` | ❌ No |

## Threat Model & Known Design Boundaries

Because VitePress and VuePress build public static sites, `<FileList>` talks to OpenList directly from the visitor's browser. Please review the [Security & Permissions Guide](https://nrjycyd.github.io/filelist/en/guide/security) before filing a report:

- `token`, `password`, and `sources[].password` written in Markdown are **intentionally public** in the built bundle (a dev-only console warning reminds authors of this). Use an OpenList `guest` account restricted to a base path for public shares.
- Folder passwords typed by visitors are kept only in memory or in the current tab's `sessionStorage` when the visitor opts in (and can be disabled via `rememberPassword: false`).
- Rendered Markdown previews are sanitised with DOMPurify (after a runtime self-test probe); rendered HTML previews run inside an empty `<iframe sandbox="" referrerpolicy="no-referrer">`.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities privately through GitHub's private vulnerability reporting:

👉 **https://github.com/nrjycyd/filelist/security/advisories/new**

Please include:

- Affected package(s) and version (`vitepress-plugin-filelist` / `vuepress-plugin-filelist`)
- Steps to reproduce or a minimal proof of concept
- Expected impact and any suggested mitigation

You can expect an initial acknowledgement within **7 days**, followed by a coordinated fix and release once confirmed.
