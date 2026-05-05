export interface SheetsApiError {
  status: number;    // HTTP status code
  message: string;
  operation: string; // which API call failed
}
