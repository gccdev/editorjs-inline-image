import createControlPanel from './fixtures/controlPanel';
import { parsedResponse } from './fixtures/unsplashApi';
import { triggerEvent } from './testHelpers';
import ImageClient from '../src/imageClient';

const onSelectImage = jest.fn();
const notify = jest.fn();

describe('ControlPanel', () => {
  let controlPanel;
  let wrapper;

  beforeEach(() => {
    controlPanel = createControlPanel(onSelectImage, notify);
    wrapper = controlPanel.render();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('tabs', () => {
    it('offers the website images and upload tabs and no embed-URL panel', () => {
      const tabs = Array.from(wrapper.querySelectorAll('.inline-image__tab'), (tab) => tab.innerHTML);

      expect(tabs).toEqual(['Website Images', 'Upload']);
      expect(wrapper.querySelector('#image-url')).toBeNull();
    });
  });

  describe('website images', () => {
    let unsplashPanel;

    beforeEach(() => {
      unsplashPanel = controlPanel.nodes.unsplashPanel;
    });

    it('shows the website images panel on open', () => {
      expect(unsplashPanel).not.toBeEmptyDOMElement();

      expect(unsplashPanel).toHaveClass('active');
      expect(unsplashPanel).not.toHaveClass('hidden');
      expect(controlPanel.nodes.unsplashTab).toHaveClass('active');
    });

    describe('image search', () => {
      it('triggers an image search on input event', () => {
        const mockSearchImages = jest.spyOn(ImageClient.prototype, 'searchImages')
          .mockImplementation();
        jest.useFakeTimers();

        const query = 'pizza';
        const input = unsplashPanel.querySelector('#unsplash-search');
        input.innerHTML = query;
        triggerEvent(input, 'input');

        jest.runAllTimers();

        expect(mockSearchImages).toHaveBeenCalledWith(query, expect.any(Function));
      });

      it('creates image gallery from search results', () => {
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

      beforeEach(() => {
        controlPanel.appendImagesToGallery([parsedResponse[0]]);
        imageGallery = controlPanel.nodes.imageGallery;
        [imageData] = parsedResponse;
        imageGallery.querySelector('.inline-image__thumb').click();
      });

      it('selects the image by its url alone, without unsplash credits', () => {
        expect(onSelectImage).toHaveBeenCalledWith({ url: imageData.url });
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
