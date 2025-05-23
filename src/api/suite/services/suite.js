'use strict';

/**
 * suite service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::suite.suite');
