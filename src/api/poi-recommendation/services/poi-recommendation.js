'use strict';

/**
 * poi-recommendation service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::poi-recommendation.poi-recommendation');
