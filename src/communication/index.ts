/**
 * Communication Module Index
 *
 * Centralized exports for communication services and utilities
 */

// Email Services
export * from './email/email.template';
export * from './email/email.service';
export * from './email/email.analytics';
export * from './email/email.queue';

// Multi-channel Services
export * from './multichannel/multichannel.service';

// Preference Services
export * from './preferences/preference.service';

// Automation Services
export * from './automation/workflow.service';

// Deliverability Services
export * from './deliverability/deliverability.service';

// Module
export * from './communication.module';
