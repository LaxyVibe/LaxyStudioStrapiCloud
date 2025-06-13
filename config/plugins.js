module.exports = ({env}) => ({
  "strapi-csv-import-export": {
          config: {
            authorizedExports: [
              "api::tag-label.tag-label",
              "api::stay.stay", 
              "api::suite.suite",
              "api::poi.poi",
              "api::poi-recommendation.poi-recommendation",
              "api::hub-application-config.hub-application-config",
              "plugin::users-permissions.user"
            ],
            authorizedImports: [
              "api::tag-label.tag-label",
              "api::stay.stay",
              "api::suite.suite", 
              "api::poi.poi",
              "api::poi-recommendation.poi-recommendation",
              "api::hub-application-config.hub-application-config",
              "plugin::users-permissions.user"
            ]
  }
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