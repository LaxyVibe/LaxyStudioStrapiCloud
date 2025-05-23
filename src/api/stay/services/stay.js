'use strict';

/**
 * stay service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stay.stay');
