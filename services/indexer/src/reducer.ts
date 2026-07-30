export const REDUCER_VERSION = 1;

export type LifecyclePhase =
  'open' | 'aggregate-pending' | 'resolution-pending' | 'settled' | 'refundable';

export interface EventCursor {
  blockNumber: bigint;
  blockHash: `0x${string}`;
  logIndex: number;
  transactionHash: `0x${string}`;
}

export type PublicLifecycleEvent =
  | (EventCursor & { kind: 'epoch-opened'; deadline: bigint; minimumParticipants: number })
  | (EventCursor & { kind: 'epoch-closed'; participantCount: number })
  | (EventCursor & { kind: 'aggregate-requested'; requestId: `0x${string}` })
  | (EventCursor & { kind: 'refunded' })
  | (EventCursor & {
      kind: 'aggregate-finalized';
      requestId: `0x${string}`;
      publicYes: bigint;
      publicNo: bigint;
    })
  | (EventCursor & {
      kind: 'settlement-finalized';
      winner: 1 | 2;
      roundId: bigint;
      answer: bigint;
    });

export interface PublicReadModel {
  phase: LifecyclePhase;
  deadline: bigint;
  minimumParticipants: number;
  participantCount: number;
  aggregateRequestId: `0x${string}` | null;
  publicYes: bigint;
  publicNo: bigint;
  winner: 0 | 1 | 2;
  settledRoundId: bigint;
  settledAnswer: bigint;
  cursor: EventCursor | null;
}

export interface ReadModelCheckpoint {
  schemaVersion: 1;
  reducerVersion: typeof REDUCER_VERSION;
  chainId: 11_155_111;
  manifestHash: `0x${string}`;
  blockNumber: string;
  blockHash: `0x${string}`;
  model: ReturnType<typeof serializeReadModel>;
}

function fail(message: string): never {
  throw new Error(`Read model reducer failed: ${message}`);
}

function assertCursor(cursor: EventCursor, previous: EventCursor | null): void {
  if (cursor.blockNumber < 0n || cursor.logIndex < 0 || !Number.isSafeInteger(cursor.logIndex))
    fail('cursor is invalid.');
  if (!previous) return;
  if (
    cursor.blockNumber < previous.blockNumber ||
    (cursor.blockNumber === previous.blockNumber && cursor.logIndex <= previous.logIndex)
  ) {
    fail('events must be strictly ordered and unique.');
  }
}

export function emptyReadModel(): PublicReadModel {
  return {
    phase: 'open',
    deadline: 0n,
    minimumParticipants: 0,
    participantCount: 0,
    aggregateRequestId: null,
    publicYes: 0n,
    publicNo: 0n,
    winner: 0,
    settledRoundId: 0n,
    settledAnswer: 0n,
    cursor: null,
  };
}

export function reducePublicEvent(
  model: PublicReadModel,
  event: PublicLifecycleEvent,
): PublicReadModel {
  assertCursor(event, model.cursor);
  const next = {
    ...model,
    cursor: {
      blockNumber: event.blockNumber,
      blockHash: event.blockHash,
      logIndex: event.logIndex,
      transactionHash: event.transactionHash,
    },
  };
  switch (event.kind) {
    case 'epoch-opened':
      if (model.deadline !== 0n || event.deadline <= 0n || event.minimumParticipants < 1)
        fail('epoch opening is invalid.');
      return {
        ...next,
        phase: 'open',
        deadline: event.deadline,
        minimumParticipants: event.minimumParticipants,
      };
    case 'epoch-closed':
      if (model.phase !== 'open' || model.deadline === 0n) fail('epoch close is invalid.');
      if (event.participantCount < 0 || !Number.isSafeInteger(event.participantCount))
        fail('participant count is invalid.');
      return event.participantCount < model.minimumParticipants
        ? { ...next, phase: 'refundable', participantCount: event.participantCount }
        : { ...next, phase: 'aggregate-pending', participantCount: event.participantCount };
    case 'aggregate-requested':
      if (model.phase !== 'aggregate-pending' || model.aggregateRequestId !== null)
        fail('aggregate request is invalid.');
      return { ...next, aggregateRequestId: event.requestId };
    case 'refunded':
      // The contract emits this only after its state-gated terminal operation.
      // It is the public terminal signal for below-k, aggregate-timeout, or
      // resolution-grace recovery; it reveals neither an amount nor a participant view.
      if (
        model.phase !== 'refundable' &&
        model.phase !== 'aggregate-pending' &&
        model.phase !== 'resolution-pending'
      ) {
        fail('refund transition is invalid.');
      }
      return { ...next, phase: 'refundable' };
    case 'aggregate-finalized':
      if (model.phase !== 'aggregate-pending' || model.aggregateRequestId !== event.requestId)
        fail('aggregate finalization is invalid.');
      if (event.publicYes < 0n || event.publicNo < 0n) fail('public totals are invalid.');
      return {
        ...next,
        phase: 'resolution-pending',
        publicYes: event.publicYes,
        publicNo: event.publicNo,
      };
    case 'settlement-finalized':
      if (model.phase !== 'resolution-pending') fail('settlement is invalid.');
      if (event.roundId <= 0n || (event.winner !== 1 && event.winner !== 2))
        fail('settlement facts are invalid.');
      return {
        ...next,
        phase: 'settled',
        winner: event.winner,
        settledRoundId: event.roundId,
        settledAnswer: event.answer,
      };
  }
}

export function replayPublicEvents(events: readonly PublicLifecycleEvent[]): PublicReadModel {
  return events.reduce(reducePublicEvent, emptyReadModel());
}

export function serializeReadModel(model: PublicReadModel): Record<string, string | number | null> {
  return {
    phase: model.phase,
    deadline: model.deadline.toString(),
    minimumParticipants: model.minimumParticipants,
    participantCount: model.participantCount,
    aggregateRequestId: model.aggregateRequestId,
    publicYes: model.publicYes.toString(),
    publicNo: model.publicNo.toString(),
    winner: model.winner,
    settledRoundId: model.settledRoundId.toString(),
    settledAnswer: model.settledAnswer.toString(),
  };
}

export function createCheckpoint(input: {
  manifestHash: `0x${string}`;
  model: PublicReadModel;
}): ReadModelCheckpoint {
  if (!input.model.cursor) fail('cannot checkpoint without an event cursor.');
  return {
    schemaVersion: 1,
    reducerVersion: REDUCER_VERSION,
    chainId: 11_155_111,
    manifestHash: input.manifestHash,
    blockNumber: input.model.cursor.blockNumber.toString(),
    blockHash: input.model.cursor.blockHash,
    model: serializeReadModel(input.model),
  };
}
