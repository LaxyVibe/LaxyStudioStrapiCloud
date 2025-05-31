import type { Schema, Struct } from '@strapi/strapi';

export interface StayFaqItem extends Struct.ComponentSchema {
  collectionName: 'components_stay_faq_items';
  info: {
    description: '';
    displayName: 'Faq item';
  };
  attributes: {
    answer: Schema.Attribute.RichText &
      Schema.Attribute.CustomField<'plugin::tinymce.tinymce'>;
    question: Schema.Attribute.String;
  };
}

export interface StayWiFiItem extends Struct.ComponentSchema {
  collectionName: 'components_stay_wi_fi_items';
  info: {
    displayName: 'WiFi item';
    icon: 'link';
  };
  attributes: {
    network: Schema.Attribute.String;
    password: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'stay.faq-item': StayFaqItem;
      'stay.wi-fi-item': StayWiFiItem;
    }
  }
}
