interface TraccionAtomicTicketRemovalRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

interface TraccionAtomicTicketRemovalPayload {
  calendar: TraccionAtomicTicketRemovalRecord;
  people: TraccionAtomicTicketRemovalRecord[];
}

interface TraccionAtomicTicketRemovalResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  message: string;
  failedRecordId?: string;
}

interface TraccionApi {
  removeTicketRestauranteCalendarWithPeopleAtomically?: (
    payload: TraccionAtomicTicketRemovalPayload,
  ) => Promise<TraccionAtomicTicketRemovalResult>;
}
