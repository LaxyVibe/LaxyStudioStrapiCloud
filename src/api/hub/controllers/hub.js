'use strict';

/**
 * hub controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::hub.hub');
