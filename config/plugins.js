module.exports = ({env}) => ({
  "strapi-import-export": {
    enabled: true,
  },
  tinymce: {
    enabled: true,
    config: {
      editor: {
        outputFormat: "html",
        editorConfig: {
          plugins: [
            "advlist",
            "autolink",
            "lists",
            "link",
            "image",
            "charmap",
            "preview",
            "anchor",
          ],
          toolbar:
            "fullscreen preview | undo redo | blocks | " +
            "bold italic forecolor backcolor | alignleft aligncenter " +
            "alignright alignjustify | bullist numlist outdent indent | " +
            "link image media | removeformat | help"
        }
      }
    }
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