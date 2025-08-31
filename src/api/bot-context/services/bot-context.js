'use strict';

/**
 * bot-context service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::bot-context.bot-context');
