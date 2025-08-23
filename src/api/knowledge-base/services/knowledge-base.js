'use strict';

/**
 * knowledge-base service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::knowledge-base.knowledge-base');
