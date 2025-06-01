import type { Schema, Struct } from '@strapi/strapi';

export interface HubApplicationButton extends Struct.ComponentSchema {
  collectionName: 'components_hub_application_buttons';
  info: {
    description: '';
    displayName: 'Button';
  };
  attributes: {
    icon: Schema.Attribute.Media<'images'>;
    label: Schema.Attribute.String;
    route: Schema.Attribute.String;
    value: Schema.Attribute.String;
  };
}

export interface HubApplicationGlobalConfig extends Struct.ComponentSchema {
  collectionName: 'components_hub_application_global_configs';
  info: {
    displayName: 'Global Config';
  };
  attributes: {
    releasedLanguages: Schema.Attribute.Component<
      'hub-application.button',
      true
    >;
  };
}

export interface HubApplicationHeader extends Struct.ComponentSchema {
  collectionName: 'components_hub_application_headers';
  info: {
    displayName: 'Header';
  };
  attributes: {
    leftIcon: Schema.Attribute.Media<'images'>;
    leftRoute: Schema.Attribute.String;
    rightIcon: Schema.Attribute.Media<'images'>;
    rightRoute: Schema.Attribute.String;
  };
}

export interface HubApplicationPageLanding extends Struct.ComponentSchema {
  collectionName: 'components_hub_application_page_landings';
  info: {
    description: '';
    displayName: 'Page Landing';
  };
  attributes: {
    naviagtionButtons: Schema.Attribute.Component<
      'hub-application.button',
      true
    >;
    recommendationHeading: Schema.Attribute.String;
  };
}

export interface HubApplicationPageLanguage extends Struct.ComponentSchema {
  collectionName: 'components_hub_application_page_languages';
  info: {
    description: '';
    displayName: 'Page Language';
  };
  attributes: {
    applyButton: Schema.Attribute.Component<'hub-application.button', false>;
    Heading: Schema.Attribute.String;
  };
}

export interface HubApplicationPageSearch extends Struct.ComponentSchema {
  collectionName: 'components_hub_application_page_searches';
  info: {
    displayName: 'Page Search';
  };
  attributes: {
    defaultList: Schema.Attribute.Component<'hub-application.button', true>;
    defaultListHeading: Schema.Attribute.String;
    searchInputPlaceholder: Schema.Attribute.String;
  };
}

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
      'hub-application.button': HubApplicationButton;
      'hub-application.global-config': HubApplicationGlobalConfig;
      'hub-application.header': HubApplicationHeader;
      'hub-application.page-landing': HubApplicationPageLanding;
      'hub-application.page-language': HubApplicationPageLanguage;
      'hub-application.page-search': HubApplicationPageSearch;
      'stay.faq-item': StayFaqItem;
      'stay.wi-fi-item': StayWiFiItem;
    }
  }
}
