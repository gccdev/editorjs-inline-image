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
    const sentFormData = axios.post.mock.calls[0][1];
    expect(sentFormData.get('filename')).toBe(file);
    expect(sentFormData.get('title')).toBe('cap');
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
