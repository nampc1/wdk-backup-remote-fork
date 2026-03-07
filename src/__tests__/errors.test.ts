import {
  BackendAuthError,
  BackendNetworkError,
  BackendValidationError,
} from '../errors/index';

describe('Error classes', () => {
  // -------------------------------------------------------------------------
  // BackendAuthError
  // -------------------------------------------------------------------------
  describe('BackendAuthError', () => {
    it('is an instance of Error and BackendAuthError', () => {
      const err = new BackendAuthError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BackendAuthError);
    });

    it('uses the default message', () => {
      const err = new BackendAuthError();
      expect(err.message).toBe('Authentication failed');
    });

    it('accepts a custom message', () => {
      const err = new BackendAuthError('Token expired');
      expect(err.message).toBe('Token expired');
    });

    it('stores statusCode and cause', () => {
      const cause = new Error('original');
      const err = new BackendAuthError('fail', { statusCode: 401, cause });
      expect(err.statusCode).toBe(401);
      expect(err.cause).toBe(cause);
    });

    it('sets name to class name', () => {
      expect(new BackendAuthError().name).toBe('BackendAuthError');
    });
  });

  // -------------------------------------------------------------------------
  // BackendNetworkError
  // -------------------------------------------------------------------------
  describe('BackendNetworkError', () => {
    it('is an instance of Error and BackendNetworkError', () => {
      const err = new BackendNetworkError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BackendNetworkError);
    });

    it('uses the default message', () => {
      expect(new BackendNetworkError().message).toBe('Network error');
    });

    it('stores cause', () => {
      const inner = new Error('ETIMEDOUT');
      const err = new BackendNetworkError('timed out', { cause: inner });
      expect(err.cause).toBe(inner);
    });

    it('does NOT set statusCode when not provided', () => {
      expect(new BackendNetworkError().statusCode).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // BackendValidationError
  // -------------------------------------------------------------------------
  describe('BackendValidationError', () => {
    it('is an instance of Error and BackendValidationError', () => {
      const err = new BackendValidationError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BackendValidationError);
    });

    it('uses the default message', () => {
      expect(new BackendValidationError().message).toBe('Validation error');
    });

    it('stores statusCode 422', () => {
      const err = new BackendValidationError('bad shape', { statusCode: 422 });
      expect(err.statusCode).toBe(422);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-class: instances are NOT cross-instances
  // -------------------------------------------------------------------------
  it('error classes are not cross-instances of each other', () => {
    const auth = new BackendAuthError();
    const network = new BackendNetworkError();
    const validation = new BackendValidationError();

    expect(auth).not.toBeInstanceOf(BackendNetworkError);
    expect(auth).not.toBeInstanceOf(BackendValidationError);
    expect(network).not.toBeInstanceOf(BackendAuthError);
    expect(validation).not.toBeInstanceOf(BackendNetworkError);
  });
});
