'use strict';

/**
 * suite router
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::suite.suite');
