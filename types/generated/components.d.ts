import type { Schema, Struct } from '@strapi/strapi';

export interface StayFaqItem extends Struct.ComponentSchema {
  collectionName: 'components_stay_faq_items';
  info: {
    displayName: 'Faq item';
  };
  attributes: {
    answer: Schema.Attribute.RichText;
    question: Schema.Attribute.String;
  };
}

export interface StaySuite extends Struct.ComponentSchema {
  collectionName: 'components_stay_suites';
  info: {
    description: '';
    displayName: 'Suite';
    icon: 'house';
  };
  attributes: {
    amenities: Schema.Attribute.RichText;
    checkInOut: Schema.Attribute.RichText;
    houseRules: Schema.Attribute.RichText;
    name: Schema.Attribute.String;
    slider: Schema.Attribute.Media<'images' | 'files', true>;
    slug: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.Unique;
    wifiAccess1: Schema.Attribute.String;
    wifiAccess2: Schema.Attribute.String;
    wifiPassword1: Schema.Attribute.String;
    wifiPassword2: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'stay.faq-item': StayFaqItem;
      'stay.suite': StaySuite;
    }
  }
}
