interface TraccionAtomicTicketImportRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

interface TraccionAtomicTicketImportPayload {
  calendars: TraccionAtomicTicketImportRecord[];
  people: TraccionAtomicTicketImportRecord[];
}

interface TraccionAtomicTicketImportResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  message: string;
  failedRecordId?: string;
}

interface TraccionApi {
  importTicketRestaurantePeopleAtomically?: (
    payload: TraccionAtomicTicketImportPayload,
  ) => Promise<TraccionAtomicTicketImportResult>;
}
