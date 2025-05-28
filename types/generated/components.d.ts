import type { Schema, Struct } from '@strapi/strapi';

export interface StayFaqItem extends Struct.ComponentSchema {
  collectionName: 'components_stay_faq_items';
  info: {
    description: '';
    displayName: 'Faq item';
  };
  attributes: {
    answer: Schema.Attribute.RichText;
    applicable_suites: Schema.Attribute.Relation<
      'oneToMany',
      'api::suite.suite'
    >;
    question: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'stay.faq-item': StayFaqItem;
    }
  }
}
