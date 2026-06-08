import InlineImage from '../src/index';
import Ui from '../src/ui';
import ImageClient from '../src/imageClient';
import createInlineImage from './fixtures/inlineImage';
import { data } from './fixtures/toolData';

jest.mock('../src/ui');

describe('InlineImage', () => {
  let inlineImage;
  let mockSetData;

  beforeEach(() => {
    jest.spyOn(InlineImage.prototype, 'data', 'get').mockImplementation(() => data);
    mockSetData = jest.spyOn(InlineImage.prototype, 'data', 'set').mockImplementation();
    inlineImage = createInlineImage(data);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validates data', () => {
    it('return true if data is valid', () => {
      expect(inlineImage.validate(data)).toBe(true);
    });

    it('return false if data is not valid', () => {
      expect(inlineImage.validate({ url: '' })).toBe(false);
    });
  });

  describe('onPaste', () => {
    it('handles tag event', () => {
      const event = {
        type: 'tag',
        detail: {
          data: {
            src: 'https://www.example.com/image.png',
          },
        },
      };

      inlineImage.onPaste(event);

      expect(mockSetData).toHaveBeenLastCalledWith({ url: event.detail.data.src });
    });

    it('handles pattern event', () => {
      const event = {
        type: 'pattern',
        detail: {
          data: 'https://www.example.com/image.png',
        },
      };

      inlineImage.onPaste(event);

      expect(mockSetData).toHaveBeenLastCalledWith({ url: event.detail.data });
    });

    it('handles file event by uploading and embedding the server url', async () => {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      const event = { type: 'file', detail: { file } };
      const upload = jest.spyOn(ImageClient.prototype, 'uploadImage')
        .mockResolvedValue('/media/pic.png');

      inlineImage.onPaste(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(upload).toHaveBeenCalledWith(file, expect.any(String));
      expect(mockSetData).toHaveBeenLastCalledWith({ url: '/media/pic.png', caption: 'pic.png' });
    });

    it('removes the block and notifies when a pasted file fails to upload', async () => {
      const file = new File(['x'], 'pic.png', { type: 'image/png' });
      const event = { type: 'file', detail: { file } };
      jest.spyOn(ImageClient.prototype, 'uploadImage').mockRejectedValue(new Error('fail'));

      inlineImage.onPaste(event);
      await new Promise((resolve) => setImmediate(resolve));

      expect(Ui.prototype.removeCurrentBlock).toHaveBeenCalled();
    });
  });

  it('tuneToggled', () => {
    const mockApplyTune = jest.spyOn(Ui.prototype, 'applyTune');

    inlineImage.tuneToggled('withBorder');

    expect(mockSetData).toHaveBeenLastCalledWith({ withBorder: true });
    expect(mockApplyTune).toHaveBeenCalledWith('withBorder', true);
  });
});
