# BCM Developer Test: Answers

Code lives in `q1-php/`, `q4-css/`, `q5-q6-html-js/`, `q9-api/`. Check output is in `evidence/`. See `README.md` for setup and the AI-use note.

---

## 1. PHP

Corrected files: `q1-php/search-template.php`, `q1-php/ads.php`. Tests: `q1-php/tests/run.php` (output in `evidence/q1-php-test-output.txt`, 24 checks pass).

### Errors and their effects

| # | Error | Effect |
|---|-------|--------|
| 1 | No opening `<?php`; `WP_Query([...])` without `new` | Fatal error (call to undefined function). |
| 2 | `'page'` is not the WP_Query pagination argument (`paged` is) | Page 2 shows the same 10 posts as page 1. |
| 3 | `$_GET['page']` used raw (string, unvalidated) | `?page=abc`, `0`, `-3` or `page[]=x` give bad queries or type errors. |
| 4 | `$_GET['s']` read without `??` | PHP 8 warning "Undefined array key" when `s` is missing. `esc_html(null)` is also deprecated. |
| 5 | `$pages` never defined | Warning, and the heading shows "of ". Should come from `$q->max_num_pages`. |
| 6 | `<h1>` never closed | Following markup is inside the heading. |
| 7 | Regex `#[ad]#` has no backslashes | `[ad]` is a character class, so it matches every single letter `a` and `d` in the post. The text is mangled. |
| 8 | `preg_replace_callback` has no subject argument | The call has too few arguments and throws an `ArgumentCountError` in PHP 8. |
| 9 | Callback uses `$m` but declares no parameter, has no capture group, and `echo`es instead of `return`ing | `$m` is undefined. The div is printed at the top of the page and the match is replaced with an empty string. |
| 10 | `esc_html(the_title())` | `the_title()` echoes and returns null, so the title is printed unescaped and the heading is empty. Use `esc_html(get_the_title())`. |
| 11 | `get_the_content()` used without the `the_content` filters | No paragraphs, shortcodes or embeds. Replacing after the filter also lets us handle `<p>[ad]</p>`. |
| 12 | Content wrapped in an extra `<p>` | Nested paragraphs (invalid HTML). |
| 13 | No no-results branch, no pagination links, no `wp_reset_postdata()` | Blank page on empty search, no way to reach page 2, and the global `$post` is left changed. |

### Assumptions about the ad placeholders

- The marker is the exact, case-sensitive text `[ad]`.
- Each marker becomes `<div class="ad ad-N" data-ad-slot="N"></div>`, with N counted across the whole page so ids are unique. The brief says a JS handler fills it, so the div stays empty.
- Replacement runs after the `the_content` filters. A marker alone in its paragraph replaces the whole `<p>`, because a `div` inside a `p` is invalid.
- A marker inside running text still becomes a div, as asked, and the browser then splits the paragraph. Editors should put `[ad]` on its own line.
- An empty `s` lists the latest posts. A `page` past the last page shows an empty list with the correct "of N" count. A real theme might redirect instead.

### Checks shown (`evidence/q1-php-test-output.txt`)

Missing parameters (no warnings, "Page 1 of 3", 10 posts), page 2 (posts 11-20, `paged=2`), junk page values (`0`, `-5`, `abc`, array), no results (message, "Page 1 of 1"), XSS in `s`, and three `[ad]` markers in one post (3 divs, ids 1-3, no literal `[ad]` left). The tests turn any PHP warning into a failure. They run on PHP 8.3 with small WordPress stubs, because WordPress itself was not installed.

---

## 2. Editor cannot upload images

Likely causes, in the order I would check them (cheapest and most likely first):

1. **Role or capability.** The editor lacks `upload_files`, often through a customised role or a role-manager plugin.
   - Evidence: Users > the editor shows the role. Compare with the colleague. `wp user list-caps` or `wp cap list editor` (WP-CLI) shows whether `upload_files` is missing. The Media menu is also absent.
   - Fix: restore the capability on the role. Do not make the person an admin.
2. **Account-specific problem.** Stale session or cookies, an expired login, or a different browser or extension.
   - Evidence: the editor reproduces it in a private window, and the colleague can upload from the editor's machine while logged in as themselves.
   - Fix: log out and in, clear cookies, disable the extension.
3. **File problem.** Type or size is blocked (`upload_max_filesize`, `post_max_size`, mime restrictions, WebP or HEIC not allowed), or the editor is uploading a different kind of file than the colleague.
   - Evidence: the exact message ("exceeds the maximum upload size", "Sorry, you are not allowed to upload this file type"). Try the colleague's file as the editor and the editor's file as the colleague.
   - Fix: convert or resize the file, or raise the limits (host config) or allow the type if it is genuinely needed.
4. **Security layer.** A WAF or security plugin blocks the editor's IP or role, or the editor is rate limited.
   - Evidence: a 403 on `async-upload.php` or `/wp-json/wp/v2/media` in the browser Network tab, and entries in the security plugin log.
   - Fix: allowlist or correct the rule.
5. **Server-side.** Uploads folder permissions, disk full, or an image library (GD or Imagick) failure.
   - Evidence: PHP error log, "Unable to create directory", failure that affects the colleague too on some files.
   - Fix: permissions, disk space, library.

First step before all of this: ask for the exact error text and a screenshot, and reproduce it myself.

**Judgment:** the cheapest check first (role and capability) because it needs no access to the server and changes nothing. I would not raise upload limits or loosen file types as a first move: that widens the attack surface for one person's problem. I would also fix the root cause, not just upload the file for the editor, because the same gap will hit the next editor.

---

## 3. Slow article page on mobile

I would first measure with PageSpeed Insights or CrUX (real-user data) and a throttled WebPageTest or Lighthouse run on mobile, then work on the biggest cost.

1. **Images (hero and in-article).** Measure LCP element and its size, and whether it is lazy-loaded wrongly. Improve by serving responsive `srcset` and `sizes`, modern formats (WebP or AVIF), correct width and height, `fetchpriority="high"` on the hero, and lazy loading below the fold.
2. **Third-party scripts (ads, analytics, widgets).** Measure Total Blocking Time and the requests list, grouped by domain. Improve with `defer` or `async`, loading ad and analytics code after the main content, and removing unused tags.
3. **Page caching and server response.** Measure TTFB for logged-out users, cache hit ratio and uncached TTFB. Improve with full-page caching at the CDN or host, and `Cache-Control` headers.

Verifying one change (images):

- Compare before and after on the same URLs: LCP, CLS and page weight from Lighthouse, then CrUX over the following weeks.
- **Ads:** check ad slots keep their reserved size (no new CLS), ads still load and viewability or ad requests in the ad dashboard do not drop.
- **Analytics:** confirm pageviews and events still fire in the real-time view and the network tab. Compare daily page-view totals to the previous week.
- **Signed-in behaviour:** log in as an editor and a reader, and check the admin bar, previews, comments and paywalls or personalised blocks still work. Cached pages must not be served to logged-in users.
- Roll out to a few articles first, and keep the old setting ready to switch back.

**Judgment:** I would start with images, because on most publishing sites the hero image is the LCP element and the fix is low risk and easy to undo. I would delay touching the ad and analytics scripts: they carry revenue and reporting risk, so they need a staged test, not a quick win. I would not add a new caching plugin until I know whether caching is already in place, because stacking cache layers is a common cause of the stale-content bugs in Q7.

---

## 4. CSS layout

Files: `q4-css/index.html`, `q4-css/style.css`. Screenshots: `q4-css/screenshot-desktop.png`, `q4-css/screenshot-mobile.png`. Long-heading screenshots: `q4-css/screenshot-desktop-long-heading.png`, `q4-css/screenshot-mobile-long-heading.png`. Check output: `evidence/q4-check-output.txt` (it measures positions in a real browser).

- One HTML file, one CSS file, no JavaScript, each section appears once.
- **Breakpoint: 600px**, mobile first. Below it, one column. At or above it, a 3-column grid with `grid-template-areas` (`a a b / c d e / f g h`), so A spans two columns.
- E, F, H are `display: none` on mobile. This removes them from the accessibility tree too, so they are not read or focused.
- **Long heading:** `minmax(0, 1fr)` columns and `overflow-wrap: anywhere` on the headings. I tested a 136-character unbroken word and a long phrase: no horizontal scroll at 375px or 1000px.

**HTML order and accessibility.** Keyboard focus and screen readers follow the HTML order, not the visual order. I wrote the HTML in the mobile order (A, D, B, C, then the hidden E, F, H, then G last visible) and used grid placement on desktop. Reason: phones are where screen-reader swipe navigation depends on source order most, and on mobile visual order equals reading order. The cost is that on desktop the reading order (A, D, B, C ...) does not match the visual layout (A, B / C, D, E). These sections hold plain headings, so there are no tab stops to mismatch. If the cells contained links or buttons, I would move to desktop DOM order (A to H) and use `order` on mobile, or accept a small mismatch and document it, and I would not use `order` without checking the tab sequence.

---

## 5. HTML

Corrected file: `q5-q6-html-js/index.html`. Validation: `evidence/html-validation-corrected.txt` (empty = no errors or warnings from the Nu HTML Checker v.Nu, `vnu.jar`). The original fails; see `evidence/html-validation-original-detail.txt`.

### Actual HTML5 validity errors (the validator reports these)

1. No doctype.
2. `</html>` closed right after `</head>`, so `<body>` came after the end of the document.
3. `<abbr name="...">`: `name` is not allowed on `abbr`. Use `title`.
4. `<img with=300 height=auto>`: `with` is a typo, not an attribute. `height` must be a number.
5. `<img>` without `alt`.
6. `<code><b>...</code></b>`: elements closed in the wrong order.

Not errors, though they look suspicious: `href=https://www.bigcabal.com` unquoted (legal because the value has no spaces or quotes), and `</a >` (whitespace before `>` is legal in an end tag).

### Accessibility and style improvements (valid but better)

- `lang="en"` on `<html>`.
- Meaningful `alt` text. The image stays inline in the text, so I gave it a description.
- Quoted all attribute values. Removed the stray leading and trailing spaces inside the link text. `<button type="button">`.
- `<b>` inside `<code>` replaced by `<strong>` because the intent is importance, not bold styling.
- `<main>` and `<article>` landmarks.
- `width` and `height` on the image to stop layout shift. Image is 600x300, shown at 300x150.

### HTML-only improvements for search discoverability or interpretation

1. **`<title>` and `<meta name="description">`.** The title was just "Example". A descriptive title and summary are what search results show.
2. **`<link rel="canonical">` plus `og:` tags.** Canonical tells search engines which URL is the main one; Open Graph tags control the title and image in social shares. (Domain `bigcabal.com` is assumed from the link in the sample.)
3. **JSON-LD `Article` data.** Tells search engines this is an article, its headline and image, with no visible change.
4. **`<abbr title>`.** Gives the abbreviation an expansion for readers and assistive tech.
5. **Descriptive link text, `alt` text, and `lang`.** Help interpretation by search engines and screen readers.

---

## 6. JavaScript

Files: `q5-q6-html-js/script.js` (uses `index.html`). Check script: `tools/check-q6.mjs`, output `evidence/q6-check-output.txt`, final state screenshot `evidence/q6-final-state.png`.

How it works:

- At load, the three original paragraphs are cloned and kept as templates.
- Each click appends clones of the templates in a Fisher-Yates shuffled order, then rebuilds all separators from scratch. That removes every `<hr>` and re-inserts one after each even-numbered paragraph that is not last. All `<p>` elements count, hidden or not.
- The second button is created by JS only. It flips one `imagesHidden` flag and sets the `hidden` property on paragraphs containing an image. New clones check the flag before they are appended, so new image paragraphs stay hidden. The button has `aria-pressed` and a changing label.

How I checked (real Chromium, scripted):

- Load: P1 P2 HR P3. After each of clicks 1, 2, 3, and then 20 more: paragraph count is a multiple of 3, the pattern is `p p H p p H ...`, no `<hr>` first, last or doubled.
- Each batch of 3 is a permutation of the originals; across 20 batches 6 distinct orders appeared (shuffle is real).
- Toggle hide, check all image paragraphs hidden, add 2 more batches (72 to 78 paragraphs): new image paragraphs are hidden, separator pattern unchanged (hidden ones are counted). Toggle show: all visible, old and new. Add again: new ones visible.
- No console errors.

---

## 7. Old article version after a theme release

**Assumptions** (not yet confirmed): there is a page cache or CDN in front of WordPress; the release did not change the article's content; "corrected" means the editor updated the post.

**First three checks**

1. **Compare what two readers actually get.** `curl -sI` the URL (and with a cache-busting query string) and compare `Age`, `Cache-Control`, `X-Cache` or `CF-Cache-Status`, `Last-Modified` or `ETag`, and the response body for the correction text. Different `Age` or body hashes by region or node points to cache.
2. **Is the correction really saved and live at the origin?** Check the post revision history and "modified" date, and fetch the page from the origin directly (bypassing CDN) or logged in. If the origin shows the old text, it is a content or publishing problem.
3. **What did the release change?** Check the release diff for cache-key or cache-header changes, a new asset version, and a server-side fragment or object cache. Check that the old copy is not coming from a different template or a stale transient.

**Caching vs code or content**

- Origin correct, some edge responses wrong, `Age` large: caching. Purging the URL fixes it.
- Origin wrong: content (unsaved or reverted revision, wrong post or language) or code (template reads an old field).
- Old text only in some browsers or devices, not by region: browser cache or service worker. Hard refresh fixes it.
- A new release is not the first fix: it would not purge a cache by itself and adds risk.

**Roll back when** the origin shows wrong or broken output attributable to the release (not just stale copies), or errors rise after release, or a purge does not clear it and the cause is in the release. Otherwise purge the URL (and related archive pages) first.

**Verify recovery:** fetch the URL from several locations and a mobile network, check headers show a fresh `Age` and the right body, check the error logs and ad or analytics requests still fire, and ask the original reporters to confirm.

**Update to the editor:** "Some readers are seeing the older cached copy of the article, and we're checking whether the cache or the release is the cause. A new release isn't needed yet, so we're clearing the cache for that page first and will confirm here once everyone sees the correction."

**Judgment:** I would purge one URL, not the whole cache, and I would not ship another release just to "force" fresh content. A release adds risk and may not even clear the edge cache. Roll back only on evidence that the release caused it. The update to the editor says what we know, what we are doing, and what we do not yet know, instead of promising a cause.

---

## 8. Editors copying titles, links and images

**Ask or observe first:** sit with one editor for 20 minutes and watch a real publish. Note which tools the items are copied into (social scheduler, newsletter, chat?), which fields, how often it goes wrong, and which mistake costs most (wrong link? old image? truncated title?).

**Simpler alternative (little or no code):** a shared checklist or template in each target tool, plus WordPress's built-in "Copy link" and the featured-image URL shown in the post sidebar. Also set the SEO or Open Graph title so the social tools pull title and image automatically from the link preview. Possibly no copying is needed at all.

**Smallest useful improvement (one day):** a small "Share kit" panel on the post edit screen (a plugin or `add_meta_box`) that shows the title, the permalink with UTM tags, and the featured image URL with one-click copy buttons and the alt text, all read from the post. A "copy all" button produces a text block in the format the editor's tools need.

**Why this one:** it removes retyping, so copy errors disappear. It is read-only, small enough for one day, and does not change publishing.

**Editorial control stays:** editors write the title, choose image and link, and decide what is posted where. The panel only reads saved values and nothing is published automatically. If the title in a tool needs to differ, they edit after pasting.

**Test with one editor:** give them the panel for a day of real articles, observe a publish, and ask what is missing. Compare time per article and errors found by them before and after.

**Success:** time to prepare an article's items drops (for example by half), no copy errors in a week, the editor keeps using it unprompted, and they have no new complaints.

**Personal example (100 words max):**
> At Hordanso we resell domains through WHMCS (PHP, MariaDB). Its default order forms and client area looked like every other WHMCS site and were hard to customise. I rebuilt the order forms and client area as Smarty templates, with custom CSS and PHP, and optimised their performance. Pages loaded faster, and the platform now looks distinctly like our brand instead of a stock install. I learned that customisation works best when design and performance are handled together: a branded page that loads slowly still loses customers.

**Judgment:** I would try the no-code option first and build the panel only if the editor confirms the copying is the real cost. I would not build automatic posting to the other tools in one day: it takes publishing decisions away from editors and has far more failure modes. Smallest version first, measured with one person, then decide.

---

## 9. Newsletter signup with timeouts

Code: `q9-api/signup.js`. Tests: `q9-api/signup.test.js` (8 tests, `node --test`, output in `evidence/q9-test-output.txt`).

How `subscribe(email, ...)` behaves:

- **Invalid email:** checked locally first. It is never sent and nothing is stored. A 400 or 422 from the service is a permanent failure and is not retried.
- **Timeout:** the outcome is unknown, not failed. It looks the subscriber up first (`find`), and if found, returns success. If not found, it retries with the same idempotency key, so the service replays instead of creating a second record.
- **Rate limit (429):** waits for `Retry-After` (falls back to exponential backoff), then retries, up to `maxAttempts`.
- **Gives up:** the signup stays `pending` in the store, for a background retry. It is never dropped.
- A 409 or a replayed 200 counts as success ("already subscribed").

**Store:** a key derived from the normalised email (same email gives the same key), status (`pending`, `done`, `rejected`), attempt count, timestamp, and the email itself, because a retry needs it. It is written before the first request, so a crash cannot lose the signup.

**Log:** event name, key (a hash), attempt number, HTTP status, wait time. **Never log:** the raw email (there is a test for that), API keys or tokens, full request or response bodies.

**Testing a retry after the service already accepted:** the mock accepts and records the subscriber, then throws a timeout. Tests: (a) lookup finds it, one record; (b) lookup is down, so the retry with the same key gets a 200 replay, still one record. Also double-submit gives one request and one record.

**Judgment and limits:** I chose "look up, then retry with the same key" because it is safe whether or not the service supports idempotency keys. Trade-off: one extra lookup call on the rare timeout path, which is cheap compared with a duplicate subscriber. I rejected "retry blindly" (duplicates) and "never retry" (lost signups). Local email validation is deliberately loose: the service owns the real rules, and a strict regex rejects valid addresses. The store here is an in-memory Map for the demo; in production it must be durable (database or queue), with a background job that retries `pending` rows. That job is not built here.

---

## 10. Endpoint that updates an article's status

**The claim is wrong.** Hiding a button is a UI choice, not access control. Anyone can send the request directly (curl, browser console, a stolen or logged-in lower-privilege session, a malicious page for a logged-in editor). The server must enforce every rule.

**Required server-side checks, in order**

```
handler(request):
  1. authenticate           if not logged in               -> 401
  2. verify nonce / CSRF    if wp_verify_nonce fails       -> 403   (REST: X-WP-Nonce with cookie auth)
  3. validate input         id = absint(id); status in allowlist (draft, pending, publish, ...)
                            else                           -> 400
  4. load the post          get_post(id); if missing or wrong post_type -> 404
  5. authorise for THIS post
        current_user_can('edit_post', id)       (object-level, not just a role name)
        and, if status == 'publish': current_user_can('publish_posts' / get_post_type_object->cap->publish_posts)
        and, if the post is private / belongs to someone else: the matching cap
        else                                                -> 403
  6. check the transition is allowed (e.g. no un-trashing or publishing from a locked state)
  7. update with wp_update_post(['ID'=>id,'post_status'=>status]) and check for WP_Error
  8. return the new state; log who changed what (user id, post id, old, new)
```

In a REST route, `permission_callback` does steps 1, 2 and 5 and is never `__return_true`. Arguments use `validate_callback` and `sanitize_callback`.

**Two tests that must be rejected**

1. A logged-in user with the **Subscriber** or **Contributor** role posts `{id: 123, status: "publish"}` directly (no button involved). Expected: 403 and the post unchanged.
2. A valid editor session sends the request **without a valid nonce** (as a cross-site form would), or with `status: "banana"`. Expected: 403 for the nonce, 400 for the unknown status, and the post unchanged. A third useful one: an author editing someone else's post must be 403.

**Raising it with the developer:** start from the shared goal and be specific and neutral: "The button is hidden for non-editors, which is good UX, but the endpoint itself can be called directly, so I'd like to check it enforces the permission. Here is a curl request as a contributor that changes a post. Can we add a capability check and a nonce?" Share the repro and the fix as a pair, offer to pair on it, and agree on a test that stays.

**Must be fixed before release:** authentication and nonce, a capability check against the specific post (`edit_post`, plus the publish capability for publish), an allowlist for status, sanitised ID, tests for the rejected cases, and an audit log entry. Hiding the button stays as a UX nicety only.

**Judgment:** this is a vulnerability, so it blocks release, and I would say so plainly but without blame. Hiding the button is fine as UX and I would keep it. The fix is small (a few lines in `permission_callback`), so the conversation should be about adding a test that stays, not about the person. I would also ask for a quick look at the developer's other endpoints for the same pattern, since one missing check often means more.
