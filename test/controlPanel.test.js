import createControlPanel from './fixtures/controlPanel';
import { parsedResponse } from './fixtures/unsplashApi';
import { triggerEvent } from './testHelpers';
import UnsplashClient from '../src/unsplashClient';
import ImageClient from '../src/imageClient';

const onSelectImage = jest.fn();
const notify = jest.fn();

describe('ControlPanel', () => {
  let controlPanel;

  beforeEach(() => {
    controlPanel = createControlPanel(onSelectImage, notify);
    controlPanel.render();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('embedUrl', () => {
    let embedUrlPanel;
    let input;
    let button;

    beforeEach(() => {
      embedUrlPanel = controlPanel.nodes.embedUrlPanel;
      input = embedUrlPanel.querySelector('#image-url');
      button = embedUrlPanel.querySelector('#embed-button');
    });

    it('renders the embedUrl panel', () => {
      expect(embedUrlPanel).not.toBeEmptyDOMElement();
      expect(embedUrlPanel).toBeVisible();
    });

    it('embeds image from valid url', () => {
      const imageUrl = 'example.com/image.jpg';
      input.innerHTML = imageUrl;
      button.click();

      expect(onSelectImage).toHaveBeenCalledWith({ url: imageUrl });
      expect(notify).not.toHaveBeenCalled();
    });

    it('shows a error message if image url is not valid', () => {
      const imageUrl = 'not-valid';
      input.innerHTML = imageUrl;
      button.click();

      expect(onSelectImage).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalled();
    });
  });

  describe('unsplash', () => {
    let unsplashPanel;

    beforeEach(() => {
      unsplashPanel = controlPanel.nodes.unsplashPanel;
    });

    it('creates the unsplash panel (hidden)', () => {
      expect(unsplashPanel).not.toBeEmptyDOMElement();

      expect(unsplashPanel).toHaveClass('hidden');
    });

    describe('unsplash search', () => {
      it('triggers unsplash image search on input event', () => {
        const mockSearchImages = jest.spyOn(UnsplashClient.prototype, 'searchImages')
          .mockImplementation();
        jest.useFakeTimers();

        const query = 'pizza';
        const input = unsplashPanel.querySelector('#unsplash-search');
        input.innerHTML = query;
        triggerEvent(input, 'input');

        jest.runAllTimers();

        expect(mockSearchImages).toHaveBeenCalledWith(query, expect.any(Function));
      });

      it('creates image gallery from unsplash data', () => {
        controlPanel.appendImagesToGallery(parsedResponse);

        const { imageGallery } = controlPanel.nodes;
        const imagesList = imageGallery.querySelectorAll('.inline-image__img-wrapper');
        const imageWrapper = imagesList[0];
        const thumb = imageWrapper.querySelector('img');
        const credits = imageWrapper.querySelector('div');

        expect(imagesList.length).toBe(2);
        expect(imageWrapper).not.toBeEmptyDOMElement();
        expect(thumb.src).toBe(parsedResponse[0].thumb);
        expect(credits).not.toBeEmptyDOMElement();
      });

      it('shows a message if no images found', () => {
        controlPanel.appendImagesToGallery([]);
        const { imageGallery } = controlPanel.nodes;
        const noResults = imageGallery.querySelector('div');

        expect(noResults).toHaveClass('inline-image__no-results');
      });
    });

    describe('embed image', () => {
      let imageGallery;
      let imageData;
      let mockDownloadImage;

      beforeEach(() => {
        mockDownloadImage = jest.spyOn(UnsplashClient.prototype, 'downloadImage')
          .mockImplementation();
        controlPanel.appendImagesToGallery([parsedResponse[0]]);
        imageGallery = controlPanel.nodes.imageGallery;
        [imageData] = parsedResponse;
        imageGallery.querySelector('.inline-image__thumb').click();
      });

      it('embeds image from unsplash', () => {
        expect(onSelectImage).toHaveBeenCalledWith(expect.objectContaining({
          unsplash: {
            author: imageData.author,
            profileLink: imageData.profileLink,
          },
          url: imageData.url,
        }));
      });

      it('downloads image from unspalsh', () => {
        expect(mockDownloadImage).toHaveBeenCalledWith(imageData.downloadLocation);
      });
    });
  });

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

    it('uploads the chosen image immediately and selects the returned server url', async () => {
      const upload = jest.spyOn(ImageClient.prototype, 'uploadImage')
        .mockResolvedValue('/media/pic.png');
      const file = new File(['imgbytes'], 'pic.png', { type: 'image/png' });

      await controlPanel.handleFile(file);

      expect(upload).toHaveBeenCalledWith(file, expect.any(String));
      expect(onSelectImage).toHaveBeenCalledWith({ url: '/media/pic.png', caption: 'pic.png' });
      expect(notify).not.toHaveBeenCalled();
    });

    it('notifies and does not select the image when the upload fails', async () => {
      jest.spyOn(ImageClient.prototype, 'uploadImage').mockRejectedValue(new Error('fail'));
      const file = new File(['imgbytes'], 'pic.png', { type: 'image/png' });

      await controlPanel.handleFile(file);

      expect(onSelectImage).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalled();
    });

    it('rejects a non-image file with an error and does not upload it', async () => {
      const upload = jest.spyOn(ImageClient.prototype, 'uploadImage');
      const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

      await controlPanel.handleFile(file);

      expect(upload).not.toHaveBeenCalled();
      expect(onSelectImage).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalled();
    });
  });
});
