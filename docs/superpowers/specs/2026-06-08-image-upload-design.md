# Design: File upload for editorjs-inline-image

Date: 2026-06-08
Status: Approved (superseded on upload timing — see Addendum)

> **Addendum (2026-06-08, post-testing):** The originally-approved **deferred**
> upload (hold base64 in the block, upload on post-confirm) was found in testing
> to be incompatible with gccwebsite's editor pages: they serialise the editor
> into a hidden field on every `onChange` and submit it **urlencoded**, which has
> a 100 kB body limit. Holding base64 in the block let it leak into that body and
> produced `413 request entity too large` on save. The implementation was changed
> to **upload immediately on select/drop** and store **only the returned server
> URL** in the block — base64 is never persisted. All other aspects of this design
> (drop zone + file dialog, the `/api/admin/media/add` JSON contract, the
> `uploadEndpoint` config) are unchanged.

## Goal

Add an option to upload a **new** image to the EditorJS Inline Image tool, via a
drop zone or a file dialog. The chosen image is previewed in the editor
immediately. The actual upload to the server is **deferred**: it happens only
when the post using the editor is confirmed (saved), using the existing
gccwebsite media upload endpoint.

## Scope

- **Primary:** `editorjs-inline-image` plugin (new upload tab, deferred upload in
  `save()`, config, README, tests).
- **Secondary:** `gccwebsite` `routes/media.js` — add a JSON response branch to
  the existing `POST /api/admin/media/add` handler so the plugin can recover the
  uploaded image's URL.

Out of scope: any change to the EditorJS init config in gccwebsite (the plugin
defaults to the correct endpoint); changes to other consumers of the plugin.

## Existing context

- The plugin is a customised fork. `ControlPanel` (`src/controlPanel.js`)
  currently renders a "Website Images" tab (search, backed by
  `src/imageClient.js` → `GET /api/media/searchdata`) and builds — but does not
  append — an "Embed URL" tab.
- Image selection flows through `onSelectImage(data)` →
  `Ui.selectImage(data)` → `onAddImageData(data)` (sets `InlineImage.data`) →
  `Ui.showLoader()`. Setting `data.url` updates `ui.nodes.image.src`, which on
  load triggers `Ui.onImageLoad()` to render the preview and remove the loader.
- `InlineImage.save()` (`src/index.js`) is currently synchronous and returns
  `this.data` with the caption refreshed from the DOM.
- `axios` is already a dependency (used by `imageClient.js`).
- gccwebsite endpoint `POST /api/admin/media/add` (`routes/media.js#save`) uses
  `multer` (`.single('filename')`), requires a non-empty `title`, stores the
  file base64 in the DB, serves media at `/media/<encoded filename>`, and
  **redirects to `/media`** on success — it does not return the resulting URL.
  Filenames are sanitised and a `-<timestamp>` suffix is appended on collision,
  so the final URL cannot be reliably predicted by the client.

## Design

### 1. Control panel — new "Upload" tab

In `src/controlPanel.js`:

- Add an "Upload" tab and panel alongside the existing tabs. Generalise the
  current two-state toggling (`showEmbedUrlPanel`/`showUnsplashPanel`) into a
  single `showPanel(name)` that sets the `active` class on the chosen tab and
  `hidden` on the other panels, reusing existing CSS class names.
- The Upload panel is a **drop zone** `div` plus a hidden
  `<input type="file" accept="image/*">`:
  - Click on the drop zone → opens the file dialog (`input.click()`).
  - `dragover` / `dragenter` → add an active highlight class; `dragleave` /
    `drop` → remove it.
  - `change` (dialog) and `drop` both funnel into a single
    `handleFile(file)` method.
- `handleFile(file)`:
  - Reject non-image files (guard on `file.type.startsWith('image/')`) with an
    `api.notifier` error.
  - Read the file to a base64 data-URL via `FileReader`.
  - Call `onSelectImage({ url: <base64 data-URL>, caption: file.name, file })`.

The preview then renders through the **existing** loader → `onImageLoad` flow
with no change to `ui.js`.

### 2. Transient file + deferred upload in `InlineImage`

In `src/index.js`:

- `addImageData(imageData)` already does `this.data = imageData`; the `file`
  field flows in via the spread in the `data` setter and is held on
  `this._data.file`. It is **transient**: excluded from `save()` output and from
  `sanitize`, so it is never serialised into block/post data.
- `save()` becomes **async**:
  1. Refresh caption from the DOM (as today).
  2. If `this.data.file` is set (a pending upload):
     - Build `FormData` with `filename` = the `File` and `title` =
       `this.data.caption` (falling back to `file.name`).
     - `POST` to the configured upload endpoint via `axios`, with header
       `X-Requested-With: XMLHttpRequest`; cookies are sent automatically
       (same-origin).
     - On success (`{ status: 'success', data: { url } }`): set
       `this.data.url = data.url`, then delete `this.data.file`.
     - On failure: show an `api.notifier` error and **fall back** to keeping the
       existing base64 data-URL in `this.data.url` (post still saves; image not
       lost). Still delete `this.data.file`.
  3. Return `this.data` **without** the `file` field.
- Because EditorJS awaits each block's `save()` promise when `editor.save()` is
  called (on post confirmation), the upload fires exactly at confirmation time.

### 3. Config

- New optional config value `uploadEndpoint`, default `'/api/admin/media/add'`,
  read in the constructor / passed to whatever performs the POST. With the
  default, gccwebsite needs no EditorJS init change.
- Document `uploadEndpoint` in `README.md` config table, and document the new
  Upload tab in the tool description.

### 4. gccwebsite backend — JSON branch in `media.save`

In `gccwebsite/routes/media.js#save`:

- Detect a JSON/XHR caller: `req.xhr` or
  `req.get('X-Requested-With') === 'XMLHttpRequest'`.
- For that path:
  - Make `title` optional — derive it from `req.file.originalname` (basename
    without extension) when absent.
  - On success, respond
    `res.status(200).json({ status: 'success', data: { url: '/media/' + encodeURIComponent(req.file.filename) }, message: 'Uploaded' })`.
  - On the existing error conditions (file too large, etc.), respond with a JSON
    error (`{ status: 'error', message }`) and an appropriate status code
    instead of `req.flash` + redirect.
- For the existing HTML-form path (no XHR header), behaviour is unchanged:
  `title` still required, redirects to `/media`.
- No route, permission, or CSP change: `add media` already authorises editor
  users, the request is same-origin (`connect-src 'self'`), and the route is
  already registered.

### 5. Build / deploy note

The plugin compiles to `dist/bundle.js` (`yarn build`); gccwebsite serves a copy
at `public/js/inlineimage/bundle.js`. After building the plugin, that copy must
be refreshed for the feature to go live. This will be flagged at completion (not
auto-committed across repos).

## Testing (TDD)

Plugin (Jest, existing `test/` + fixtures):

- Upload tab and drop zone render in the control panel.
- A non-image file is rejected with a notifier error and no `onSelectImage`.
- A valid image file produces a base64 data-URL preview via `onSelectImage`
  (FileReader mocked/stubbed) with `caption` and `file` set.
- `save()` with a pending `file` POSTs to the endpoint (axios mocked), swaps
  `data.url` to the returned URL, and omits `file` from output.
- `save()` upload failure keeps the base64 URL and emits a notifier error.
- `save()` with no pending `file` returns data unchanged (no POST).

Backend (gccwebsite Jest):

- A focused test for the JSON branch of `media.save` (XHR header → JSON `{ url }`
  response, title derived from filename when absent). multer/MediaService mocked.

## Risks / trade-offs

- **Base64 fallback on upload failure** bloats stored content if the endpoint is
  down, but avoids losing the user's image / failing the whole post save.
  Accepted.
- The transient `file` field must be carefully kept out of serialisation; covered
  by tests.
- Cross-repo change: plugin + gccwebsite must ship together (plus the bundle
  copy). Called out in the deploy note.
