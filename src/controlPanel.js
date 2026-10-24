import { make, createImageCredits } from './helpers';
import ImageClient from './imageClient';

/**
 * Renders control panel view
 *  - Website images search
 *  - Upload
 */
export default class ControlPanel {
  /**
   * @param {{api: object, config: object, cssClasses: object, onSelectImage: Function}}
   *  api - Editorjs API
   *  config - Tool custom config
   *  cssClasses - Css class names
   *  onSelectImage - Image selection callback
   */
  constructor({
    api, config, cssClasses, onSelectImage,
  }) {
    this.api = api;
    this.config = config;

    this.cssClasses = {
      ...cssClasses,
      controlPanel: 'inline-image__control-panel',
      tabWrapper: 'inline-image__tab-wrapper',
      tab: 'inline-image__tab',
      search: 'inline-image__search',
      imageGallery: 'inline-image__image-gallery',
      noResults: 'inline-image__no-results',
      imgWrapper: 'inline-image__img-wrapper',
      thumb: 'inline-image__thumb',
      active: 'active',
      hidden: 'hidden',
      scroll: 'scroll',
      uploadPanel: 'inline-image__upload-panel',
      dropZone: 'inline-image__upload-zone',
      dropZoneActive: 'inline-image__upload-zone--active',
    };

    this.onSelectImage = onSelectImage;

    this.nodes = {
      loader: null,
      unsplashTab: null,
      mediaTab: null,
      unsplashPanel: null,
      mediaPanel: null,
      imageGallery: null,
      searchInput: null,
      uploadTab: null,
      uploadPanel: null,
      dropZone: null,
      fileInput: null,
    };

    this.unsplashClient = new ImageClient(this.config.unsplash);
    this.searchTimeout = null;
    this.uploadEndpoint = (config && config.uploadEndpoint) || '/api/admin/media/add';
    this.dropZonePrompt = 'Drag an image here, or click to choose a file';
  }

  /**
   * Creates Control Panel components
   *
   * @returns {HTMLDivElement}
   */
  render() {
    const wrapper = make('div', this.cssClasses.controlPanel);
    const tabWrapper = make('div', this.cssClasses.tabWrapper);
    const unsplashTab = make('div', [this.cssClasses.tab, this.cssClasses.active], {
      innerHTML: 'Website Images',
      onclick: () => this.showUnsplashPanel(),
    });
    const uploadTab = make('div', this.cssClasses.tab, {
      innerHTML: 'Upload',
      onclick: () => this.showUploadPanel(),
    });

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

  /**
   * Shows "Unsplash" control panel
   *
   * @returns {void}
   */
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
      innerHTML: this.dropZonePrompt,
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

  /**
   * Uploads the chosen image to the media endpoint immediately and embeds
   * the returned server URL. The image is never held as base64 in the block,
   * so editor content stays small. On failure the image is not embedded.
   *
   * Returns a Promise for test sequencing; production callers
   * (onchange/ondrop) fire-and-forget.
   *
   * @param {File} file Image file selected or dropped by the user
   * @returns {Promise<void>}
   */
  handleFile(file) {
    if (!file.type || !file.type.startsWith('image/')) {
      this.api.notifier.show({
        message: 'Please choose an image file.',
        style: 'error',
      });
      return Promise.resolve();
    }

    this.nodes.dropZone.innerHTML = 'Uploading…';

    return this.unsplashClient.uploadImage(file, this.uploadEndpoint)
      .then((url) => {
        this.onSelectImage({ url, caption: file.name });
      })
      .catch(() => {
        this.nodes.dropZone.innerHTML = this.dropZonePrompt;
        this.api.notifier.show({
          message: 'Image upload failed, please try again.',
          style: 'error',
        });
      });
  }

  /**
   * OnInput handler for Search input
   *
   * @returns {void}
   */
  searchInputHandler() {
    this.showLoader();
    this.performSearch();
  }

  /**
   * Creates "Unsplash" control panel
   *
   * @returns {HTMLDivElement}
   */
  renderUnsplashPanel() {
    const wrapper = make('div', this.cssClasses.active);
    const imageGallery = make('div', this.cssClasses.imageGallery);
    const searchInput = make('div', [this.cssClasses.input, this.cssClasses.caption, this.cssClasses.search], {
      id: 'unsplash-search',
      contentEditable: 'true',
      oninput: () => this.searchInputHandler(),
    });

    searchInput.dataset.placeholder = 'Search for an image...';

    const observer = new MutationObserver(() => {
      if (document.contains(searchInput)) {
        searchInput.oninput();
        observer.disconnect();
      }
    });

    observer.observe(document, {
      attributes: false, childList: true, characterData: false, subtree: true,
    });

    wrapper.appendChild(searchInput);
    wrapper.appendChild(imageGallery);

    this.nodes.searchInput = searchInput;
    this.nodes.imageGallery = imageGallery;

    return wrapper;
  }

  /**
   * Shows a loader spinner on image gallery
   *
   * @returns {void}
   */
  showLoader() {
    this.nodes.imageGallery.innerHTML = '';
    this.nodes.loader = make('div', this.cssClasses.loading);
    this.nodes.imageGallery.appendChild(this.nodes.loader);
  }

  /**
   * Perfoms image search on user input.
   * Defines a timeout for preventing multiple requests
   *
   * @returns {void}
   */
  performSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      let query = this.nodes.searchInput.innerHTML;
      if (query === '<br>') {
        query = '';
      }
      this.unsplashClient.searchImages(query,
        (results) => this.appendImagesToGallery(results));
    }, 1000);
  }

  /**
   * Creates the image gallery using Unsplash API results.
   *
   * @param {Array} results Images from Unsplash API
   */
  appendImagesToGallery(results) {
    this.nodes.imageGallery.innerHTML = '';
    if (results && results.length) {
      this.nodes.unsplashPanel.classList.add(this.cssClasses.scroll);
      results.forEach((image) => {
        this.createThumbImage(image);
      });
    } else {
      const noResults = make('div', this.cssClasses.noResults, {
        innerHTML: 'No images found',
      });
      this.nodes.imageGallery.appendChild(noResults);
      this.nodes.unsplashPanel.classList.remove(this.cssClasses.scroll);
    }
  }

  /**
   * Creates a thumb image and appends it to the image gallery
   *
   * @param {Object} image Unsplash image object
   * @returns {void}
   */
  createThumbImage(image) {
    const imgWrapper = make('div', this.cssClasses.imgWrapper);
    const img = make('img', this.cssClasses.thumb, {
      src: image.thumb,
      onclick: () => this.selectImage(image),
    });

    const imageCredits = createImageCredits({ ...image });

    imgWrapper.appendChild(img);
    imgWrapper.appendChild(imageCredits);
    this.nodes.imageGallery.append(imgWrapper);
  }

  /**
   * Handler for a thumbnail click: embeds the chosen image
   *
   * @param {{url: string}} image Image object from the gallery
   * @returns {void}
   */
  selectImage({ url }) {
    this.onSelectImage({ url });
  }
}
