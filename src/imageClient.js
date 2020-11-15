import axios from 'axios';

/**
 * Client for Media
 */
export default class ImageClient {
  constructor(config) {
    this.apiUrl = config && config.apiUrl ? config.apiUrl : '/media/searchdata';
    this.perPage = config && config.maxResults ? config.maxResults : 30;
  }

  /**
   * Search images
   *
   * @param {string} query Image search query term
   * @param {Function} callback Function for redering image gallery
   * @returns {void}
   */
  searchImages(query, callback) {
    axios.get(`${this.apiUrl}`, {
      params: {
        query,
        per_page: this.perPage,
      },
    })
      .then((response) => callback(this.parseResponse(response.data)))
      .catch(() => callback([]));
  }

  /**
   * Parses Unsplash API response
   * @param {{results: string}} results Array of images from Unsplash
   */
  parseResponse({ data }) {
    console.log(data)
    return data.map((image) => this.buildImageObject(image));
  }

  /**
   * Builds an image object
   *
   * @param {object} image Unsplash image object
   * @returns {object} Image object
   */
  buildImageObject(image) {
    return {
      title: image.title,
      format: image.format,
      url: image.url,
      thumb: image.thumbnail,
      downloadLocation: image.url
    };
  }

  /**
  * Download image from Unsplash
  * Required by Unsplash API Guideline for tracking purposes
  * https://help.unsplash.com/en/articles/2511258-guideline-triggering-a-download
  *
  * @param {string} downloadLocation Image download endpoint
  * @returns {void}
  */
  downloadImage(downloadLocation) {
    axios.get(downloadLocation)
    .catch((error) => console.log(error));
  }
}
