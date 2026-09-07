/**
 * FreeAds Post - HTTP Responses & CORS Strategy
 * 
 * Standardizes API JSON responses. Google Apps Script Web Apps automatically 
 * provide standard CORS headers (`Access-Control-Allow-Origin: *`) on ContentService outputs
 * when the web app is deployed with access: "Anyone".
 */

const Responses = (function() {

  /**
   * Generates a successful JSON response envelope.
   */
  function success(data = null, message = null, statusCode = 200) {
    const payload = {
      success: true,
      statusCode: statusCode,
      message: message,
      data: data,
      error: null,
      timestamp: new Date().toISOString()
    };
    return buildOutput(payload);
  }

  /**
   * Generates a standardized error response envelope.
   * 
   * @param {string} code - Machine-readable error code (e.g., 'UNAUTHORIZED', 'NOT_FOUND')
   * @param {string} message - Human-readable explanation
   * @param {number} statusCode - HTTP status code
   * @param {any} details - Optional field-level validation errors or metadata
   */
  function error(code, message, statusCode = 400, details = null) {
    const payload = {
      success: false,
      statusCode: statusCode,
      data: null,
      error: {
        code: code,
        message: message,
        details: details
      },
      timestamp: new Date().toISOString()
    };
    return buildOutput(payload);
  }

  /**
   * Serializes payload to JSON and sets appropriate MIME type.
   */
  function buildOutput(payload) {
    const output = ContentService.createTextOutput(JSON.stringify(payload));
    output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }

  return {
    success: success,
    error: error,
    buildOutput: buildOutput
  };
})();
