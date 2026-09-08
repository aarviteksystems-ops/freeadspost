/**
 * FreeAds Post - Request Router
 * 
 * Routes incoming HTTP requests (from doGet / doPost) to registered endpoint handlers.
 * Supports standard REST paths, parameterized paths (:id), RPC action names, and HTTP method overriding (_method).
 */

const Router = (function() {
  const routes = [];

  /**
   * Registers a route handler with method and path/action.
   */
  function register(method, path, handler, middlewares = []) {
    let finalHandler = handler;
    // Apply middlewares in reverse order
    for (let i = middlewares.length - 1; i >= 0; i--) {
      finalHandler = middlewares[i](finalHandler);
    }

    const normPath = normalizePath(path);
    const segments = normPath.split('/').filter(Boolean);
    const hasParams = segments.some(function(s) { return s.startsWith(':'); });

    routes.push({
      method: method.toUpperCase(),
      path: normPath,
      segments: segments,
      hasParams: hasParams,
      handler: finalHandler
    });
  }

  function get(path, handler, middlewares = []) {
    register('GET', path, handler, middlewares);
  }

  function post(path, handler, middlewares = []) {
    register('POST', path, handler, middlewares);
  }

  function put(path, handler, middlewares = []) {
    register('PUT', path, handler, middlewares);
  }

  function del(path, handler, middlewares = []) {
    register('DELETE', path, handler, middlewares);
  }

  /**
   * Normalizes path string (strips leading/trailing slashes, lowercase).
   */
  function normalizePath(p) {
    if (!p) return '';
    return p.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  }

  /**
   * Parses incoming Google Apps Script event object into a unified request object.
   */
  function parseRequest(e, httpMethod) {
    const params = (e && e.parameter) ? Object.assign({}, e.parameter) : {};
    let body = {};
    let headers = {};

    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (err) {
        // Fallback for form-encoded or raw strings
        body = { raw: e.postData.contents };
      }
    }

    // Determine target route/action
    const targetPath = normalizePath(
      (body && (body.action || body.path)) ||
      params.action ||
      params.path ||
      (e && e.pathInfo) ||
      ''
    );

    // Support HTTP method override (_method) via POST body or query params, strictly whitelisted
    let effectiveMethod = httpMethod.toUpperCase();
    if (httpMethod.toUpperCase() === 'POST') {
      const overrideVal = (body && typeof body._method === 'string' && body._method) ||
                          (params && typeof params._method === 'string' && params._method);
      if (overrideVal) {
        const requestedMethod = overrideVal.trim().toUpperCase();
        const allowedOverrides = ['PUT', 'DELETE'];
        if (allowedOverrides.indexOf(requestedMethod) !== -1) {
          effectiveMethod = requestedMethod;
        }
      }
    }

    return {
      method: effectiveMethod,
      path: targetPath,
      params: params,
      body: body,
      headers: headers,
      rawEvent: e
    };
  }

  /**
   * Dispatches request to the matching registered route.
   */
  function handle(e, defaultMethod) {
    try {
      const request = parseRequest(e, defaultMethod);

      // 1. Try exact match first
      let match = routes.find(function(r) {
        return r.method === request.method && r.path === request.path;
      });
      let pathParams = {};

      // 2. Try parameterized match (:param) if no exact match found
      if (!match) {
        const reqSegments = request.path.split('/').filter(Boolean);
        for (let i = 0; i < routes.length; i++) {
          const r = routes[i];
          if (r.method !== request.method || !r.hasParams || r.segments.length !== reqSegments.length) {
            continue;
          }
          let isMatch = true;
          const extracted = {};
          for (let s = 0; s < r.segments.length; s++) {
            if (r.segments[s].startsWith(':')) {
              const paramName = r.segments[s].substring(1);
              extracted[paramName] = reqSegments[s];
            } else if (r.segments[s] !== reqSegments[s]) {
              isMatch = false;
              break;
            }
          }
          if (isMatch) {
            match = r;
            pathParams = extracted;
            break;
          }
        }
      }

      if (!match) {
        return Responses.error(
          'ENDPOINT_NOT_FOUND',
          `Route ${request.method} /${request.path} was not found.`,
          404,
          { method: request.method, path: request.path }
        );
      }

      // Merge extracted path parameters into request.params and request.body
      if (Object.keys(pathParams).length > 0) {
        Object.assign(request.params, pathParams);
        if (pathParams.id) {
          if (!request.params.ad_id) request.params.ad_id = pathParams.id;
          if (!request.body.ad_id) request.body.ad_id = pathParams.id;
          if (!request.body.id) request.body.id = pathParams.id;
        }
      }

      return match.handler(request);
    } catch (err) {
      LoggerUtil.error('Unhandled router exception', err);
      return Responses.error(
        'INTERNAL_SERVER_ERROR',
        'An unexpected server error occurred. Please try again later.',
        500
      );
    }
  }

  return {
    register: register,
    get: get,
    post: post,
    put: put,
    del: del,
    handle: handle,
    parseRequest: parseRequest
  };
})();
