# FAQ

## The list says “Failed to fetch” or fails to load

Usually CORS: check that OpenList's `cors.allow_origins`, or OpenList-Worker's `ALLOW_URLS`, includes your docs site's origin; an HTTPS page also cannot call an HTTP OpenList. See [Connect OpenList](./openlist).

## An error mentions guest

OpenList's guest user is not enabled. Enable guest in the admin and set its base path; you can also pass a read-only `token`, but it is public to readers, see [Security](./security).

## I turned off every guest permission. Why can readers still preview and download?

Browsing, preview and download are not permissions that can be turned off; they come with guest being enabled. Limit what is visible with guest's base path and protect sub-folders with folder passwords. See [Connect OpenList](./openlist).

## Why doesn't a refresh show the new files on my drive?

Refresh re-reads OpenList's folder cache. Guests have no write access and cannot make OpenList rescan the storage; wait for OpenList's cache to expire, or refresh it in the admin.

## Why doesn't “select all” in the header tick files in folders I haven't opened?

The header check box only counts loaded files. Ticking a folder loads and ticks everything under it (deep or large folders are read one by one, which can take a while).

## A text file or PDF says it cannot be previewed in the page

Reading text and showing PDFs in the browser need the file address to allow CORS: through OpenList's proxy (`/p/`) that is OpenList's CORS setting; for direct storage links it is up to the storage. Downloading still works.

## Zipping a very large folder fails

Firefox, Safari and phone browsers hold the files in memory before zipping and suggest smaller batches above the limit; Chrome and Edge write to disk while downloading, with no size limit. See [Batch download](../features/zip).
