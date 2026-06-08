import axios from 'axios';
import ImageClient from '../src/imageClient';

jest.mock('axios');

afterEach(() => {
  jest.clearAllMocks();
});

describe('ImageClient.uploadImage', () => {
  it('POSTs the file as multipart and resolves the returned server url', async () => {
    axios.post.mockResolvedValue({ data: { status: 'success', data: { url: '/media/pic.png' } } });
    const client = new ImageClient();
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    const url = await client.uploadImage(file, '/api/admin/media/add');

    expect(axios.post).toHaveBeenCalledWith(
      '/api/admin/media/add',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Requested-With': 'XMLHttpRequest' }),
      }),
    );
    const sentFormData = axios.post.mock.calls[0][1];
    expect(sentFormData.get('filename')).toBe(file);
    expect(sentFormData.get('title')).toBe('pic.png');
    expect(url).toBe('/media/pic.png');
  });

  it('rejects when the response is malformed (no url)', async () => {
    axios.post.mockResolvedValue({ data: { status: 'success' } });
    const client = new ImageClient();
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    await expect(client.uploadImage(file, '/api/admin/media/add')).rejects.toThrow();
  });

  it('rejects when the request fails', async () => {
    axios.post.mockRejectedValue(new Error('network'));
    const client = new ImageClient();
    const file = new File(['x'], 'pic.png', { type: 'image/png' });

    await expect(client.uploadImage(file, '/api/admin/media/add')).rejects.toThrow();
  });
});
