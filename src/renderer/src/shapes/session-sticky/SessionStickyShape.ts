import {
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  RecordProps,
  RecordPropsType,
  T,
  TLShape,
} from 'tldraw';

export const SESSION_STICKY_TYPE = 'session-sticky';

export const sessionStickyShapeProps = {
  w: T.number,
  h: T.number,
  sessionId: T.string,
  provider: T.string,
  label: T.string,
  transcriptPath: T.string,
  recentPrompt: T.string,
  lastResponse: T.string,
  state: T.string,
  cwd: T.string,
  pid: T.number,
  tty: T.string,
  lastAction: T.string,
  lastEvent: T.string,
  createdAt: T.string,
  updatedAt: T.string,
  stateChangedAt: T.string,
  endedAt: T.string,
  thoughts: T.string,
  closed: T.boolean,
};

export type SessionStickyShapeProps = RecordPropsType<typeof sessionStickyShapeProps>;

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    [SESSION_STICKY_TYPE]: SessionStickyShapeProps;
  }
}

export type SessionStickyShape = TLShape<typeof SESSION_STICKY_TYPE>;

export const sessionStickyShapeRecordProps: RecordProps<SessionStickyShape> = sessionStickyShapeProps;

const sessionStickyShapeVersions = createShapePropsMigrationIds(SESSION_STICKY_TYPE, {
  AddRecentPrompt: 1,
  AddSessionDetails: 2,
  AddLastResponse: 3,
  AddProvider: 4,
});

export const sessionStickyShapeMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: sessionStickyShapeVersions.AddRecentPrompt,
      up: (props) => {
        props.recentPrompt ??= '';
      },
      down: 'retired',
    },
    {
      id: sessionStickyShapeVersions.AddSessionDetails,
      up: (props) => {
        props.transcriptPath ??= '';
        props.pid ??= 0;
        props.tty ??= '';
      },
      down: 'retired',
    },
    {
      id: sessionStickyShapeVersions.AddLastResponse,
      up: (props) => {
        props.lastResponse ??= '';
      },
      down: 'retired',
    },
    {
      id: sessionStickyShapeVersions.AddProvider,
      up: (props) => {
        props.provider ??= '';
      },
      down: 'retired',
    },
  ],
});
