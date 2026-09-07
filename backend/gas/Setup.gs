/**
 * FreeAds Post - Google Sheets Database Schema Initializer
 * 
 * Run the `setupDatabase()` function once from the Google Apps Script editor
 * bound to your target Google Spreadsheet (or with SpreadsheetApp.openById).
 * 
 * This script creates all 7 required worksheets, formats column headers,
 * freezes header rows, and populates standard initial settings.
 */

const SCHEMA_DEFINITIONS = {
  Users: [
    'user_id',
    'name',
    'email',
    'phone',
    'company_name',
    'password_hash',
    'email_verified',
    'account_status',
    'role',
    'membership_status',
    'last_login',
    'created_at',
    'updated_at'
  ],
  Ads: [
    'ad_id',
    'user_id',
    'title',
    'category',
    'description',
    'image_url',
    'location',
    'contact_preference',
    'status',
    'rejection_reason',
    'is_sponsored',
    'sponsored_until',
    'created_at',
    'updated_at',
    'approved_at',
    'expires_at'
  ],
  Memberships: [
    'membership_id',
    'user_id',
    'plan',
    'amount',
    'currency',
    'payment_id',
    'payment_provider',
    'start_date',
    'expiry_date',
    'status',
    'created_at'
  ],
  EmailVerification: [
    'token_id',
    'user_id',
    'email',
    'token_hash',
    'expires_at',
    'used',
    'created_at'
  ],
  Admins: [
    'admin_id',
    'email',
    'role',
    'status',
    'created_at'
  ],
  ActivityLog: [
    'log_id',
    'user_id',
    'action',
    'entity_type',
    'entity_id',
    'timestamp',
    'metadata'
  ],
  Sessions: [
    'session_id',
    'token_hash',
    'user_id',
    'role',
    'expires_at',
    'created_at'
  ],
  Settings: [
    'setting',
    'value',
    'description'
  ]
};

const DEFAULT_SETTINGS = [
  ['site_name', 'FreeAds Post', 'Public platform branding name'],
  ['default_ad_duration_days', '30', 'Days an approved ad remains visible before expiring'],
  ['verification_token_expiry_hours', '24', 'Lifetime in hours for email verification tokens'],
  ['session_expiry_days', '7', 'Lifetime in days for user sessions'],
  ['allowed_categories', JSON.stringify(['Services', 'Vehicles', 'Electronics', 'Real Estate', 'Jobs', 'Community', 'Buy & Sell']), 'JSON array of valid ad categories'],
  ['require_email_verification', 'true', 'Require email verification before allowing login or viewing ads'],
  ['max_ads_per_free_user', '5', 'Max active ads for free tier accounts'],
  ['admin_notification_email', '', 'Destination email for new pending ad alerts'],
  ['membership_plans', JSON.stringify([
    {
      plan_id: 'FREE',
      name: 'Free Membership',
      description: 'Standard classified ads posting with essential community visibility.',
      amount: 0,
      currency: 'USD',
      billing_period: 'lifetime',
      duration_days: 0,
      features: [
        'Standard ad listings',
        'Community search & discovery',
        'Direct contact preferences',
        'Standard customer support'
      ],
      is_sponsored_eligible: false,
      max_active_ads: 5
    },
    {
      plan_id: 'PREMIUM_MONTHLY',
      name: 'Premium Monthly',
      description: 'Priority placement, sponsored ad eligibility, and increased visibility.',
      amount: 19.99,
      currency: 'USD',
      billing_period: 'monthly',
      duration_days: 30,
      features: [
        'Priority placement above standard ads',
        'Prominent SPONSORED badge eligibility',
        'Up to 50 active advertisement postings',
        'Enhanced seller profile badge',
        'Priority customer support'
      ],
      is_sponsored_eligible: true,
      max_active_ads: 50
    },
    {
      plan_id: 'PREMIUM_YEARLY',
      name: 'Premium Yearly',
      description: 'Maximum exposure with 2 months free, annual savings, and top-tier placement.',
      amount: 199.99,
      currency: 'USD',
      billing_period: 'yearly',
      duration_days: 365,
      features: [
        'Top-tier priority placement on /ads',
        'Continuous SPONSORED badge eligibility',
        'Up to 200 active advertisement postings',
        '2 months free compared to monthly plan',
        'Dedicated VIP customer support'
      ],
      is_sponsored_eligible: true,
      max_active_ads: 200
    }
  ]), 'Configured membership plans, pricing, duration, and sponsored ad eligibility'],
  ['inactivity_warning_days', '60', 'Days of user inactivity before an advance warning notification is dispatched'],
  ['inactivity_hide_ad_days', '90', 'Days of user inactivity before approved ads are automatically paused (status=HIDDEN)']
];

/**
 * Initializes or updates the active Google Spreadsheet with the required schema.
 * Safe to run multiple times (idempotent).
 */
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No active spreadsheet found. Please run this script inside the target Google Sheet container or provide spreadsheet ID.');
  }

  const existingSheets = ss.getSheets().map(s => s.getName());

  Object.keys(SCHEMA_DEFINITIONS).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    const headers = SCHEMA_DEFINITIONS[sheetName];

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // Set headers in Row 1
    const currentHeadersRange = sheet.getRange(1, 1, 1, headers.length);
    currentHeadersRange.setValues([headers]);
    currentHeadersRange.setFontWeight('bold');
    currentHeadersRange.setBackground('#1e293b');
    currentHeadersRange.setFontColor('#ffffff');
    sheet.setFrozenRows(1);

    // Format all columns as Plain Text by default to preserve IDs, JSON, and ISO timestamps
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 1), headers.length).setNumberFormat('@');

    // Auto-resize columns
    sheet.autoResizeColumns(1, headers.length);
  });

  // Populate default settings if empty
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet && settingsSheet.getLastRow() <= 1) {
    settingsSheet.getRange(2, 1, DEFAULT_SETTINGS.length, 3).setValues(DEFAULT_SETTINGS);
    settingsSheet.autoResizeColumns(1, 3);
  }

  // Remove default 'Sheet1' if our schemas are present
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      // Ignore if cannot delete
    }
  }

  Logger.log('FreeAds Post database schema successfully initialized.');
}
