# Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Upload" option (drop zone + file dialog) to the EditorJS Inline Image tool that previews a chosen image immediately and uploads it to gccwebsite's media endpoint only when the post is saved.

**Architecture:** A new "Upload" tab in `ControlPanel` reads the chosen file to a base64 data-URL via `FileReader` and feeds it through the existing `onSelectImage` preview flow, holding the raw `File` transiently on the tool's data. `InlineImage.save()` becomes async: if a pending `File` exists it `POST`s it (multipart) to the configured endpoint via `axios`, swaps in the returned server URL, and drops the `File` from the saved output. gccwebsite's `media.save` gains a JSON-response branch for XHR callers so the URL can be recovered.

**Tech Stack:** EditorJS tool (vanilla JS, Webpack), `axios`, Jest + `@testing-library/jest-dom` (jsdom); gccwebsite Express route, Jest.

---

## Baseline note

`cd editorjs-inline-image && yarn test` currently reports **8 pre-existing failures** in `test/controlPanel.test.js` and `test/ui.test.js` (fork drift: the tests still reference `UnsplashClient`/`embedUrlPanel`/old tab labels). These are NOT in scope. Do not fix or delete them. Success for this plan = new tests pass AND the 18 currently-passing tests stay green.

## File structure

Plugin (`editorjs-inline-image/`):
- `src/controlPanel.js` — add Upload tab, drop zone, hidden file input, `handleFile`, panel toggling.
- `src/index.js` — read `uploadEndpoint` config; async `save()`; `uploadFile()`.
- `src/index.css` — drop-zone styles.
- `README.md` — document the Upload tab and `uploadEndpoint` config.
- `test/controlPanel.test.js` — add an `upload` describe block.
- `test/upload.test.js` — new file: async `save()` / `uploadFile()` tests.
- `dist/bundle.js` — rebuilt artifact (committed).

gccwebsite (`gccwebsite/`):
- `routes/media.js` — JSON branch in `save`.
- `tests/unit/routes/media.test.js` — add JSON-branch tests.
- `public/js/inlineimage/bundle.js` — refreshed copy of the built plugin bundle.

---

## Task 1: ControlPanel — Upload tab, drop zone, and `handleFile`

**Files:**
- Modify: `editorjs-inline-image/src/controlPanel.js`
- Test: `editorjs-inline-image/test/controlPanel.test.js`

- [ ] **Step 1: Write the failing tests**

Add this `describe` block inside the top-level `describe('ControlPanel', ...)` in `test/controlPanel.test.js`, immediately after the `unsplash` describe block closes (before the final `});`):

```javascript
  describe('upload', () => {
    let uploadPanel;

    beforeEach(() => {
      uploadPanel = controlPanel.nodes.uploadPanel;
    });

    it('renders the upload panel with a drop zone and a hidden file input', () => {
      expect(uploadPanel).not.toBeEmptyDOMElement();
      expect(controlPanel.nodes.dropZone).not.toBeNull();
      expect(controlPanel.nodes.fileInput.type).toBe('file');
    });

    it('opens the file dialog when the drop zone is clicked', () => {
      const clickSpy = jest.spyOn(controlPanel.nodes.fileInput, 'click').mockImplementation();
      controlPanel.nodes.dropZone.click();
      expect(clickSpy).toHaveBeenCalled();
    });

    it('previews a chosen image as a base64 data-url via onSelectImage', async () => {
      const file = new File(['imgbytes'], 'pic.png', { type: 'image/png' });
      await controlPanel.handleFile(file);

      expect(onSelectImage).toHaveBeenCalledWith(expect.objectContaining({
        caption: 'pic.png',
        file,
        url: expect.stringContaining('data:'),
      }));
      expect(notify).not.toHaveBeenCalled();
    });

    it('rejects a non-image file with an error and does not select it', async () => {
      const file = new File(['text'], 'notes.txt', { type: 'text/plain' });
      await controlPanel.handleFile(file);

      expect(onSelectImage).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd editorjs-inline-image && yarn test test/controlPanel.test.js`
Expected: the 4 new `upload` tests FAIL (e.g. `controlPanel.nodes.uploadPanel` is `null`, `controlPanel.handleFile is not a function`). Pre-existing `embedUrl`/`unsplash` failures remain unchanged.

- [ ] **Step 3: Add the upload CSS class names to the constructor**

In `src/controlPanel.js`, inside the `this.cssClasses = { ... }` object literal, add these three keys (after the existing `scroll: 'scroll',` line, before the closing `};`):

```javascript
      uploadPanel: 'inline-image__upload-panel',
      dropZone: 'inline-image__upload-zone',
      dropZoneActive: 'inline-image__upload-zone--active',
```

- [ ] **Step 4: Register the new node keys**

In `src/controlPanel.js`, inside `this.nodes = { ... }`, add these keys (after `searchInput: null,`):

```javascript
      uploadTab: null,
      uploadPanel: null,
      dropZone: null,
      fileInput: null,
```

- [ ] **Step 5: Render the Upload tab and panel**

In `src/controlPanel.js`, replace the body of `render()` (the whole method) with:

```javascript
  render() {
    const wrapper = make('div', this.cssClasses.controlPanel);
    const tabWrapper = make('div', this.cssClasses.tabWrapper);
    const embedUrlTab = make('div', this.cssClasses.tab, {
      innerHTML: 'Embed URL',
      onclick: () => this.showEmbedUrlPanel(),
    });
    const unsplashTab = make('div', [this.cssClasses.tab, this.cssClasses.active], {
      innerHTML: 'Website Images',
      onclick: () => this.showUnsplashPanel(),
    });
    const uploadTab = make('div', this.cssClasses.tab, {
      innerHTML: 'Upload',
      onclick: () => this.showUploadPanel(),
    });

    const embedUrlPanel = this.renderEmbedUrlPanel();
    const unsplashPanel = this.renderUnsplashPanel();
    const uploadPanel = this.renderUploadPanel();

    tabWrapper.appendChild(unsplashTab);
    tabWrapper.appendChild(uploadTab);
    wrapper.appendChild(tabWrapper);
    wrapper.appendChild(unsplashPanel);
    wrapper.appendChild(uploadPanel);

    this.nodes.unsplashPanel = unsplashPanel;
    this.nodes.unsplashTab = unsplashTab;
    this.nodes.uploadPanel = uploadPanel;
    this.nodes.uploadTab = uploadTab;

    return wrapper;
  }
```

(`embedUrlTab` remains created-but-unappended exactly as before — do not change that pre-existing behaviour.)

- [ ] **Step 6: Implement panel toggling and the upload panel**

In `src/controlPanel.js`, replace the existing `showUnsplashPanel()` method with the version below, and add `showUploadPanel`, `renderUploadPanel`, and `handleFile` immediately after it:

```javascript
  showUnsplashPanel() {
    this.nodes.unsplashTab.classList.add(this.cssClasses.active);
    this.nodes.unsplashPanel.classList.remove(this.cssClasses.hidden);
    this.nodes.uploadTab.classList.remove(this.cssClasses.active);
    this.nodes.uploadPanel.classList.add(this.cssClasses.hidden);
  }

  showUploadPanel() {
    this.nodes.uploadTab.classList.add(this.cssClasses.active);
    this.nodes.uploadPanel.classList.remove(this.cssClasses.hidden);
    this.nodes.unsplashTab.classList.remove(this.cssClasses.active);
    this.nodes.unsplashPanel.classList.add(this.cssClasses.hidden);
  }

  renderUploadPanel() {
    const wrapper = make('div', [this.cssClasses.uploadPanel, this.cssClasses.hidden]);
    const dropZone = make('div', this.cssClasses.dropZone, {
      innerHTML: 'Drag an image here, or click to choose a file',
    });
    const fileInput = make('input', null, {
      type: 'file',
      accept: 'image/*',
      style: 'display: none;',
      onchange: (event) => {
        const [file] = event.target.files;
        if (file) {
          this.handleFile(file);
        }
      },
    });

    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = (event) => {
      event.preventDefault();
      dropZone.classList.add(this.cssClasses.dropZoneActive);
    };
    dropZone.ondragleave = () => dropZone.classList.remove(this.cssClasses.dropZoneActive);
    dropZone.ondrop = (event) => {
      event.preventDefault();
      dropZone.classList.remove(this.cssClasses.dropZoneActive);
      const [file] = event.dataTransfer.files;
      if (file) {
        this.handleFile(file);
      }
    };

    wrapper.appendChild(dropZone);
    wrapper.appendChild(fileInput);

    this.nodes.dropZone = dropZone;
    this.nodes.fileInput = fileInput;

    return wrapper;
  }

  handleFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
      this.api.notifier.show({
        message: 'Please choose an image file.',
        style: 'error',
      });
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        this.onSelectImage({
          url: event.target.result,
          caption: file.name,
          file,
        });
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd editorjs-inline-image && yarn test test/controlPanel.test.js`
Expected: the 4 new `upload` tests PASS. Pre-existing `embedUrl`/`unsplash` failures count is unchanged (still failing, not newly broken).

- [ ] **Step 8: Commit**

```bash
cd editorjs-inline-image
git add src/controlPanel.js test/controlPanel.test.js
git commit -m "feat: add Upload tab with drop zone and file dialog to control panel"
```

---

## Task 2: InlineImage — deferred upload in `save()`

**Files:**
- Modify: `editorjs-inline-image/src/index.js`
- Test: `editorjs-inline-image/test/upload.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `editorjs-inline-image/test/upload.test.js`:

```javascript
import axios from 'axios';
import InlineImage from '../src/index';
import createApi from './fixtures/editor';
import { config } from './fixtures/toolData';

jest.mock('axios');

const notify = jest.fn();

const BASE64 = 'data:image/png;base64,AAAA';

function buildTool(extraData = {}) {
  const tool = new InlineImage({
    data: {},
    api: createApi(notify),
    config,
  });
  // Real Ui has no rendered nodes; give save() a caption node to read.
  tool.ui.nodes.caption = document.createElement('div');
  tool.data = { url: BASE64, caption: 'cap', ...extraData };
  return tool;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('InlineImage deferred upload', () => {
  it('uploads a pending file on save and swaps in the returned url', async () => {
    axios.post.mockResolvedValue({ data: { status: 'success', data: { url: '/media/pic.png' } } });
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const tool = buildTool({ file });

    const output = await tool.save();

    expect(axios.post).toHaveBeenCalledWith(
      '/api/admin/media/add',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Requested-With': 'XMLHttpRequest' }),
      }),
    );
    expect(output.url).toBe('/media/pic.png');
    expect(output.file).toBeUndefined();
  });

  it('does not upload when there is no pending file', async () => {
    const tool = buildTool();

    const output = await tool.save();

    expect(axios.post).not.toHaveBeenCalled();
    expect(output.url).toBe(BASE64);
  });

  it('keeps the base64 preview and notifies on upload failure', async () => {
    axios.post.mockRejectedValue(new Error('network'));
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const tool = buildTool({ file });

    const output = await tool.save();

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ style: 'error' }));
    expect(output.url).toBe(BASE64);
    expect(output.file).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd editorjs-inline-image && yarn test test/upload.test.js`
Expected: FAIL (`save()` is synchronous and never calls `axios.post`; `output.file` is the `File`).

- [ ] **Step 3: Import axios and read the endpoint config**

In `src/index.js`, add the import at the top, after `import toolboxIcon ...`:

```javascript
import axios from 'axios';
```

In the `constructor`, after `this.api = api;`, add:

```javascript
    this.uploadEndpoint = (config && config.uploadEndpoint) || '/api/admin/media/add';
```

- [ ] **Step 4: Make `save()` async and add `uploadFile()`**

In `src/index.js`, replace the entire `save()` method with the two methods below:

```javascript
  async save() {
    const { caption } = this.ui.nodes;

    this.data.caption = caption.innerHTML;

    if (this.data.file) {
      await this.uploadFile(this.data.file);
    }

    const { file, ...output } = this.data;
    return output;
  }

  /**
   * Uploads a pending file to the media endpoint and swaps the
   * preview data-URL for the returned server URL. On failure it keeps
   * the data-URL so the post still saves.
   *
   * @param {File} file Pending image file
   * @returns {Promise<void>}
   */
  uploadFile(file) {
    const formData = new FormData();
    formData.append('filename', file);
    formData.append('title', this.data.caption || file.name);

    return axios.post(this.uploadEndpoint, formData, {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then((response) => {
        this.data.url = response.data.data.url;
        delete this.data.file;
      })
      .catch(() => {
        this.api.notifier.show({
          message: 'Image upload failed, using a temporary preview.',
          style: 'error',
        });
      });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd editorjs-inline-image && yarn test test/upload.test.js`
Expected: all 3 tests PASS.

- [ ] **Step 6: Run the full plugin suite to confirm no regressions**

Run: `cd editorjs-inline-image && yarn test`
Expected: `inlineImage.test.js`, `upload.test.js`, `unsplashClient.test.js`, `tunes.test.js` pass; the new `controlPanel` upload tests pass; the pre-existing 8 fork-drift failures remain (no NEW failures).

- [ ] **Step 7: Lint**

Run: `cd editorjs-inline-image && npx eslint src/index.js src/controlPanel.js`
Expected: no errors. Fix any reported style issues (the repo uses airbnb-base).

- [ ] **Step 8: Commit**

```bash
cd editorjs-inline-image
git add src/index.js test/upload.test.js
git commit -m "feat: upload pending image to media endpoint on save"
```

---

## Task 3: Drop-zone styles

**Files:**
- Modify: `editorjs-inline-image/src/index.css`

- [ ] **Step 1: Add the styles**

Append to the end of `src/index.css`:

```css
.inline-image__upload-panel {
  padding: 10px;
}

.inline-image__upload-zone {
  border: 2px dashed #c4c4c4;
  border-radius: 4px;
  padding: 40px 10px;
  text-align: center;
  color: #707684;
  cursor: pointer;
}

.inline-image__upload-zone:hover,
.inline-image__upload-zone--active {
  border-color: #388ae5;
  background: #eff2f5;
}
```

- [ ] **Step 2: Verify it builds (no test for CSS)**

Run: `cd editorjs-inline-image && yarn test`
Expected: unchanged from Task 2 Step 6 (CSS is stubbed by `assetsTransform.js`; this just confirms nothing broke).

- [ ] **Step 3: Commit**

```bash
cd editorjs-inline-image
git add src/index.css
git commit -m "style: add drop-zone styles for image upload"
```

---

## Task 4: README documentation

**Files:**
- Modify: `editorjs-inline-image/README.md`

- [ ] **Step 1: Document the Upload tab and config**

In `README.md`, update the intro line that reads:

```
Embed images from image files, URLs or [Unsplash](https://unsplash.com/).
```

to:

```
Embed images by uploading a file (drop zone or file dialog), from URLs, or from your media library.
```

Then, in the **Config Params** table, add this row after the `unsplash` row:

```
| uploadEndpoint | `string`  | Endpoint that receives the multipart upload (field `filename`) when a post is saved and returns `{ status, data: { url } }`. Default `/api/admin/media/add`. |
```

- [ ] **Step 2: Commit**

```bash
cd editorjs-inline-image
git add README.md
git commit -m "docs: document Upload tab and uploadEndpoint config"
```

---

## Task 5: gccwebsite — JSON response branch in `media.save`

**Files:**
- Modify: `gccwebsite/routes/media.js:118-161` (the `exports.save` handler)
- Test: `gccwebsite/tests/unit/routes/media.test.js`

- [ ] **Step 1: Write the failing tests**

In `gccwebsite/tests/unit/routes/media.test.js`, inside the `describe('save', ...)` block, add these two tests before its closing `})`:

```javascript
  test('returns JSON with the media url for an XHR request, deriving title from filename', async () => {
    MediaService.create.mockResolvedValue()

    const req = makeReq({ xhr: true, body: {} })
    const res = makeRes()
    media.save(req, res, jest.fn())
    await new Promise(r => setImmediate(r))

    expect(MediaService.create).toHaveBeenCalledWith(expect.objectContaining({
      title: 'test',
      filename: 'test.jpg'
    }))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: { url: '/media/' + encodeURIComponent('test.jpg') },
      message: 'Uploaded'
    })
    expect(res.redirect).not.toHaveBeenCalled()
  })

  test('returns a JSON error (413) for an XHR request when the file is too large', async () => {
    mockUploadFn.mockImplementation((req, res, cb) => {
      req.file = {
        path: '/tmp/uploads/big.jpg', filename: 'big.jpg',
        mimetype: 'image/jpeg', size: 10 * 1024 * 1024 // 10 MB > 5 MB limit
      }
      cb()
    })

    const req = makeReq({ xhr: true, body: {} })
    const res = makeRes()
    media.save(req, res, jest.fn())
    await new Promise(r => setImmediate(r))

    expect(res.status).toHaveBeenCalledWith(413)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }))
    expect(MediaService.create).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd gccwebsite && npx jest tests/unit/routes/media.test.js`
Expected: the 2 new tests FAIL (current `save` redirects / requires a title and never returns JSON).

- [ ] **Step 3: Implement the JSON branch**

In `gccwebsite/routes/media.js`, replace the entire `exports.save` function (currently lines ~118-161) with:

```javascript
exports.save = function (req, res, next) {
  upload(req, res, async function (uploadErr) {
    const wantsJson = req.xhr === true ||
      (req.headers && req.headers['x-requested-with'] === 'XMLHttpRequest')

    if (uploadErr instanceof multer.MulterError) {
      env.log.error('MulterError: ' + uploadErr)
      return next(uploadErr)
    } else if (uploadErr) {
      env.log.error('Upload error: ' + uploadErr)
      return next(uploadErr)
    }

    if (req.file.size > env.maxUploadFileSize) {
      const msg = 'File too large (max: ' + formatBytes(env.maxUploadFileSize) + ')'
      if (wantsJson) {
        unlink(req.file.path).catch(err => env.log.error('Failed to delete temp file: ' + err))
        return res.status(413).json({ status: 'error', message: msg })
      }
      req.flash('error', msg)
      return res.redirect('/')
    }

    const title = (req.body.title && req.body.title.trim())
      ? req.body.title.trim()
      : (wantsJson ? path.basename(req.file.filename, path.extname(req.file.filename)) : '')

    if (!title) {
      req.flash('error', 'Title is required')
      unlink(req.file.path).catch(err => env.log.error('Failed to delete temp file: ' + err))
      return res.redirect('/media/add')
    }

    env.log.info('Uploading file by ' + req.user.email + ': ' + req.file.path)

    try {
      const imgData = await readFile(req.file.path)
      const base64data = imgData.toString('base64')

      await MediaService.create({
        title,
        filename: req.file.filename,
        format: req.file.mimetype,
        keywords: req.body.keywords,
        content: base64data
      })

      unlink(req.file.path).catch(err => env.log.error('Failed to delete temp file: ' + err))
      unpackMedia(req.file.filename, base64data)

      if (wantsJson) {
        return res.status(200).json({
          status: 'success',
          data: { url: '/media/' + encodeURIComponent(req.file.filename) },
          message: 'Uploaded'
        })
      }
      res.redirect('/media')
    } catch (err) {
      return next(err)
    }
  })
}
```

- [ ] **Step 4: Run the media tests to verify all pass**

Run: `cd gccwebsite && npx jest tests/unit/routes/media.test.js`
Expected: ALL tests PASS — the 2 new ones plus every pre-existing `save` test (non-XHR redirect/flash behaviour is unchanged).

- [ ] **Step 5: Lint**

Run: `cd gccwebsite && npx eslint routes/media.js`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd gccwebsite
git add routes/media.js tests/unit/routes/media.test.js
git commit -m "feat: return JSON with media url for XHR uploads from the editor"
```

---

## Task 6: Build the bundle and wire it into gccwebsite

**Files:**
- Build artifact: `editorjs-inline-image/dist/bundle.js`
- Modify (copy): `gccwebsite/public/js/inlineimage/bundle.js`

- [ ] **Step 1: Build the production bundle**

Run: `cd editorjs-inline-image && yarn build`
Expected: completes with no errors; `dist/bundle.js` is regenerated.

- [ ] **Step 2: Commit the rebuilt bundle in the plugin repo**

```bash
cd editorjs-inline-image
git add dist/bundle.js
git commit -m "build: rebuild bundle with image upload support"
```

- [ ] **Step 3: Copy the bundle into gccwebsite**

Run: `cp editorjs-inline-image/dist/bundle.js gccwebsite/public/js/inlineimage/bundle.js`
Expected: file copied. (No EditorJS init change is needed — the plugin defaults to `/api/admin/media/add`, which is the registered route.)

- [ ] **Step 4: Commit the copied bundle in gccwebsite**

```bash
cd gccwebsite
git add public/js/inlineimage/bundle.js
git commit -m "chore: update inline-image bundle with upload support"
```

- [ ] **Step 5: Final verification — full suites**

Run: `cd editorjs-inline-image && yarn test`
Expected: new tests green; only the 8 pre-existing fork-drift failures remain.

Run: `cd gccwebsite && npx jest tests/unit/routes/media.test.js`
Expected: all green.

---

## Self-review notes

- **Spec coverage:** drop zone + file dialog (Task 1) ✓; preview in editor via base64/FileReader reusing existing flow (Task 1) ✓; deferred upload on post confirmation via async `save()` (Task 2) ✓; uses existing endpoint with JSON response + optional title (Task 5) ✓; `uploadEndpoint` config + README (Tasks 2, 4) ✓; graceful base64 fallback on failure (Task 2) ✓; build + bundle copy with deploy note (Task 6) ✓.
- **Naming consistency:** `handleFile`, `uploadFile`, `uploadEndpoint`, node keys `uploadPanel`/`uploadTab`/`dropZone`/`fileInput`, CSS keys `uploadPanel`/`dropZone`/`dropZoneActive`, response shape `{ status, data: { url }, message }`, multipart field `filename`, header `X-Requested-With` — used identically across plan and tests.
- **No placeholders.**
```
