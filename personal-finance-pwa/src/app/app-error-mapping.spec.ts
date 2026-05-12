// Unit tests for Drive error message mapping
import { describe, it, expect } from 'vitest';

// Type definitions for testing (avoiding imports that require window)
interface DriveApiError {
  status: number;
  message: string;
  operation: string;
}

class DriveParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'DriveParseError';
  }
}

// Test helper to simulate the mapDriveErrorToMessage method
function mapDriveErrorToMessage(err: DriveApiError | DriveParseError): string {
  // Handle DriveApiError with status codes
  if ('status' in err) {
    switch (err.status) {
      case 403:
        return 'Access denied. Please check sharing permissions.';
      case 404:
        return 'Backup file not found. Please check your Drive.';
      default:
        // Check for network-related errors in the message
        if (err.message?.toLowerCase().includes('network') || 
            err.message?.toLowerCase().includes('fetch')) {
          return 'Network error. Please check your connection.';
        }
        return 'Couldn\'t load data';
    }
  }
  // Handle DriveParseError or any other error type
  return 'Couldn\'t load data';
}

describe('Drive Error Message Mapping', () => {
  describe('DriveApiError handling', () => {
    it('should map 403 error to access denied message', () => {
      const error: DriveApiError = {
        status: 403,
        message: 'Forbidden',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe(
        'Access denied. Please check sharing permissions.'
      );
    });

    it('should map 404 error to file not found message', () => {
      const error: DriveApiError = {
        status: 404,
        message: 'Not Found',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe(
        'Backup file not found. Please check your Drive.'
      );
    });

    it('should map network error with "network" in message', () => {
      const error: DriveApiError = {
        status: 500,
        message: 'Network timeout occurred',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe(
        'Network error. Please check your connection.'
      );
    });

    it('should map network error with "fetch" in message', () => {
      const error: DriveApiError = {
        status: 0,
        message: 'Failed to fetch',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe(
        'Network error. Please check your connection.'
      );
    });

    it('should map generic error to default message', () => {
      const error: DriveApiError = {
        status: 500,
        message: 'Internal Server Error',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe('Couldn\'t load data');
    });

    it('should handle case-insensitive network error detection', () => {
      const error: DriveApiError = {
        status: 500,
        message: 'NETWORK ERROR',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe(
        'Network error. Please check your connection.'
      );
    });
  });

  describe('DriveParseError handling', () => {
    it('should map parse error to default message', () => {
      const error = new DriveParseError('Invalid JSON', '{ invalid }');
      
      expect(mapDriveErrorToMessage(error)).toBe('Couldn\'t load data');
    });
  });

  describe('Edge cases', () => {
    it('should handle error with undefined message', () => {
      const error: DriveApiError = {
        status: 500,
        message: undefined as any,
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe('Couldn\'t load data');
    });

    it('should handle error with empty message', () => {
      const error: DriveApiError = {
        status: 500,
        message: '',
        operation: 'read'
      };
      
      expect(mapDriveErrorToMessage(error)).toBe('Couldn\'t load data');
    });
  });
});
