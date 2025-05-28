'use strict';

/**
 * restaurant-find service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::restaurant-find.restaurant-find');
