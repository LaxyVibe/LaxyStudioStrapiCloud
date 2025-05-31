'use strict';

/**
 * poi service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::poi.poi');
