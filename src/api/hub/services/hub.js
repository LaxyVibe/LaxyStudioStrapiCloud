'use strict';

/**
 * hub service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::hub.hub');
