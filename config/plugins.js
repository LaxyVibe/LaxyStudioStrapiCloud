module.exports = ({env}) => ({
  "strapi-import-export": {
    enabled: true,
    config: {
      serverPublicHostname: env('PUBLIC_URL', 'http://localhost:1337'), // Required for media handling
    },
  },
  tinymce: {
    enabled: true
  },
  upload: {
    config: {
      provider: 'cloudinary',
      providerOptions: {
        cloud_name: env('CLOUDINARY_NAME'),
        api_key: env('CLOUDINARY_KEY'),
        api_secret: env('CLOUDINARY_SECRET'),
      },
      actionOptions: {
        upload: {},
        uploadStream: {},
        delete: {},
      },
    },
  },
});