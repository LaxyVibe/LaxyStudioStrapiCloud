'use strict';

/**
 * restaurant-recommendation service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::restaurant-recommendation.restaurant-recommendation');
