# Security

A docs site is a public static page, and the component talks to OpenList from the reader's browser. So **everything written in Markdown is visible to every reader**.

## What is public

| Written on the page | Readers can see it | Why |
| --- | --- | --- |
| `base`, `path`, `sources` | Yes | The OpenList address and folders have to be public anyway |
| `token` | **Yes** | Copied as is into the built scripts, and sent in every request's `Authorization` header |
| `password`, `sources[].password` | **Yes** | Copied as is into the built scripts, and sent to OpenList with requests |
| A folder password a reader types | No | Used only in that reader's browser |

Injecting `token` or `password` at build time from GitHub Actions secrets only keeps them out of the repository; the built site still contains them.

::: tip A reminder while you write
Under `vitepress dev`, a page whose `<FileList>` sets `token` or `password` logs one warning in the browser console that it will be public. `vitepress build` stays silent.
:::

## Recommended setup

1. **Use guest with a base path.** Enable `guest` in the OpenList admin, set its base path to the folder you publish and turn off its write permissions. This is what really limits access; see [Connect OpenList](./openlist#_1-enable-guest-and-limit-its-base-path).
2. **Protect sub-folders with OpenList folder passwords, and keep the passwords out of the page.** Without `password`, readers type it in the folder's row when they open it.
3. **Hide files** with OpenList's meta rules.

## When the `password` prop is fine

`password` is public, so it only keeps people from wandering in: for example when the password is already printed on the slides or posted in the class group and you just don't want readers to type it again. For folders that must stay private, don't write the password on the page.

## When the `token` prop is fine

Guest is enough for most sites. If you do need `token`:

- use a revocable, read-only token of an ordinary user limited to the published folders, **never an admin token**
- OpenList login tokens expire after 48 hours by default (`token_expires_in`); after that the list fails to load
- if you think it leaked, change that user's password or delete the user in OpenList so the token stops working

## What the component does in the browser

- **Remembered passwords**: when a reader ticks “remember in this tab”, the password goes to `sessionStorage`, per OpenList address and folder, and is gone when the tab closes; `rememberPassword: false` removes the option
- **HTML previews** run in a sandboxed `iframe` without scripts; **Markdown previews** are cleaned by DOMPurify
- **Where it connects**: the OpenList at `base` and the file addresses it returns. External viewers set in OpenList's “iframe previews” (a PDF viewer, say) receive the address of the previewed file. CORS settings: [Connect OpenList](./openlist#_2-allow-cross-origin-requests-cors)

## Reporting a vulnerability

Please don't post exploitable details in a public issue. Report privately via **Security → Report a vulnerability** on the GitHub repository.
